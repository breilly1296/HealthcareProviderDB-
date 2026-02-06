#!/bin/bash
# Run confidence decay recalculation
# Intended to be called by Cloud Scheduler (via admin endpoint) or cron (via this script)
#
# Usage:
#   ./scripts/run-confidence-decay.sh           # Apply changes
#   ./scripts/run-confidence-decay.sh --dry-run  # Preview only
cd "$(dirname "$0")/.."
npx tsx scripts/recalculate-confidence.ts --apply "$@" 2>&1
