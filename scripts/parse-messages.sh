#!/usr/bin/env bash
set -euo pipefail

# parse-messages.sh
# Usage: ./scripts/parse-messages.sh <log-json> <messages-array-out> <parsed-with-data-out>
# Order of operations:
#  1) Take the JSON log file and produce an array of its "message" values to <messages-array-out>.
#  2) Use that messages array (array of JSON strings) and produce destringified objects with parsed .data to <parsed-with-data-out>.
# Produces a single output where:
#  - Each array element is destringified from JSON
#  - If an object has a string .data, it is parsed into an object when valid
# Additionally, if a third argument is provided pointing to a JSON log file
# that contains objects with a "message" field, it will emit an array of those
# message values to the 4th argument (default: messages.only.json).

# Positional args
log_in=${1:-}
messages_out=${2:-messages.only.json}
out=${3:-messages.parsed.with_data.json}

# Ensure jq is present
if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found on PATH. Please install jq >= 1.6." >&2
  exit 1
fi

# Step 1: Extract messages from the log JSON to messages_out
if [[ -z "${log_in}" ]]; then
  echo "Usage: $0 <log-json> <messages-array-out> <messages-json> <parsed-with-data-out>" >&2
  exit 1
fi
if [[ ! -f "${log_in}" ]]; then
  echo "Log JSON input not found: ${log_in}" >&2
  exit 1
fi
# Collect every .message found anywhere in the structure, sanitize, and emit as a flat array.
# Sanitization per element:
#  - Strip everything before the first occurrence of '{"'
#  - Remove all literal newlines ("\n") within the string
# Note on escaping: we want to match everything up to the first literal {".
# Using a character class to avoid heavy escaping: \{" becomes \{\" in jq string.
jq '[
      (.. | objects | select(has("message")) | .message)
      | strings
      | sub("^[^{]*(?=\\{\\\")"; "")
      | gsub("\n"; "")
    ]' "${log_in}" > "${messages_out}"
echo "Wrote ${messages_out}" >&2
echo "Messages extracted: $(jq 'length' "${messages_out}")" >&2

# Step 2: Parse the messages array we just created (array of JSON strings)
# Produce single output with inner .data parsed when possible, reading from the file we wrote in step 1
jq '
  def parse_data_fields:
    if type == "object" then
      with_entries(
        if .key == "data" then
          .value |= (
            if type == "string" then
              (fromjson? // .) | parse_data_fields
            else
              parse_data_fields
            end
          )
        else
          .value |= parse_data_fields
        end
      )
    elif type == "array" then
      map(parse_data_fields)
    else
      .
    end;

  [.[]
    | select(type=="string")
    | fromjson?
    | parse_data_fields
  ]
' "$messages_out" > "$out"
echo "Wrote $out" >&2

# Quick summary
count=$(jq 'length' "$out" 2>/dev/null || echo 0)
echo "Entries in $out: $count" >&2

# End of script
