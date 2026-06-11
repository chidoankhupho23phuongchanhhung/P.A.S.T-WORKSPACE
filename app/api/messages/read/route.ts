// app/api/messages/read/route.ts — Read Receipts API
// 🔒 Security: user chỉ mark read cho chính mình

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { messageIds: string[] }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { messageIds } = body
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return NextResponse.json({ error: 'messageIds required' }, { status: 400 })
  }

  // 🔒 Giới hạn batch size
  const safeIds = messageIds.slice(0, 100)

  try {
    // Upsert — bỏ qua nếu đã đọc (không overwrite readAt)
    await prisma.messageReadStatus.createMany({
      data: safeIds.map((messageId) => ({
        messageId,
        userId: user.id, // 🔒 Luôn dùng auth.uid()
      })),
      skipDuplicates: true,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/messages/read]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


// ─── app/api/messages/[messageId]/replies/route.ts ──────────
// Tách ra file riêng nhưng viết chung để tiện theo dõi

// GET /api/messages/:id/replies
export async function GET_REPLIES(
  req: NextRequest,
  messageId: string,
  userId: string
) {
  const replies = await prisma.message.findMany({
    where: { parentId: messageId },
    orderBy: { createdAt: 'asc' },
    include: {
      sender: { select: { id: true, fullName: true, avatarUrl: true } },
      readStatus: { select: { userId: true, readAt: true } },
    },
  })

  return replies.map((r) => ({
    id: r.id,
    content: r.content,
    senderId: r.senderId,
    channelId: r.channelId,
    parentId: r.parentId,
    isTaskCard: r.isTaskCard,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
    sender: r.sender,
    readStatus: r.readStatus.map((rs) => ({ userId: rs.userId, readAt: rs.readAt.toISOString() })),
    replyCount: 0,
  }))
}
