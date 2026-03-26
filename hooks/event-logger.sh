#!/bin/bash
# Appends hook JSON from stdin to events.jsonl with timestamp. Must never fail or block.

DATA_DIR="${HOME}/.llmboard"
EVENTS_FILE="${DATA_DIR}/events.jsonl"

mkdir -p "$DATA_DIR" 2>/dev/null || true

input=$(cat 2>/dev/null || echo '')
if [ -z "$input" ]; then
  exit 0
fi

timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")

if command -v jq >/dev/null 2>&1; then
  enriched=$(echo "$input" | jq -c \
    --arg ts "$timestamp" \
    '. + {dashboard_ts: $ts}' \
    2>/dev/null)

  if [ -n "$enriched" ] && [ "$enriched" != "null" ]; then
    echo "$enriched" >> "$EVENTS_FILE" 2>/dev/null
  else
    echo "{\"raw\":true,\"data\":$(echo "$input" | head -c 8192),\"dashboard_ts\":\"$timestamp\"}" >> "$EVENTS_FILE" 2>/dev/null
  fi
else
  # No jq — scrub newlines and carriage returns to preserve JSONL integrity
  sanitized=$(echo "$input" | tr -d '\n\r' 2>/dev/null)
  if [ -n "$sanitized" ]; then
    echo "$sanitized" >> "$EVENTS_FILE" 2>/dev/null
  fi
fi

# Rotate at 50MB
if [ -f "$EVENTS_FILE" ]; then
  file_size=$(stat -f%z "$EVENTS_FILE" 2>/dev/null || stat -c%s "$EVENTS_FILE" 2>/dev/null || echo 0)
  if [ "$file_size" -gt 52428800 ] 2>/dev/null; then
    mv "$EVENTS_FILE" "${EVENTS_FILE}.$(date +%Y%m%d%H%M%S).bak" 2>/dev/null || true
  fi
fi

exit 0
