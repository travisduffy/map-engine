#!/bin/bash
set -e

# Verify that every finding code cited in docs/ROADMAP_TRACEABILITY_MATRIX.md 
# is actually present in docs/ROADMAP.md.

MATRIX="docs/ROADMAP_TRACEABILITY_MATRIX.md"
ROADMAP="docs/ROADMAP.md"

EXIT_CODE=0

if [ ! -f "$MATRIX" ]; then
    echo "Matrix file not found: $MATRIX"
    exit 1
fi

if [ ! -f "$ROADMAP" ]; then
    echo "Roadmap file not found: $ROADMAP"
    exit 1
fi

# Extract finding codes from matrix
# Matches codes like F-C.1, F-1.1, etc.
codes=$(grep -oE "F-[A-Z0-9.-]+" "$MATRIX" | sort | uniq)

for code in $codes; do
    if ! grep -q "$code" "$ROADMAP"; then
        echo "Finding code $code cited in matrix but not found in ROADMAP.md"
        EXIT_CODE=1
    fi
done

exit $EXIT_CODE
