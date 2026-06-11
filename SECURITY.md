# 🔐 P.A.S.T WORKSPACE — Security Shield

Hệ thống bảo mật 3 lớp được cài đặt cho dự án này.

## 🛡️ Kiến trúc bảo mật

```
┌─────────────────────────────────────────────────────────┐
│                   HACKER / BOT                          │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  LỚP 1 — Honeypot Middleware                            │
│  • Phát hiện dò route nhạy cảm (.env, /admin, ...)      │
│  • 50% redirect → Trang chủ                             │
│  • 50% trả dữ liệu rác (fake tokens, fake DB strings)   │
│  • Ghi log IP + User-Agent kẻ tấn công                  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  LỚP 2 — TruffleHog Pre-commit Hook                     │
│  • Chặn commit nếu phát hiện token/key/secret           │
│  • Quét tự động trước MỌI lần git commit                │
│  • Hỗ trợ: GitHub, Supabase, AWS, Stripe, Slack, ...    │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  LỚP 3 — GitHub Actions Security Shield                 │
│  • TruffleHog scan trên mỗi Push/PR                     │
│  • CodeQL static analysis (SQL injection, XSS, ...)     │
│  • npm audit kiểm tra dependency vulnerabilities        │
│  • Validate .gitignore & file nhạy cảm                  │
│  • Báo cáo tổng hợp trên mỗi workflow run               │
└─────────────────────────────────────────────────────────┘
```

## 📁 Cấu trúc file

```
PAST WORKSPACE/
├── .gitignore                          ← Bảo vệ file nhạy cảm
├── .trufflehog.yml                     ← Config TruffleHog
├── .git/hooks/pre-commit               ← Hook chặn commit có secret
├── .github/
│   └── workflows/
│       └── security-shield.yml        ← GitHub Actions Layer 3
└── security/
    ├── layer1-honeypot.js              ← Honeypot Middleware
    └── layer2-trufflehog-setup.sh     ← Script cài TruffleHog
```

## 🚀 Cách tích hợp Honeypot (Layer 1)

### Với Next.js
```js
// middleware.js (đặt ở root)
import { nextjsHoneypot } from './security/layer1-honeypot.js';
export { nextjsHoneypot as middleware };
export const config = { matcher: '/((?!_next/static|_next/image|favicon.ico).*)', };
```

### Với Express.js
```js
import { honeypotMiddleware } from './security/layer1-honeypot.js';
app.use(honeypotMiddleware);
```

## 🔍 Lệnh quét thủ công TruffleHog

```bash
# Quét toàn bộ git history
trufflehog git file://. --only-verified

# Quét một file cụ thể
trufflehog filesystem ./path/to/file --only-verified

# Quét repo GitHub trực tiếp
trufflehog github --repo https://github.com/your/repo --only-verified
```

## ⚠️ Lưu ý quan trọng

> Luôn dùng **biến môi trường** (`.env`) thay vì hardcode secrets trong code.
> Token/Key bị lộ phải **thu hồi ngay lập tức** dù đã xóa khỏi code.
