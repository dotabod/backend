#!/usr/bin/env bash
#
# extract-icons.sh — DRAFT, NOT WIRED INTO PROD.
#
# Extract canonical in-game top-bar hero icons (including arcana/persona variants)
# from the real Dota 2 (app 570) VPK and emit them as detector templates named
# {id}_icon[_variant].png under assets/dota_heroes/.
#
# This is illustrative. It was NOT executed during research (the task forbids
# downloading the game). Validate the depot IDs, anonymous access, and the
# DepotDownloader -filelist footprint on a real runner before trusting it.
#
# Pipeline:
#   1. DepotDownloader (anonymous) -> pull game/dota/pak01* from a content depot.
#   2. Source2Viewer-CLI -> decompile panorama/images/heroes/icons/*.vtex_c -> PNG.
#   3. Map npc_dota_hero_<tag>[_<variant>] -> {id}_icon[_<variant>].png using our
#      existing hero list (tag -> numeric id).
#
set -euo pipefail

# --- config ------------------------------------------------------------------
APP_ID=570
# Content depot that contains the panorama VPK. VERIFY current IDs on SteamDB:
#   https://steamdb.info/app/570/depots/   (they change per build)
# Historically the 3733xx / 3814xx content depots. 373301 shown as an example.
DEPOT_ID="${DEPOT_ID:-373301}"

WORK_DIR="${WORK_DIR:-/mnt/dota}"          # large partition on GH runners
DL_DIR="${WORK_DIR}/download"
EXPORT_DIR="${WORK_DIR}/export"
ASSETS_DIR="${ASSETS_DIR:-assets/dota_heroes}"

VRF_VERSION="${VRF_VERSION:-19.1}"
VRF_ZIP="cli-linux-x64.zip"
VRF_URL="https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/${VRF_VERSION}/${VRF_ZIP}"

ICONS_VPK_PATH="panorama/images/heroes/icons/"
VPK="${DL_DIR}/game/dota/pak01_dir.vpk"

# Restrict what DepotDownloader writes to disk. The numbered pak01_NNN chunks must
# be allowed too, because pak01_dir.vpk only indexes data stored in those chunks.
FILELIST="${WORK_DIR}/filelist.txt"

mkdir -p "${DL_DIR}" "${EXPORT_DIR}" "${ASSETS_DIR}"

# --- 1. install tools --------------------------------------------------------
install_depotdownloader() {
  if ! command -v DepotDownloader >/dev/null 2>&1 && ! command -v depotdownloader >/dev/null 2>&1; then
    echo ">> installing DepotDownloader (dotnet global tool)"
    dotnet tool install --global DepotDownloader
    export PATH="${PATH}:${HOME}/.dotnet/tools"
  fi
}

install_vrf() {
  if [ ! -x "${WORK_DIR}/vrf/Source2Viewer-CLI" ]; then
    echo ">> installing ValveResourceFormat ${VRF_VERSION}"
    mkdir -p "${WORK_DIR}/vrf"
    curl -fsSL "${VRF_URL}" -o "${WORK_DIR}/${VRF_ZIP}"
    unzip -o "${WORK_DIR}/${VRF_ZIP}" -d "${WORK_DIR}/vrf"
    chmod +x "${WORK_DIR}/vrf/Source2Viewer-CLI"
  fi
}

# --- 2. download the panorama VPK (anonymous) --------------------------------
download_vpk() {
  # -filelist takes regex (one per line). Match the dir VPK and its data chunks.
  cat > "${FILELIST}" <<'EOF'
regex:game/dota/pak01_dir\.vpk$
regex:game/dota/pak01_[0-9]+\.vpk$
EOF

  echo ">> downloading app ${APP_ID} depot ${DEPOT_ID} (anonymous) -> ${DL_DIR}"
  # NOTE: if anonymous fails with "App is not available from this account", a real
  # Steam account (-username / -password) is required. We do NOT want creds in CI;
  # treat that as a hard failure and surface it.
  DepotDownloader \
    -app "${APP_ID}" \
    -depot "${DEPOT_ID}" \
    -filelist "${FILELIST}" \
    -dir "${DL_DIR}"

  if [ ! -f "${VPK}" ]; then
    echo "!! pak01_dir.vpk not found at ${VPK} — wrong depot id or anonymous denied" >&2
    exit 1
  fi
}

# --- 3. decompile only the icons folder to PNG -------------------------------
decompile_icons() {
  echo ">> decompiling ${ICONS_VPK_PATH} -> ${EXPORT_DIR}"
  "${WORK_DIR}/vrf/Source2Viewer-CLI" \
    -i "${VPK}" \
    -o "${EXPORT_DIR}" \
    -d \
    -f "${ICONS_VPK_PATH}" \
    -e "vtex_c"
  # Result: ${EXPORT_DIR}/panorama/images/heroes/icons/npc_dota_hero_<tag>[_<variant>]_png.png
}

# --- 4. map tag -> numeric hero id and rename --------------------------------
# Emits {id}_icon[_<variant>].png so this is purely ADDITIVE (does not clobber the
# existing Spectral landscape templates). The matcher globs {id}_*.png.
map_and_install() {
  echo ">> mapping icons to {id}_icon[_variant].png"
  python3 "$(dirname "$0")/map_icons.py" \
    --src "${EXPORT_DIR}/panorama/images/heroes/icons" \
    --dest "${ASSETS_DIR}"
  # Invalidate precomputed template cache so the detector recomputes templates.
  rm -f "${ASSETS_DIR}/templates_cache.npz"
}

main() {
  install_depotdownloader
  install_vrf
  download_vpk
  decompile_icons
  map_and_install
  echo ">> done. New icon templates in ${ASSETS_DIR}"
}

main "$@"
