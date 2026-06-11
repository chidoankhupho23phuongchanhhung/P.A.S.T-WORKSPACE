-- ============================================================
-- rls.sql — Row Level Security cho P.A.S.T WORKSPACE
-- Áp dụng trên Supabase PostgreSQL
-- Chạy file này trong Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. Helper function: lấy role của user đang đăng nhập
-- SECURITY DEFINER để bypass RLS khi đọc bảng profiles
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::TEXT FROM public.profiles WHERE id = auth.uid();
$$;

-- ────────────────────────────────────────────────────────────
-- 1. BẬT RLS TOÀN BỘ CÁC BẢNG
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_read_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_performance ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════
-- BẢNG: profiles
-- ════════════════════════════════════════════════════════════

-- Mọi user đã đăng nhập đều xem được profile
CREATE POLICY "profiles: authenticated can SELECT"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- Mỗi user chỉ tự UPDATE profile của mình
CREATE POLICY "profiles: users can UPDATE own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Không cho phép tự thay đổi role (chỉ admin mới được)
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

-- Chỉ admin được thay đổi role của người khác
CREATE POLICY "profiles: admin can UPDATE any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING  (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ════════════════════════════════════════════════════════════
-- BẢNG: channels
-- ════════════════════════════════════════════════════════════

-- PUBLIC channel: mọi user đã login đều thấy
-- PRIVATE channel: chỉ thành viên trong channel_members thấy
CREATE POLICY "channels: SELECT based on type and membership"
  ON public.channels FOR SELECT TO authenticated
  USING (
    type = 'PUBLIC'
    OR EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_id = channels.id AND user_id = auth.uid()
    )
  );

-- Admin/Leader mới được tạo channel
CREATE POLICY "channels: admin and leader can INSERT"
  ON public.channels FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'leader'));

-- Chủ channel hoặc admin mới được sửa/xóa
CREATE POLICY "channels: owner or admin can UPDATE"
  ON public.channels FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.get_my_role() = 'admin');

CREATE POLICY "channels: owner or admin can DELETE"
  ON public.channels FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.get_my_role() = 'admin');

-- ════════════════════════════════════════════════════════════
-- BẢNG: channel_members
-- ════════════════════════════════════════════════════════════

CREATE POLICY "channel_members: members can SELECT"
  ON public.channel_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'leader')
  );

CREATE POLICY "channel_members: admin/leader can INSERT"
  ON public.channel_members FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'leader'));

CREATE POLICY "channel_members: admin/leader can DELETE"
  ON public.channel_members FOR DELETE TO authenticated
  USING (public.get_my_role() IN ('admin', 'leader'));

-- ════════════════════════════════════════════════════════════
-- BẢNG: messages
-- ════════════════════════════════════════════════════════════

-- Chỉ thấy message trong channel mình có quyền truy cập
CREATE POLICY "messages: SELECT for accessible channels"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = messages.channel_id
        AND (
          c.type = 'PUBLIC'
          OR EXISTS (
            SELECT 1 FROM public.channel_members cm
            WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
          )
        )
    )
  );

-- Chỉ thành viên của channel mới gửi được tin nhắn
CREATE POLICY "messages: channel members can INSERT"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = channel_id
        AND (
          c.type = 'PUBLIC'
          OR EXISTS (
            SELECT 1 FROM public.channel_members cm
            WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
          )
        )
    )
  );

-- Chỉ người gửi mới được sửa message của mình
CREATE POLICY "messages: sender can UPDATE own message"
  ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- Người gửi hoặc admin mới được xóa
CREATE POLICY "messages: sender or admin can DELETE"
  ON public.messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR public.get_my_role() = 'admin');

-- ════════════════════════════════════════════════════════════
-- BẢNG: message_read_status
-- ════════════════════════════════════════════════════════════

CREATE POLICY "read_status: users manage own records"
  ON public.message_read_status FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- BẢNG: pinned_items
