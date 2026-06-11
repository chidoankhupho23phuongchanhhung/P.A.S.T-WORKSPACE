// app/api/tasks/from-message/route.ts
// 🔒 Security: Chỉ admin/leader mới tạo task từ message

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  // 🔒 Xác thực
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 🔒 Kiểm tra role — chỉ admin/leader
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  })
  if (!profile || !['admin', 'leader'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden — chỉ admin/leader mới tạo task được' }, { status: 403 })
  }

  let body: {
    messageId: string
    channelId: string
    title: string
    description?: string
    assigneeId: string
    dueDate?: string
  }

  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // 🔒 Validate input
  const { messageId, channelId, title, description, assigneeId, dueDate } = body

  if (!messageId || !channelId || !title?.trim() || !assigneeId) {
    return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
  }

  if (title.trim().length > 200) {
    return NextResponse.json({ error: 'Tiêu đề tối đa 200 ký tự' }, { status: 400 })
  }

  if (dueDate) {
    const d = new Date(dueDate)
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: 'dueDate không hợp lệ' }, { status: 400 })
    }
  }

  try {
    // Kiểm tra message tồn tại và thuộc channel
    const message = await prisma.message.findUnique({
      where: { id: messageId, channelId },
      select: { id: true, isTaskCard: true },
    })

    if (!message) {
      return NextResponse.json({ error: 'Tin nhắn không tồn tại' }, { status: 404 })
    }
    if (message.isTaskCard) {
      return NextResponse.json({ error: 'Tin nhắn này đã là thẻ công việc' }, { status: 409 })
    }

    // Kiểm tra assignee tồn tại
    const assignee = await prisma.profile.findUnique({
      where: { id: assigneeId },
      select: { id: true, fullName: true, avatarUrl: true },
    })
    if (!assignee) {
      return NextResponse.json({ error: 'Người phụ trách không tồn tại' }, { status: 404 })
    }

    // Transaction: tạo Task + cập nhật isTaskCard = true cùng lúc
    const [task] = await prisma.$transaction([
      prisma.task.create({
        data: {
          title: title.trim(),
          description: description?.trim() ?? null,
          assigneeId,
          reporterId: user.id, // 🔒 luôn là người đang đăng nhập
          dueDate: dueDate ? new Date(dueDate) : null,
          status: 'todo',
          sourceMessageId: messageId,
        },
      }),
      prisma.message.update({
        where: { id: messageId },
        data: { isTaskCard: true },
      }),
    ])

    return NextResponse.json({
      id: task.id,
      title: task.title,
      description: task.description,
      assigneeId: task.assigneeId,
      assignee: {
        id: assignee.id,
        fullName: assignee.fullName,
        avatarUrl: assignee.avatarUrl,
      },
      dueDate: task.dueDate?.toISOString().split('T')[0] ?? undefined,
      status: task.status,
      sourceMessageId: messageId,
    }, { status: 201 })

  } catch (err) {
    console.error('[POST /api/tasks/from-message]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


// ─────────────────────────────────────────────────────────────
// app/api/tasks/[taskId]/status/route.ts
// 🔒 Security: assignee đổi status của task mình; admin/leader đổi mọi task
// ─────────────────────────────────────────────────────────────

export async function PATCH_STATUS(
  req: NextRequest,
  taskId: string,
  userId: string,
  userRole: string
) {
  let body: { status: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const VALID_STATUSES = ['todo', 'in_progress', 'review', 'done']
  if (!VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })
  }

  // Lấy task để kiểm tra quyền
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, assigneeId: true, status: true },
  })

  if (!task) return NextResponse.json({ error: 'Task không tồn tại' }, { status: 404 })

  // 🔒 Chỉ assignee hoặc admin/leader mới được đổi status
  const isAssignee = task.assigneeId === userId
  const isPrivileged = ['admin', 'leader'].includes(userRole)
  if (!isAssignee && !isPrivileged) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { status: body.status as any },
    select: { id: true, status: true },
  })

  return NextResponse.json(updated)
}
