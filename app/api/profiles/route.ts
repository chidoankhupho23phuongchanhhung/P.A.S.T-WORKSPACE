// app/api/profiles/route.ts
// 🔒 Security: Tất cả user đã login đều được SELECT thông tin thành viên an toàn

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
    const profiles = await prisma.profile.findMany({
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        role: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    })

    return NextResponse.json(profiles)
  } catch (err) {
    console.error('[GET /api/profiles]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
