#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 🛡️ LỚP BẢO MẬT 2 — TruffleHog Pre-commit Hook
#
# Cài đặt:
#   chmod +x security/layer2-trufflehog-setup.sh
#   bash security/layer2-trufflehog-setup.sh
#
# Tác dụng:
#   - Quét toàn bộ staged files trước mỗi lần commit
#   - Nếu phát hiện secret/token/key → CHẶN commit ngay lập tức
#   - Hiển thị file và dòng chứa secret bị lộ
# ─────────────────────────────────────────────────────────────

set -e

BOLD="\033[1m"
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RESET="\033[0m"

echo -e "${CYAN}${BOLD}"
echo "  ████████╗██████╗ ██╗   ██╗███████╗███████╗██╗     ███████╗██╗  ██╗ ██████╗  ██████╗ "
echo "     ██╔══╝██╔══██╗██║   ██║██╔════╝██╔════╝██║     ██╔════╝██║  ██║██╔═══██╗██╔════╝ "
echo "     ██║   ██████╔╝██║   ██║█████╗  █████╗  ██║     █████╗  ███████║██║   ██║██║  ███╗"
echo "     ██║   ██╔══██╗██║   ██║██╔══╝  ██╔══╝  ██║     ██╔══╝  ██╔══██║██║   ██║██║   ██║"
echo "     ██║   ██║  ██║╚██████╔╝██║     ██║     ███████╗███████╗██║  ██║╚██████╔╝╚██████╔╝"
echo "     ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝     ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ "
echo "                      🔍 Secret Scanner Setup — P.A.S.T WORKSPACE"
echo -e "${RESET}"

# ─── Bước 1: Kiểm tra / Cài TruffleHog ──────────────────────
echo -e "${YELLOW}[1/4] Kiểm tra TruffleHog...${RESET}"

if command -v trufflehog &> /dev/null; then
  VERSION=$(trufflehog --version 2>&1 | head -1)
  echo -e "${GREEN}✓ TruffleHog đã có: ${VERSION}${RESET}"