-- ════════════════════════════════════════════════════════════

CREATE POLICY "pinned_items: SELECT for accessible channels"
  ON public.pinned_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = pinned_items.channel_id
        AND (
          c.type = 'PUBLIC'
          OR EXISTS (
            SELECT 1 FROM public.channel_members cm
            WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "pinned_items: admin/leader can INSERT"
  ON public.pinned_items FOR INSERT TO authenticated
  WITH CHECK (
    public.get_my_role() IN ('admin', 'leader')
    AND pinned_by_id = auth.uid()
  );

CREATE POLICY "pinned_items: admin/leader can DELETE"
  ON public.pinned_items FOR DELETE TO authenticated
  USING (public.get_my_role() IN ('admin', 'leader'));

-- ════════════════════════════════════════════════════════════
-- BẢNG: tasks
-- ════════════════════════════════════════════════════════════

-- Mọi thành viên đều xem được task
CREATE POLICY "tasks: authenticated can SELECT"
  ON public.tasks FOR SELECT TO authenticated
  USING (true);

-- Admin/Leader tạo task gốc; Leader tạo task con
CREATE POLICY "tasks: admin/leader can INSERT"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'leader'));

-- Admin/Leader sửa mọi task; Member chỉ sửa task được giao
CREATE POLICY "tasks: admin/leader can UPDATE any"
  ON public.tasks FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('admin', 'leader'));

CREATE POLICY "tasks: assignee can UPDATE own task status"
  ON public.tasks FOR UPDATE TO authenticated
  USING (
    assignee_id = auth.uid()
    AND public.get_my_role() = 'member'
  )
  WITH CHECK (
    assignee_id = auth.uid()
    -- Member chỉ được cập nhật status, không được đổi assignee
    AND assignee_id = (SELECT assignee_id FROM public.tasks WHERE id = tasks.id)
  );

-- Chỉ admin mới xóa được task
CREATE POLICY "tasks: only admin can DELETE"
  ON public.tasks FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- ════════════════════════════════════════════════════════════
-- BẢNG: events
-- YÊU CẦU: Chỉ admin INSERT/UPDATE/DELETE; Tất cả SELECT
-- ════════════════════════════════════════════════════════════

-- ✅ Tất cả user đăng nhập đều xem được sự kiện
CREATE POLICY "events: authenticated users can SELECT"
  ON public.events FOR SELECT TO authenticated
  USING (true);

-- 🔒 Chỉ admin mới được tạo sự kiện
CREATE POLICY "events: only admin can INSERT"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    public.get_my_role() = 'admin'
    AND created_by_id = auth.uid()
  );

-- 🔒 Chỉ admin mới được cập nhật sự kiện
CREATE POLICY "events: only admin can UPDATE"
  ON public.events FOR UPDATE TO authenticated
  USING  (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- 🔒 Chỉ admin mới được xóa sự kiện
CREATE POLICY "events: only admin can DELETE"
  ON public.events FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- ════════════════════════════════════════════════════════════
-- BẢNG: event_attendance
-- YÊU CẦU: User chỉ UPDATE dòng có userId = auth.uid()
--          Nếu status = 'no' thì excuse bắt buộc (bảo vệ 2 lớp)
-- ════════════════════════════════════════════════════════════

-- Mọi user xem được danh sách điểm danh
CREATE POLICY "attendance: authenticated can SELECT"
  ON public.event_attendance FOR SELECT TO authenticated
  USING (true);

-- User tự INSERT bản ghi điểm danh của mình
CREATE POLICY "attendance: users can INSERT own record"
  ON public.event_attendance FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 🔒 Mỗi user chỉ UPDATE đúng bản ghi của mình
--    + Nếu status = 'no' thì excuse không được null/rỗng
CREATE POLICY "attendance: users can UPDATE own record only"
  ON public.event_attendance FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- Bảo vệ 2 lớp: excuse bắt buộc khi vắng mặt
    AND (
      status <> 'no'
      OR (excuse IS NOT NULL AND TRIM(excuse) <> '')
    )
  );

