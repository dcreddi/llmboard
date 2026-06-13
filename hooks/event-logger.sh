#!/bin/bash
# Appends hook JSON from stdin to events.jsonl with timestamp. Must never fail or block.

DATA_DIR="${HOME}/.llmboard"
EVENTS_FILE="${DATA_DIR}/events.jsonl"

mkdir -p "$DATA_DIR" 2>/dev/null || true

# Append a JSONL line with dashboard_ts/seq injected, without jq. Scrubs newlines first.
write_enriched() {
  sanitized=$(printf '%s' "$1" | tr -d '\n\r' 2>/dev/null)
  [ -n "$sanitized" ] || return 0
  case "$sanitized" in
    *\})
      body="${sanitized%\}}"   # strip the trailing }
      printf '%s,"dashboard_ts":"%s","seq":"%s"}\n' "$body" "$timestamp" "$seq" >> "$EVENTS_FILE" 2>/dev/null
      ;;
    *)
      printf '%s\n' "$sanitized" >> "$EVENTS_FILE" 2>/dev/null
      ;;
  esac
}

# Rate limit: bail if events file grew more than 30 lines in the last 5 seconds
RATE_FILE="${DATA_DIR}/.rate"
now_ts=$(date +%s 2>/dev/null || echo 0)
if [ -f "$RATE_FILE" ]; then
  rate_data=$(cat "$RATE_FILE" 2>/dev/null)
  rate_ts=$(printf '%s' "$rate_data" | cut -d: -f1)
  rate_cnt=$(printf '%s' "$rate_data" | cut -d: -f2)
  if [ $((now_ts - rate_ts)) -le 5 ] && [ "${rate_cnt:-0}" -ge 250 ]; then
    exit 0
  fi
  if [ $((now_ts - rate_ts)) -gt 5 ]; then
    rate_cnt=0; rate_ts=$now_ts
  fi
else
  rate_cnt=0; rate_ts=$now_ts
fi
printf '%s:%s\n' "$rate_ts" "$((rate_cnt + 1))" > "$RATE_FILE" 2>/dev/null

input=$(cat 2>/dev/null || echo '')
if [ -z "$input" ]; then
  exit 0
fi

timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
# Unique per event so two events in the same second don't collide in the dashboard's dedup.
seq="${now_ts}-$$-${RANDOM}"

if command -v jq >/dev/null 2>&1; then
  enriched=$(printf '%s' "$input" | jq -c \
    --arg ts "$timestamp" \
    --arg seq "$seq" \
    '. + {dashboard_ts: $ts, seq: $seq}' \
    2>/dev/null)

  if [ -n "$enriched" ] && [ "$enriched" != "null" ]; then
    printf '%s\n' "$enriched" >> "$EVENTS_FILE" 2>/dev/null
  else
    # jq enrichment failed — fall back to string surgery (still enriches dashboard_ts/seq).
    write_enriched "$input"
  fi
else
  # No jq — inject dashboard_ts/seq so events aren't excluded from time-ranged views.
  write_enriched "$input"
fi

# Rotate at 50MB
if [ -f "$EVENTS_FILE" ]; then
  file_size=$(stat -f%z "$EVENTS_FILE" 2>/dev/null || stat -c%s "$EVENTS_FILE" 2>/dev/null || echo 0)
  if [ "$file_size" -gt 52428800 ] 2>/dev/null; then
    mv "$EVENTS_FILE" "${EVENTS_FILE}.$(date +%Y%m%d%H%M%S).bak" 2>/dev/null || true
  fi
fi

exit 0
