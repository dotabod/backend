#!/usr/bin/env bash
# Authenticated HubSpot reads for the support pipeline.
#
# The token is pulled from Doppler each run rather than passed as an argument, so
# it never lands in shell history or a process list someone can read.
#
#   hs.sh scopes              # which scopes actually work (they can't be read back)
#   hs.sh flow <flowId>       # live workflow: source, secrets, runtime, enabled
#   hs.sh ticket <ticketId>   # ticket + its contact association
#   hs.sh thread <ticketId>   # conversation thread + who opened it
#   hs.sh messages <threadId> # messages with delivery statusType
set -euo pipefail

HS=https://api.hubapi.com

token() {
  doppler secrets get HUBSPOT_PRIVATE_APP_TOKEN \
    --project dotabod-frontend --config prd --plain 2>/dev/null
}

TOKEN="$(token)"
[ -n "$TOKEN" ] || { echo "No HUBSPOT_PRIVATE_APP_TOKEN from Doppler. Run 'doppler login'." >&2; exit 1; }

get() { curl -sS -H "Authorization: Bearer $TOKEN" "$@"; }
py() { python3 -c "$1"; }

case "${1:-}" in
  scopes)
    # Scopes are UI-only and unreadable via API, so probe them with real calls.
    for pair in "tickets:/crm/v3/objects/tickets?limit=1" \
                "automation:/automation/v4/flows?limit=1" \
                "conversations:/conversations/v3/conversations/channels"; do
      name=${pair%%:*}; path=${pair#*:}
      code=$(get -o /dev/null -w '%{http_code}' "$HS$path")
      printf '%-14s %s %s\n' "$name" "$code" \
        "$([ "$code" = 200 ] && echo ok || echo MISSING)"
    done
    ;;

  flow)
    [ $# -ge 2 ] || { echo "usage: hs.sh flow <flowId>" >&2; exit 2; }
    get "$HS/automation/v4/flows/$2" | py '
import json,sys
d=json.load(sys.stdin)
print("name      :", d.get("name"))
print("enabled   :", d.get("isEnabled"))
print("objectType:", d.get("objectTypeId"), "(0-5 = ticket)")
for a in d.get("actions", []):
    print("--- action", a.get("actionId"), a.get("type"), a.get("runtime") or "")
    print("secrets   :", a.get("secretNames"))
    print("inputs    :", a.get("inputFields"))
    src = a.get("sourceCode")
    if src:
        print("--- sourceCode (%d bytes) ---" % len(src)); print(src)
'
    ;;

  ticket)
    [ $# -ge 2 ] || { echo "usage: hs.sh ticket <ticketId>" >&2; exit 2; }
    get "$HS/crm/v3/objects/tickets/$2?properties=subject,content,hs_ticket_priority,hs_conversations_originating_thread_id&associations=contacts" \
      | py '
import json,sys
d=json.load(sys.stdin); p=d.get("properties",{})
print("subject :", p.get("subject"))
print("priority:", p.get("hs_ticket_priority"))
print("threadId:", p.get("hs_conversations_originating_thread_id"))
c=((d.get("associations") or {}).get("contacts") or {}).get("results") or []
# Empty right after creation is the known association race, not a bug.
print("contacts:", [x.get("id") for x in c] or "none yet (race? retry in ~3s)")
print("content :", (p.get("content") or "")[:400])
'
    ;;

  thread)
    [ $# -ge 2 ] || { echo "usage: hs.sh thread <ticketId>" >&2; exit 2; }
    tid=$(get "$HS/crm/v3/objects/tickets/$2?properties=hs_conversations_originating_thread_id" \
          | py 'import json,sys; print(json.load(sys.stdin).get("properties",{}).get("hs_conversations_originating_thread_id") or "")')
    [ -n "$tid" ] || { echo "ticket $2 has no originating thread"; exit 1; }
    echo "threadId: $tid"
    get "$HS/conversations/v3/conversations/threads/$tid/messages" | py '
import json,sys
for m in json.load(sys.stdin).get("results", []):
    if m.get("type") != "MESSAGE": continue
    di = (m.get("senders") or [{}])[0].get("deliveryIdentifier") or {}
    # Only HS_EMAIL_ADDRESS is repliable. Chat threads carry an opaque id instead.
    print(m.get("direction"), "|", di.get("type"), "|", di.get("value"),
          "|", (m.get("status") or {}).get("statusType"))
'
    ;;

  messages)
    [ $# -ge 2 ] || { echo "usage: hs.sh messages <threadId>" >&2; exit 2; }
    # statusType is the real delivery result; a 200 on send does not mean delivered.
    # It is nested under "status", not top-level -- reading m["statusType"] gives None.
    get "$HS/conversations/v3/conversations/threads/$2/messages" | py '
import json,sys
for m in json.load(sys.stdin).get("results", []):
    print(m.get("id"), m.get("direction"),
          (m.get("status") or {}).get("statusType"), "|",
          (m.get("text") or "")[:80].replace("\n"," "))
'
    ;;

  *)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
