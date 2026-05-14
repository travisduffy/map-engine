#!/bin/bash
set -e

# Grep for F-[A-Z0-9.-]+ in docs/*.md
# Ensure no duplicate finding codes are used in the narrative sections of the same document
# (ignoring the revision history).

EXIT_CODE=0

for file in docs/*.md; do
    if [[ "$file" == "docs/HANDOFF.md" ]]; then
        continue
    fi
    echo "Checking $file..."
    
    # Get all finding codes in narrative (lines before Revision History)
    # We use sed to stop at the first occurrence of "Revision History"
    codes=$(sed '/Revision History/q' "$file" | grep -oE "F-[A-Z0-9.-]+" || true)
    
    # Check for duplicates
    dupes=$(echo "$codes" | sort | uniq -d)
    
    if [ -n "$dupes" ]; then
        echo "Duplicate finding codes found in narrative of $file:"
        echo "$dupes"
        EXIT_CODE=1
    fi
done

exit $EXIT_CODE
