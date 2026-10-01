#!/usr/bin/env bash
# Runs the per-bar replay for every variant of one phase, 5 at a time (below-normal priority set inside the script).
PHASE="$1"; cd "$(dirname "$0")/../../.."
printf '%s\n' CONTROL CONTROL_COPY D1 D2 D3 D4 D5 D6 ALL | xargs -P 5 -I{} sh -c "V8_VARIANT={} V8_PHASE=$PHASE node research/core_pattern_audit_v8/scripts/v8_replay.mjs < /dev/null > research/core_pattern_audit_v8/results/rows/{}_$PHASE.console.txt 2>&1; echo {} exit \$?"
