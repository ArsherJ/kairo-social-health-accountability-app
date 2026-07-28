#!/usr/bin/env bash
#
# Run SQL against the linked Supabase project over HTTPS.
#
# Why this exists: outbound Postgres :5432 is blocked on the current dev
# network, and Supabase's direct host resolves IPv6-only, so neither
# `supabase db push` nor psql can connect. The Management API accepts SQL over
# HTTPS, which works fine. This keeps schema work scriptable instead of
# hand-pasting into the dashboard SQL Editor.
#
# Auth comes from the Supabase CLI's macOS Keychain entry, so `supabase login`
# is the only setup step. No token is stored in this repo.
#
# Usage:
#   ./supabase/scripts/remote-sql.sh "select count(*) from profiles"
#   ./supabase/scripts/remote-sql.sh -f supabase/migrations/0001_whatever.sql
#
# Applying a migration this way does NOT record it in
# supabase_migrations.schema_migrations. Add that row yourself, or the CLI will
# try to re-apply the file if it ever regains a direct connection.

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-lplmsagrtxbvpcywvyzm}"

usage() {
  echo "usage: $0 \"<sql>\"   |   $0 -f <file.sql>" >&2
  exit 64
}

[ $# -ge 1 ] || usage

if [ "$1" = "-f" ]; then
  [ $# -eq 2 ] || usage
  [ -r "$2" ] || { echo "cannot read $2" >&2; exit 66; }
  SQL=$(cat "$2")
else
  SQL="$1"
fi

TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null || true)
if [ -z "$TOKEN" ]; then
  echo "No Supabase CLI token in the Keychain. Run: supabase login" >&2
  exit 77
fi

# python3 handles the JSON escaping; SQL bodies contain quotes and newlines
# that would be painful to escape in shell.
BODY=$(SQL="$SQL" python3 -c 'import json,os; print(json.dumps({"query": os.environ["SQL"]}))')

RESPONSE=$(curl -sS -w '\n%{http_code}' \
  -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY")

STATUS=$(printf '%s' "$RESPONSE" | tail -n1)
PAYLOAD=$(printf '%s' "$RESPONSE" | sed '$d')

if [ "$STATUS" != "200" ] && [ "$STATUS" != "201" ]; then
  echo "HTTP $STATUS" >&2
  printf '%s\n' "$PAYLOAD" >&2
  exit 1
fi

printf '%s\n' "$PAYLOAD" | python3 -m json.tool 2>/dev/null || printf '%s\n' "$PAYLOAD"
