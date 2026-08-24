#!/usr/bin/env bash
set -euo pipefail

# Keep the browser next to the installed test package instead of an untracked
# user cache. A clean `npm ci` can therefore provision and run the suite with
# the same command.
export PLAYWRIGHT_BROWSERS_PATH=0

npx playwright install chromium
npx playwright test "$@"