#!/bin/bash
# Pushes the already-prepared Size Matters repo to GitHub.
# Run this from the "Size Matters" folder on your own machine (Terminal):
#   cd "/path/to/Size Matters" && bash push-to-github.sh
set -e

cd "$(dirname "$0")"

echo "Clearing any stale git lock files left by the sandbox..."
rm -f .git/HEAD.lock .git/objects/maintenance.lock
find .git/objects -name 'tmp_obj_*' -delete 2>/dev/null || true

echo "Confirming remote..."
git remote -v

echo "Pushing 'main' to origin..."
git push -u origin main

echo "Done. View it at https://github.com/tradersnow222/Size-Matters"
