// app/api/auth/profile/route.ts
// 🔒 Security: Tự động khởi tạo Profile trong public.profiles khớp với Supabase Auth
// 🔒 Sử dụng dữ liệu từ token auth để tránh làm giả

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 🔒 Upsert Profile từ metadata của user
    const profile = await prisma.profile.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        fullName: user.user_metadata.full_name || user.email?.split('@')[0] || 'Thành viên mới',
        avatarUrl: user.user_metadata.avatar_url || null,
        role: 'member', // Mặc định là member, admin có thể nâng cấp sau
      },
    })

    return NextResponse.json(profile)
  } catch (err) {
    console.error('[POST /api/auth/profile]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
