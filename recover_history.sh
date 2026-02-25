#!/bin/bash
HISTORY_DIR="$HOME/Library/Application Support/Antigravity/User/History"
TARGET="packages/buddy"

find "$HISTORY_DIR" -name "entries.json" | while read -r entry_file; do
    if grep -q "$TARGET" "$entry_file"; then
        echo "Found related history in $entry_file:"
        cat "$entry_file"
        echo "---"
    fi
done
