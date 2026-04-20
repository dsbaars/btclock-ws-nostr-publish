#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
fi

: "${BTCLOCK_FIRMWARE_SRC:?Set BTCLOCK_FIRMWARE_SRC in .env to your btclock_v3_fci checkout (see .env.sample)}"
: "${NUM_SCREENS:=7}"
: "${EMSCRIPTEN_MIN_VERSION:=3.1.0}"

if ! command -v em++ >/dev/null 2>&1; then
    echo "em++ not found in PATH — install Emscripten >= ${EMSCRIPTEN_MIN_VERSION}" >&2
    exit 127
fi

em_version=$(em++ --version | head -n1 | sed -nE 's/.*[[:space:]]([0-9]+\.[0-9]+\.[0-9]+).*/\1/p')
if [ -z "$em_version" ]; then
    echo "Could not parse em++ --version output" >&2
    exit 1
fi
if ! printf '%s\n%s\n' "$EMSCRIPTEN_MIN_VERSION" "$em_version" | sort -VC; then
    echo "em++ ${em_version} is older than required ${EMSCRIPTEN_MIN_VERSION}" >&2
    exit 1
fi

firmware_src="${BTCLOCK_FIRMWARE_SRC%/}/lib/btclock"
if [ ! -f "${firmware_src}/data_handler.cpp" ]; then
    echo "BTCLOCK_FIRMWARE_SRC=${BTCLOCK_FIRMWARE_SRC} does not look like a btclock_v3_fci checkout" >&2
    echo "  (missing ${firmware_src}/data_handler.cpp)" >&2
    exit 1
fi

em++ -lembind -std=gnu++17 "-DNUM_SCREENS=${NUM_SCREENS}" \
    "${firmware_src}/utils.cpp" "${firmware_src}/data_handler.cpp" \
    -o src/js/btclock_datahandler.js \
    -sEXPORTED_RUNTIME_METHODS=ccall \
    --no-entry

node scripts/check_wasm_types.mjs "${firmware_src}/data_handler.cpp" src/btclock_module.ts
