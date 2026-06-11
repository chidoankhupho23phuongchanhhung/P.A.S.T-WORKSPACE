// app/api/channels/route.ts
// 🔒 Security: GET (tất cả PUBLIC channel + PRIVATE channel đã join); POST (chỉ admin/leader tạo channel)

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
    // Tìm các channel mà user có quyền truy cập:
    // 1. Loại PUBLIC
    // 2. Loại PRIVATE nhưng user là thành viên trong channel_members
    let channels = await prisma.channel.findMany({
      where: {
        OR: [
          { type: 'PUBLIC' },
          {
            members: {
              some: { userId: user.id }
            }
          }
        ]
      },
      include: {
        _count: {
          select: { members: true }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    })

    // 🌟 Self-healing: Nếu chưa có channel nào trong DB, tự động seed 1 channel chung
    if (channels.length === 0) {
      // Tìm profile của user hiện tại làm owner
      const currentProfile = await prisma.profile.findUnique({
        where: { id: user.id }
      })

      if (currentProfile) {
        const seededChannel = await prisma.channel.create({
          data: {
            name: 'Chung - General',
            description: 'Kênh thảo luận chung của CLB P.A.S.T',
            type: 'PUBLIC',
            ownerId: user.id,
            members: {
              create: {
                userId: user.id
              }
            }
          },
          include: {
            _count: {
              select: { members: true }
            }
          }
        })
        channels = [seededChannel]
      }
    }

    return NextResponse.json(channels)
  } catch (err) {
    console.error('[GET /api/channels]', err)
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

  // 🔒 Kiểm tra quyền (Chỉ admin và leader mới được tạo channel)
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true }
  })

  if (!profile || !['admin', 'leader'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Forbidden — Chỉ Trưởng ban hoặc Leader mới được quyền tạo kênh' },
      { status: 403 }
    )
  }

  let body: {
    name: string
    description?: string
    type: 'PUBLIC' | 'PRIVATE'
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return NextResponse.json({ error: 'Tên kênh chat là bắt buộc' }, { status: 400 })
  }

  try {
    const newChannel = await prisma.channel.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        type: body.type || 'PUBLIC',
        ownerId: user.id,
        members: {
          create: {
            userId: user.id // Tự động join channel khi tạo
          }
        }
      },
      include: {
        _count: {
          select: { members: true }
        }
      }
    })

    return NextResponse.json(newChannel, { status: 201 })
  } catch (err) {
    console.error('[POST /api/channels]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
