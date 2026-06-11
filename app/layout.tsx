// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'P.A.S.T WORKSPACE — Lark Clone for Club',
  description: 'Hệ thống quản lý công việc và cộng tác nội bộ tối tân của CLB P.A.S.T',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
