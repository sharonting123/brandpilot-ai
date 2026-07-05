#!/bin/bash
# Deploy to Vercel. Run on your local machine after: npx vercel login
# Or set VERCEL_TOKEN from https://vercel.com/account/tokens
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "${VERCEL_TOKEN:-}" ]; then
  npx vercel deploy --prod --token "$VERCEL_TOKEN" --yes
else
  npx vercel deploy --prod --yes
fi

echo ""
echo "Next: Vercel Dashboard → Project → Settings → Domains → add brdpilot.com"
echo "Then update Namecheap DNS (see README or deployment guide)."
