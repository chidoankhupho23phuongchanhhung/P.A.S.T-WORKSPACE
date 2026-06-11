// app/api/channels/[channelId]/messages/route.ts
// 🔒 Security: Supabase Auth + Prisma — user chỉ thấy channel họ có quyền truy cập

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  // 🔒 Xác thực user
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channelId } = params
  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100)

  try {
    // 🔒 Kiểm tra quyền truy cập channel
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        members: { where: { userId: user.id }, select: { id: true } },
      },
    })

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    // PRIVATE channel: chỉ member mới được xem
    if (channel.type === 'PRIVATE' && channel.members.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Lấy messages (chỉ top-level, không lấy replies)
    const messages = await prisma.message.findMany({
      where: {
        channelId,
        parentId: null, // chỉ lấy tin nhắn gốc
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        sender: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        readStatus: {
          select: { userId: true, readAt: true },
        },
        // Đếm số replies mà không lấy nội dung
        _count: { select: { replies: true } },
      },
    })

    // Chuẩn hóa output
    const result = messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      channelId: m.channelId,
      parentId: m.parentId,
      isTaskCard: m.isTaskCard,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      sender: m.sender,
      readStatus: m.readStatus.map((r) => ({
        userId: r.userId,
        readAt: r.readAt.toISOString(),
      })),
      replyCount: m._count.replies,
    }))

    return NextResponse.json(result, {
      headers: {
        // Không cache — nội dung realtime
        'Cache-Control': 'no-store, no-cache',
      },
    })
  } catch (err) {
    console.error('[GET /api/channels/[id]/messages]', err)
    // 🔒 Không lộ chi tiết lỗi ra ngoài
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  // 🔒 Xác thực
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channelId } = params

  let body: { content: string; parentId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 🔒 Validate input — không để XSS hoặc nội dung rỗng
  const content = body.content?.trim()
  if (!content || content.length === 0) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }
  if (content.length > 4000) {
    return NextResponse.json({ error: 'Content too long (max 4000 chars)' }, { status: 400 })
  }

  try {
    // 🔒 Kiểm tra quyền gửi tin nhắn
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        members: { where: { userId: user.id }, select: { id: true } },
      },
    })

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    if (channel.type === 'PRIVATE' && channel.members.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Validate parentId nếu có
    if (body.parentId) {
      const parent = await prisma.message.findUnique({
        where: { id: body.parentId, channelId },
        select: { id: true },
      })
      if (!parent) {
        return NextResponse.json({ error: 'Parent message not found' }, { status: 404 })
      }
    }

    const message = await prisma.message.create({
      data: {
        content,
        channelId,
        senderId: user.id, // 🔒 Luôn dùng auth.uid(), không tin client
        parentId: body.parentId ?? null,
      },
      include: {
        sender: { select: { id: true, fullName: true, avatarUrl: true } },
        readStatus: { select: { userId: true, readAt: true } },
      },
    })

    return NextResponse.json({
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      channelId: message.channelId,
      parentId: message.parentId,
      isTaskCard: message.isTaskCard,
      createdAt: message.createdAt.toISOString(),
      editedAt: null,
      sender: message.sender,
      readStatus: [],
      replyCount: 0,
    }, { status: 201 })

  } catch (err) {
    console.error('[POST /api/channels/[id]/messages]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
