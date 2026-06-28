#!/bin/bash
set -e

echo "=========================================="
echo "  Pixelyf 전체 배포 스크립트"
echo "  [Security] RLS 정석 적용 배포"
echo "=========================================="

SERVER="keyssue@211.227.56.203"

# ── Step 1: Git Push ──────────────────────────
echo ""
echo "📌 Step 1: Git Push to origin/main"
echo "------------------------------------------"
git push origin main
echo "✅ Git Push 완료"

# ── Step 2: 프로덕션 서버 배포 (P0 - 로그인 복구) ──
echo ""
echo "🚀 Step 2: 프로덕션 서버 배포 (/var/www/pixelyf-new)"
echo "------------------------------------------"
ssh $SERVER 'bash -s' << 'PROD_EOF'
  set -e
  cd /var/www/pixelyf-new
  echo "  → git fetch & reset..."
  git fetch origin
  git checkout main
  git reset --hard origin/main
  echo "  → npm install..."
  npm install
  echo "  → prisma generate..."
  npx prisma generate
  echo "  → npm run build..."
  npm run build
  echo "  → pm2 restart..."
  pm2 restart pixelyf-new --update-env
  echo "  → pm2 status:"
  pm2 status
PROD_EOF
echo "✅ 프로덕션 배포 완료"

# ── Step 3: 개발 서버 배포 ──────────────────────
echo ""
echo "💻 Step 3: 개발 서버 배포 (/var/www/pixelyf-web)"
echo "------------------------------------------"
ssh $SERVER 'bash -s' << 'DEV_EOF'
  set -e
  cd /var/www/pixelyf-web
  echo "  → git fetch & reset..."
  git fetch origin
  git checkout main
  git reset --hard origin/main
  echo "  → npm install..."
  npm install
  echo "  → prisma generate..."
  npx prisma generate
  echo "  → npm run build..."
  npm run build
  echo "  → pm2 restart..."
  pm2 restart pixelyf-web --update-env
  echo "  → pm2 status:"
  pm2 status
DEV_EOF
echo "✅ 개발 서버 배포 완료"

# ── Step 4: 오픈소스 릴리즈 ──────────────────────
echo ""
echo "🌐 Step 4: 오픈소스 릴리즈"
echo "------------------------------------------"
echo "⚠️  오픈소스 릴리즈는 대화식(interactive) 프로세스입니다."
echo "   아래 명령을 수동으로 실행해주세요:"
echo ""
echo "   python scripts/ops/release_open_source.py"
echo ""

echo "=========================================="
echo "  🎉 배포 완료! 검증을 진행하세요."
echo "=========================================="
echo ""
echo "📋 검증 체크리스트:"
echo "  1. https://pixelyf.com 접속 → 로그인 테스트"
echo "  2. Supabase SQL Editor에서 RLS 마이그레이션 실행:"
echo "     supabase/migrations/20260624100000_enable_rls_with_policies.sql"
echo "  3. Supabase 콘솔에서 RLS 경고 해제 확인"
