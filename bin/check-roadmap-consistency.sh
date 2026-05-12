#!/bin/bash
set -e

ROADMAP="docs/ROADMAP.md"
EXIT_CODE=0

if [ ! -f "$ROADMAP" ]; then
    echo "Roadmap file not found: $ROADMAP"
    exit 1
fi

# Assert that the pool sizes in §4 of ROADMAP.md match the F-C.8 narrative (pool size = 4)
# Look for rows mentioning pool in §4 (Normative Memory Contract)
pool_rows=$(grep "pool" "$ROADMAP" | grep "|" || true)
while IFS= read -r line; do
    if [ -n "$line" ] && [[ ! "$line" == *"4-buffer pool"* ]]; then
        echo "Incorrect pool size in table row: $line"
        EXIT_CODE=1
    fi
done <<< "$pool_rows"

# Check F-C.8 narrative for pool size 4
if ! grep -q "steady-state pool size is 4" "$ROADMAP"; then
    echo "F-C.8 narrative does not mention pool size 4 correctly."
    EXIT_CODE=1
fi

# Assert that audit filenames in §3 match the phase-<N>-audit.md convention.
# Check for any references to docs/audits/ that don't match the convention
bad_audit_refs=$(grep -oE "docs/audits/[^[:space:]\"'\`]+" "$ROADMAP" | grep -vE "phase-([0-9]+|<N>)-audit\.md" || true)
if [ -n "$bad_audit_refs" ]; then
    echo "Audit filenames in ROADMAP.md don't match convention: $bad_audit_refs"
    EXIT_CODE=1
fi

# Ensure at least one correct reference exists
if ! grep -qE "docs/audits/phase-[0-9]+-audit\.md" "$ROADMAP"; then
    echo "No valid audit filename references (phase-<N>-audit.md) found in ROADMAP.md"
    EXIT_CODE=1
fi

exit $EXIT_CODE
