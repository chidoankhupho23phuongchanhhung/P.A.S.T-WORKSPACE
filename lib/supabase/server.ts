// lib/supabase/server.ts — Server client (RSC / Route Handlers)
// 🔒 Security: Chạy ở server-side, sử dụng cookies từ next/headers

import { createServerClient as _createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createServerClient() {
  const cookieStore = cookies()
  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Có thể bỏ qua lỗi này nếu chạy trong Server Components (read-only context)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Có thể bỏ qua lỗi này nếu chạy trong Server Components (read-only context)
          }
        },
      },
    }
  )
}
