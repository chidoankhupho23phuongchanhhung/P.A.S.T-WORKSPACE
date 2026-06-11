// app/api/events/[eventId]/attendance/route.ts
// 🔒 Security: User chỉ được cập nhật RSVP của chính mình (đối chiếu auth.uid())
// 🔒 Excuse là bắt buộc khi status = 'no' (đồng bộ với DB CHECK constraint)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { AttendanceStatus } from '@prisma/client'

const VALID_ATTENDANCE_STATUSES: AttendanceStatus[] = ['pending', 'yes', 'no']

export async function POST(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  // 🔒 Xác thực người dùng
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = params

  // Kiểm tra xem sự kiện có tồn tại không
  const eventExists = await prisma.event.findUnique({
    where: { id: eventId },
  })
  if (!eventExists) {
    return NextResponse.json({ error: 'Sự kiện không tồn tại' }, { status: 404 })
  }

  let body: {
    status: string
    excuse?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate status
  if (!VALID_ATTENDANCE_STATUSES.includes(body.status as AttendanceStatus)) {
    return NextResponse.json(
      { error: `Trạng thái không hợp lệ. Hợp lệ: ${VALID_ATTENDANCE_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const status = body.status as AttendanceStatus

  // 🔒 Bắt buộc điền excuse khi status = 'no'
  if (status === 'no' && (!body.excuse || typeof body.excuse !== 'string' || body.excuse.trim() === '')) {
    return NextResponse.json(
      { error: 'Bạn bắt buộc phải giải trình lý do khi chọn không tham gia' },
      { status: 400 }
    )
  }

  const excuseText = status === 'no' ? body.excuse!.trim() : null

  try {
    // 🔒 Upsert bản ghi điểm danh, userId luôn là user.id từ Auth
    const attendance = await prisma.eventAttendance.upsert({
      where: {
        eventId_userId: {
          eventId: eventId,
          userId: user.id,
        },
      },
      update: {
        status,
        excuse: excuseText,
      },
      create: {
        eventId,
        userId: user.id,
        status,
        excuse: excuseText,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    })

    return NextResponse.json(attendance)
  } catch (err) {
    console.error(`[POST /api/events/${eventId}/attendance]`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
