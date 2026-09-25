#!/bin/sh
# Vercel's "Ignored Build Step" for the website (vercel.json ignoreCommand).
# Exit 0 skips the deployment; exit 1 builds it.
#
# Skipping saves the build, not the deployment: the free plan's limit of
# 100 deployments a day counts a skipped one too, because Vercel creates
# it before this runs. What saves the quota is creating fewer. The
# frontend/ and backend/ projects, which never deploy, now create none
# (git.deploymentEnabled in their vercel.json); before that every push
# cost three, which ran the quota out twice on 2026-09-24.
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