-- Chỉ admin mới được xóa bản ghi điểm danh
CREATE POLICY "attendance: only admin can DELETE"
  ON public.event_attendance FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- CHECK constraint: bảo vệ thêm ở tầng DB (không phụ thuộc vào RLS)
ALTER TABLE public.event_attendance
  ADD CONSTRAINT excuse_required_when_absent
  CHECK (
    status::TEXT <> 'no'
    OR (excuse IS NOT NULL AND TRIM(excuse) <> '')
  );

-- ════════════════════════════════════════════════════════════
-- BẢNG: proposals
-- ════════════════════════════════════════════════════════════

-- Mọi thành viên đều xem được đề xuất
CREATE POLICY "proposals: authenticated can SELECT"
  ON public.proposals FOR SELECT TO authenticated
  USING (true);

-- Mọi thành viên đều được nộp đề xuất
CREATE POLICY "proposals: authenticated can INSERT"
  ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (submitted_by_id = auth.uid());

-- Người nộp sửa đề xuất khi còn pending; admin duyệt/từ chối
CREATE POLICY "proposals: submitter can UPDATE pending proposal"
  ON public.proposals FOR UPDATE TO authenticated
  USING (
    (submitted_by_id = auth.uid() AND status = 'pending')
    OR public.get_my_role() = 'admin'
  );

-- Chỉ admin xóa đề xuất
CREATE POLICY "proposals: only admin can DELETE"
  ON public.proposals FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- CHECK: reject_reason bắt buộc khi status = 'rejected'
ALTER TABLE public.proposals
  ADD CONSTRAINT reject_reason_required
  CHECK (
    status::TEXT <> 'rejected'
    OR (reject_reason IS NOT NULL AND TRIM(reject_reason) <> '')
  );

-- ════════════════════════════════════════════════════════════
-- BẢNG: member_performance
-- ════════════════════════════════════════════════════════════

-- Mọi thành viên đều xem được bảng hiệu suất (tính minh bạch)
CREATE POLICY "performance: authenticated can SELECT"
  ON public.member_performance FOR SELECT TO authenticated
  USING (true);

-- Chỉ admin/leader mới ghi dữ liệu hiệu suất
CREATE POLICY "performance: admin/leader can INSERT"
  ON public.member_performance FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'leader'));

CREATE POLICY "performance: admin/leader can UPDATE metrics"
  ON public.member_performance FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('admin', 'leader'));

-- Thành viên chỉ được tự nộp explanation của mình
CREATE POLICY "performance: member can UPDATE own explanation"
  ON public.member_performance FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.get_my_role() = 'member'
  )
  WITH CHECK (
    user_id = auth.uid()
    -- Member chỉ được thay đổi explanation, không được sửa điểm số
    AND tasks_completed    = (SELECT tasks_completed FROM public.member_performance WHERE id = member_performance.id)
    AND events_attended    = (SELECT events_attended FROM public.member_performance WHERE id = member_performance.id)
    AND quality_score      = (SELECT quality_score FROM public.member_performance WHERE id = member_performance.id)
    AND progress_percent   = (SELECT progress_percent FROM public.member_performance WHERE id = member_performance.id)
  );

-- Chỉ admin xóa
CREATE POLICY "performance: only admin can DELETE"
  ON public.member_performance FOR DELETE TO authenticated
  USING (public.get_my_role() = 'admin');

-- ════════════════════════════════════════════════════════════
-- SEED: Sau khi có user đầu tiên đăng ký, cấp quyền admin
-- Chạy thủ công một lần:
-- UPDATE public.profiles SET role = 'admin' WHERE id = '<your-uuid>';
-- ════════════════════════════════════════════════════════════
