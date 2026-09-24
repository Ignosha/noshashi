#!/bin/sh
# Vercel's "Ignored Build Step" for the website (vercel.json ignoreCommand).
# Exit 0 skips the deployment; exit 1 builds it.
#
# The free plan allows 100 deployments a day, and every push to a pull
# request used one, even when it only touched the desktop app. On
# 2026-09-24 that ran the quota out and blocked the website for a day.
#
# The rule is an allowlist, so a mistake here costs a deployment and
# never a stale website. It skips only when EVERY changed file is known
# not to reach the site. The site build (scripts/build-site.mjs) reads
# templates/, site/, api/, docs/api/, CHANGELOG.md, SECURITY.md and three
# JSON files under src/lib, and none of those is on the list. Anything
# unlisted, or a diff that cannot be computed, builds.

base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
changed=$(git diff --name-only "$base" HEAD 2>/dev/null) || exit 1

# Nothing changed means a redeploy of the same commit (the refresh hook,
# or a manual redeploy): always build it.
[ -z "$changed" ] && exit 1

app_only='^(\.claude/|outreach/|src-tauri/|src/components/|src/App\.tsx$|src/main\.tsx$|src/lib/.*\.tsx?$|src/.*__tests__/|tests/|\.github/|supabase/|frontend/|backend/|index\.html$|vite\.config\.mts$|docs/IOS\.md$|HANDOFF\.md$|scripts/i18n-wip/)'

if printf '%s\n' "$changed" | grep -qvE "$app_only"; then
  exit 1
fi

echo "Only desktop-app files changed since $base; the website is unaffected, so this deployment is skipped."
exit 0
