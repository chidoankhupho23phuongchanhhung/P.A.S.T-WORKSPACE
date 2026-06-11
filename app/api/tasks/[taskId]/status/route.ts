// app/api/tasks/[taskId]/status/route.ts
// 🔒 Security: assignee đổi status của task mình; admin/leader đổi mọi task

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

const VALID_STATUSES = ['todo', 'in_progress', 'review', 'done'] as const
type TaskStatus = typeof VALID_STATUSES[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  // 🔒 Xác thực
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 🔒 Lấy role của user
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  })
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  let body: { status: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // 🔒 Validate status value
  if (!VALID_STATUSES.includes(body.status as TaskStatus)) {
    return NextResponse.json(
      { error: `Trạng thái không hợp lệ. Hợp lệ: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const { taskId } = params

  try {
    // Lấy task để kiểm tra quyền
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, assigneeId: true, status: true },
    })

    if (!task) {
      return NextResponse.json({ error: 'Task không tồn tại' }, { status: 404 })
    }

    // 🔒 Chỉ assignee hoặc admin/leader mới được đổi status
    const isAssignee = task.assigneeId === user.id
    const isPrivileged = ['admin', 'leader'].includes(profile.role)

    if (!isAssignee && !isPrivileged) {
      return NextResponse.json(
        { error: 'Forbidden — bạn không có quyền đổi trạng thái task này' },
        { status: 403 }
      )
    }

    // 🔒 Member chỉ được chuyển tiếp (không được quay lại)
    if (profile.role === 'member' && !isPrivileged) {
      const ORDER: Record<TaskStatus, number> = {
        todo: 0, in_progress: 1, review: 2, done: 3,
      }
      const currentOrder = ORDER[task.status as TaskStatus] ?? 0
      const newOrder = ORDER[body.status as TaskStatus] ?? 0
      if (newOrder < currentOrder) {
        return NextResponse.json(
          { error: 'Thành viên không được quay lại trạng thái cũ hơn' },
          { status: 403 }
        )
      }
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { status: body.status as TaskStatus },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        assignee: { select: { id: true, fullName: true } },
      },
    })

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    })

  } catch (err) {
    console.error('[PATCH /api/tasks/[taskId]/status]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
