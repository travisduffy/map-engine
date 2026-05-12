#!/bin/bash
set -e

# Verify that every finding code cited in the matrix is present in the roadmap.
# This script fulfills the mandate in ROADMAP.md §6.6.

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

# Extract rows from the matrix, skipping header and separators
# Format: | # | Synthesis Finding (Code) | Revised Section | Note |
rows=$(grep "^|" "$MATRIX" | sed -n '3,$p' | grep -v -- "---")

IFS=$'\n'
for row in $rows; do
    # Extract Revised Section (Column 3)
    section=$(echo "$row" | awk -F'|' '{print $4}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    # Skip CANCELED or ICEBOXED items
    if [[ "$section" == "CANCELED" ]] || [[ "$section" == "ICEBOX" ]]; then
        continue
    fi

    # Extract Finding Code from the row (either in Synthesis Finding or Note)
    code=$(echo "$row" | grep -oE "F-[A-Z0-9.-]+" | head -n 1 || true)
    
    if [ -n "$code" ]; then
        if ! grep -q -- "$code" "$ROADMAP"; then
            echo "Finding code $code (from matrix row) not found in ROADMAP.md"
            EXIT_CODE=1
        fi
    else
        # If no code, we could attempt a partial match of the synthesis finding,
        # but that is brittle. For now, we rely on the Finding Code Integrity.
        continue
    fi
done

exit $EXIT_CODE
