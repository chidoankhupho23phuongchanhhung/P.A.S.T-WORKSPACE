// app/api/tasks/route.ts
// 🔒 Security: GET (tất cả user đã login); POST (chỉ admin/leader tạo task)

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { TaskStatus } from '@prisma/client'

export async function GET(req: NextRequest) {
  // 🔒 Xác thực người dùng
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tasks = await prisma.task.findMany({
      include: {
        assignee: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        reporter: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    return NextResponse.json(tasks)
  } catch (err) {
    console.error('[GET /api/tasks]', err)
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

  // 🔒 Lấy role để kiểm tra phân quyền
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  })

  if (!profile || !['admin', 'leader'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Forbidden — Chỉ Trưởng ban hoặc Leader mới được quyền tạo task' },
      { status: 403 }
    )
  }

  let body: {
    title: string
    description?: string
    parentId?: string
    assigneeId?: string
    dueDate?: string
    status?: TaskStatus
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate title
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return NextResponse.json({ error: 'Tiêu đề công việc là bắt buộc' }, { status: 400 })
  }

  // Validate parent task if provided
  if (body.parentId) {
    const parentTask = await prisma.task.findUnique({
      where: { id: body.parentId },
    })
    if (!parentTask) {
      return NextResponse.json({ error: 'Task cha không tồn tại' }, { status: 400 })
    }
  }

  // Validate assignee if provided
  if (body.assigneeId) {
    const assigneeProfile = await prisma.profile.findUnique({
      where: { id: body.assigneeId },
    })
    if (!assigneeProfile) {
      return NextResponse.json({ error: 'Người phụ trách không tồn tại' }, { status: 400 })
    }
  }

  try {
    const newTask = await prisma.task.create({
      data: {
        title: body.title.trim(),
        description: body.description?.trim(),
        parentId: body.parentId || null,
        assigneeId: body.assigneeId || null,
        reporterId: user.id, // Người tạo task
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        status: body.status || 'todo',
      },
      include: {
        assignee: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        reporter: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    })

    return NextResponse.json(newTask, { status: 201 })
  } catch (err) {
    console.error('[POST /api/tasks]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
