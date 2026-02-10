#!/bin/bash
# Usage: ./scripts/check_changed.sh <path>
# Exit 0 if changed, exit 1 if unchanged
# Used by codemagic.yaml for conditional metadata/screenshot uploads

set -euo pipefail

PATH_TO_CHECK="${1:-}"

if [ -z "$PATH_TO_CHECK" ]; then
  echo "Usage: $0 <path>"
  echo "  Exit 0 if path has changes since last commit"
  echo "  Exit 1 if path is unchanged"
  exit 2
fi

if git diff --name-only HEAD~1 -- "$PATH_TO_CHECK" | grep -q .; then
  echo "CHANGED: $PATH_TO_CHECK"
  exit 0
else
  echo "UNCHANGED: $PATH_TO_CHECK"
  exit 1
fi
