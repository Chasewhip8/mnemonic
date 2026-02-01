#!/bin/bash
# Health check for deja - run between worker sessions
cd "$(dirname "$0")/.." || exit 1

echo "=== UNCOMMITTED WORK ==="
UNCOMMITTED=$(git status --porcelain | head -5)
if [ -n "$UNCOMMITTED" ]; then
  echo "⚠️ UNCOMMITTED - commit first!"
  echo "$UNCOMMITTED"
fi

echo ""
echo "=== TYPE CHECK ==="
if ! npx tsc --noEmit 2>&1; then
  echo "❌ Type errors - fix before continuing"
  exit 1
fi
echo "✅ Types OK"

echo ""
echo "=== TESTS ==="
if [ -f "test/deja.test.ts" ]; then
  if ! bun test 2>&1 | tail -20; then
    echo "❌ Tests failed"
    exit 1
  fi
  echo "✅ Tests pass"
else
  echo "⚠️ No tests yet"
fi

echo ""
echo "=== WRANGLER CHECK ==="
npx wrangler deploy --dry-run 2>&1 | tail -10 || echo "⚠️ Dry-run issues"