else
  echo -e "${YELLOW}⏳ Đang cài TruffleHog...${RESET}"

  OS="$(uname -s)"
  ARCH="$(uname -m)"

  if [[ "$OS" == "Darwin" ]]; then
    if command -v brew &> /dev/null; then
      brew install trufflehog
    else
      # Manual install từ GitHub releases
      LATEST=$(curl -s https://api.github.com/repos/trufflesecurity/trufflehog/releases/latest | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')
      ARCH_SUFFIX="darwin_arm64"
      [[ "$ARCH" == "x86_64" ]] && ARCH_SUFFIX="darwin_amd64"
      curl -sSfL "https://github.com/trufflesecurity/trufflehog/releases/download/v${LATEST}/trufflehog_${LATEST}_${ARCH_SUFFIX}.tar.gz" | tar -xz -C /usr/local/bin trufflehog
      chmod +x /usr/local/bin/trufflehog
    fi
  elif [[ "$OS" == "Linux" ]]; then
    LATEST=$(curl -s https://api.github.com/repos/trufflesecurity/trufflehog/releases/latest | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')
    ARCH_SUFFIX="linux_amd64"
    [[ "$ARCH" == "aarch64" ]] && ARCH_SUFFIX="linux_arm64"
    curl -sSfL "https://github.com/trufflesecurity/trufflehog/releases/download/v${LATEST}/trufflehog_${LATEST}_${ARCH_SUFFIX}.tar.gz" | tar -xz -C /usr/local/bin trufflehog
    chmod +x /usr/local/bin/trufflehog
  else
    echo -e "${RED}❌ OS không được hỗ trợ tự động. Cài thủ công: https://github.com/trufflesecurity/trufflehog/releases${RESET}"
    exit 1
  fi

  echo -e "${GREEN}✓ TruffleHog đã được cài thành công!${RESET}"
fi

# ─── Bước 2: Tạo pre-commit hook ─────────────────────────────
echo -e "${YELLOW}[2/4] Tạo Git pre-commit hook...${RESET}"

HOOK_DIR=".git/hooks"
HOOK_FILE="${HOOK_DIR}/pre-commit"

mkdir -p "$HOOK_DIR"

cat > "$HOOK_FILE" << 'HOOK_SCRIPT'
#!/usr/bin/env bash
# ─── TruffleHog Pre-commit Hook ───────────────────────────────
# Tự động quét secrets trước mỗi git commit

RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RESET="\033[0m"

echo -e "${YELLOW}🔍 TruffleHog đang quét secrets trong staged files...${RESET}"

# Lấy danh sách staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)

if [[ -z "$STAGED_FILES" ]]; then
  echo -e "${GREEN}✓ Không có file nào được staged.${RESET}"
  exit 0
fi

# Quét staged content với TruffleHog
RESULT=$(git stash --keep-index --quiet && \
  trufflehog git file://. --only-verified --no-update --json 2>/dev/null && \
  git stash pop --quiet)

SCAN_EXIT=$?
git stash pop --quiet 2>/dev/null || true

if echo "$RESULT" | grep -q '"DetectorName"'; then
  echo -e "${RED}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  🚨 SECRET ĐÃ BỊ PHÁT HIỆN — COMMIT BỊ CHẶN!              ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║  TruffleHog đã tìm thấy thông tin nhạy cảm trong code.     ║"
  echo "║                                                              ║"
  echo "║  Hành động cần làm:                                         ║"
  echo "║  1. Xóa secret khỏi code                                   ║"
  echo "║  2. Dùng biến môi trường (.env) thay thế                   ║"
  echo "║  3. Thu hồi & tạo lại token/key bị lộ                      ║"
  echo "║  4. Chạy: git rm --cached <file> nếu cần                   ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${RESET}"
  echo -e "${YELLOW}Chi tiết:${RESET}"
  echo "$RESULT" | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        d = json.loads(line)
        print(f\"  ⚠️  [{d.get('DetectorName','?')}] {d.get('Raw','')[:60]}...\")
        print(f\"     File: {d.get('SourceMetadata',{}).get('Data',{}).get('Git',{}).get('file','?')}\")
    except: pass
" 2>/dev/null || echo "$RESULT"
  exit 1
fi

echo -e "${GREEN}✓ Không phát hiện secret nào. Commit được tiếp tục.${RESET}"
exit 0
HOOK_SCRIPT

chmod +x "$HOOK_FILE"
echo -e "${GREEN}✓ Pre-commit hook đã được tạo tại ${HOOK_FILE}${RESET}"

# ─── Bước 3: Tạo .trufflehog.yml config ─────────────────────
echo -e "${YELLOW}[3/4] Tạo file cấu hình TruffleHog...${RESET}"

cat > .trufflehog.yml << 'CONFIG'
# TruffleHog Configuration — P.A.S.T WORKSPACE
version: "3"

# Các detector kích hoạt
detectors:
  - GitHub
  - GitHubOauth2
  - Supabase
  - Slack
  - SendGrid
  - Stripe
  - AWS
  - GCP
  - Azure
  - Twilio
  - Netlify
  - Vercel

# Bỏ qua các file không cần quét
exclude_paths:
  - "node_modules/"
  - ".git/"
  - "dist/"
  - "build/"
  - ".next/"
  - "*.lock"
  - "*.min.js"
  - "*.min.css"
  - "package-lock.json"
  - "yarn.lock"

# Chỉ báo cáo secrets đã được verify (giảm false positive)
only_verified: true
CONFIG

echo -e "${GREEN}✓ .trufflehog.yml đã được tạo${RESET}"

# ─── Bước 4: Quét toàn bộ repo lần đầu ──────────────────────
echo -e "${YELLOW}[4/4] Đang quét toàn bộ repo lần đầu...${RESET}"

SCAN=$(trufflehog git file://. --only-verified --no-update --json 2>/dev/null || true)

if echo "$SCAN" | grep -q '"DetectorName"'; then
  echo -e "${RED}⚠️  Phát hiện secret trong repo hiện tại! Hãy xem xét và xử lý ngay.${RESET}"
  echo "$SCAN"
else
  echo -e "${GREEN}✓ Repo sạch — không phát hiện secret nào!${RESET}"
fi

echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  ✅ TruffleHog Layer 2 đã được cài thành công!${RESET}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════${RESET}"
echo ""
echo -e "  📌 Mỗi lần ${BOLD}git commit${RESET}, TruffleHog sẽ tự động quét."
echo -e "  📌 Quét thủ công: ${CYAN}trufflehog git file://. --only-verified${RESET}"
echo ""
