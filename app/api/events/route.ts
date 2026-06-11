// app/api/events/route.ts
// 🔒 Security: GET (tất cả user đã login); POST (chỉ admin mới được tạo event)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  // 🔒 Xác thực người dùng
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const events = await prisma.event.findMany({
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        attendance: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    })

    return NextResponse.json(events)
  } catch (err) {
    console.error('[GET /api/events]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  // 🔒 Xác thực người dùng
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 🔒 Lấy role để kiểm tra phân quyền (Chỉ admin)
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  })

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden — Chỉ Trưởng ban (Admin) mới có quyền tạo lịch công tác' },
      { status: 403 }
    )
  }

  let body: {
    title: string
    content?: string
    location?: string
    startTime: string
    endTime: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate inputs
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return NextResponse.json({ error: 'Tiêu đề sự kiện là bắt buộc' }, { status: 400 })
  }
  if (!body.startTime || !body.endTime) {
    return NextResponse.json({ error: 'Thời gian bắt đầu và kết thúc là bắt buộc' }, { status: 400 })
  }

  const start = new Date(body.startTime)
  const end = new Date(body.endTime)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Định dạng thời gian không hợp lệ' }, { status: 400 })
  }

  if (start >= end) {
    return NextResponse.json({ error: 'Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc' }, { status: 400 })
  }

  try {
    const newEvent = await prisma.event.create({
      data: {
        title: body.title.trim(),
        content: body.content?.trim() || null,
        location: body.location?.trim() || null,
        startTime: start,
        endTime: end,
        createdById: user.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        attendance: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json(newEvent, { status: 201 })
  } catch (err) {
    console.error('[POST /api/events]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
