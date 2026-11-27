#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
scratch="$(mktemp -d)"
trap 'rm -rf -- "$scratch"' EXIT
jar="$scratch/tla2tools.jar"
curl --fail --silent --show-error --location --retry 3 \
  https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar -o "$jar"
printf '%s  %s\n' 936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88 "$jar" |
  sha256sum --check

check() {
  local mode="$1" config="$scratch/$1.cfg"
  cat > "$config" <<CONFIG
INIT Init
NEXT Next
CONSTANT Attempts = 3
CONSTANT Mode = "$mode"
INVARIANT RemoveEachChannelOnce
INVARIANT OnlyOwnerMayRetire
CHECK_DEADLOCK FALSE
CONFIG
  java -XX:+UseSerialGC -cp "$jar" tlc2.TLC -workers 1 -metadir "$scratch/$mode" \
    -config "$config" RealtimeWatcher.tla
}

check fixed
for variant in reentrant global; do
  case "$variant" in
    reentrant) invariant=RemoveEachChannelOnce ;;
    global) invariant=OnlyOwnerMayRetire ;;
  esac
  log="$scratch/$variant.log"
  if check "$variant" > "$log" 2>&1; then
    cat "$log"
    printf 'Expected %s to violate %s\n' "$variant" "$invariant" >&2
    exit 1
  fi
  cat "$log"
  grep -F "Invariant $invariant is violated." "$log"
done
