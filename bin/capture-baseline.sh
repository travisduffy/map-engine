#!/usr/bin/env bash
set -euo pipefail

RESULT_FILE="bench/.last-result.json"
BASELINES_FILE="bench/baselines.json"
RUNS=10

echo "Capturing registry-alloc baseline ($RUNS runs)..."

DELTAS=()

for i in $(seq 1 $RUNS); do
  echo -n "  Run $i/$RUNS... "
  rm -f "$RESULT_FILE"
  NODE_OPTIONS="--expose-gc" npm run bench:registry-alloc --silent >/dev/null 2>&1 || {
    echo "FAILED"
    echo "ERROR: bench run $i failed. Check npm run bench:registry-alloc manually." >&2
    exit 1
  }

  if [ ! -f "$RESULT_FILE" ]; then
    echo "FAILED (result file not written)"
    exit 1
  fi

  DELTA=$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('$RESULT_FILE','utf8')).delta))")
  DELTAS+=("$DELTA")
  echo "${DELTA} bytes"
done

# Compute median
DELTAS_CSV=$(printf '%s,' "${DELTAS[@]}")
DELTAS_CSV="${DELTAS_CSV%,}"

MEDIAN=$(node -e "
const d = [$DELTAS_CSV].sort((a,b)=>a-b);
const m = Math.floor(d.length/2);
const med = d.length%2===0 ? (d[m-1]+d[m])/2 : d[m];
process.stdout.write(String(Math.round(med)));
")

echo ""
echo "Median: $MEDIAN bytes"

HARDWARE=$(uname -sm 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

node -e "
const fs = require('fs');
const b = JSON.parse(fs.readFileSync('$BASELINES_FILE', 'utf8'));
b['b1.constructor_alloc_bytes'] = {
  value: $MEDIAN,
  unit: 'bytes',
  capturedAt: '$TIMESTAMP',
  hardware: '$HARDWARE',
  measurementMethod: 'process.memoryUsage().heapUsed (Node.js v8 heap, --expose-gc)'
};
fs.writeFileSync('$BASELINES_FILE', JSON.stringify(b, null, 2) + '\n');
"

echo "Written to $BASELINES_FILE"
