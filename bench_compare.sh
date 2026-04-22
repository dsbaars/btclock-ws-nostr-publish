#!/usr/bin/env bash
# Compare Go ws-node vs Node.js ws-server under identical load.
#
# For each server:
#   - start on :8080
#   - wait for upstream to populate a price (so subscribes land warm)
#   - run wsbench against it
#   - capture RSS + CPU during the run
#   - shut it down
#
# Run from the repo root.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
N=${N:-1000}
DURATION=${DURATION:-30s}
WARMUP=${WARMUP:-5s}
RAMP=${RAMP:-5s}
OUT=${OUT:-$REPO/bench-results}
mkdir -p "$OUT"

WSBENCH="$REPO/go-server/bin/wsbench"
[[ -x "$WSBENCH" ]] || { echo "build wsbench first: (cd go-server && go build -tags nozmq -o bin/wsbench ./cmd/wsbench)"; exit 1; }

# Reusable: background a command, wait for readiness, sample RSS, then bench.
run_bench() {
    local label=$1; shift
    local start_cmd=("$@")

    # Ensure 8080 is free.
    if pid_on_port=$(lsof -ti tcp:8080 2>/dev/null); then
        kill "$pid_on_port" 2>/dev/null || true
        sleep 1
    fi

    local log="$OUT/$label.server.log"
    echo "---- starting $label: ${start_cmd[*]} ----"
    "${start_cmd[@]}" > "$log" 2>&1 &
    local srv_pid=$!

    # Wait for /api/lastprice to return something non-empty.
    for _ in $(seq 1 40); do
        local body
        body=$(curl -fsS --max-time 2 http://localhost:8080/api/lastprice 2>/dev/null || true)
        if [[ "$body" == *":\""* ]]; then break; fi
        sleep 0.5
    done
    # Extra settle so the WS ticker has run a couple of frames.
    sleep 3

    # Sample server RSS + CPU during the bench window.
    local stats_out="$OUT/$label.server.stats.txt"
    (
        while kill -0 "$srv_pid" 2>/dev/null; do
            ps -o pid=,rss=,%cpu=,time= -p "$srv_pid" 2>/dev/null || break
            sleep 1
        done
    ) > "$stats_out" &
    local watcher_pid=$!

    # Run the bench.
    "$WSBENCH" \
        -url "ws://localhost:8080/api/v2/ws" \
        -label "$label" \
        -n "$N" \
        -warmup "$WARMUP" \
        -duration "$DURATION" \
        -ramp "$RAMP" \
        -json | tee "$OUT/$label.wsbench.json" | jq -r '
            "=== " + .label + " ===",
            "  connected        \(.clients_connected)/\(.clients)  (failed \(.clients_failed))",
            "  connect ms       p50=\(.connect_ms.p50 // 0)  p95=\(.connect_ms.p95 // 0)  p99=\(.connect_ms.p99 // 0)",
            "  first-frame ms   p50=\(.first_frame_ms.p50 // 0)  p95=\(.first_frame_ms.p95 // 0)  p99=\(.first_frame_ms.p99 // 0)",
            "  frames           \(.aggregate_frames)  (\(.aggregate_frames_per_sec)/s, \(.mean_frames_per_client)/client)",
            "  bytes            \(.aggregate_bytes)  (\(.aggregate_bytes_per_sec / 1024)kB/s)",
            "  errors           \(.errors)"
        '

    # Tear down.
    kill "$watcher_pid" 2>/dev/null || true
    kill "$srv_pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
        if kill -0 "$srv_pid" 2>/dev/null; then sleep 1; else break; fi
    done
    kill -9 "$srv_pid" 2>/dev/null || true

    # Summarise RSS (MB) + CPU time from the samples.
    awk '
        NR==1 { first_rss=$2 }
        { last_rss=$2; last_cpu=$3; last_time=$4; n++ }
        { sum_rss+=$2; if ($2>max_rss) max_rss=$2 }
        END {
            if (n==0) exit
            printf "  rss samples=%d  first=%dMB  avg=%dMB  peak=%dMB  last_cpu=%s  last_time=%s\n",
                n, first_rss/1024, (sum_rss/n)/1024, max_rss/1024, last_cpu, last_time
        }
    ' "$stats_out"
}

# Build fresh binaries.
echo "building Go ws-node…"
( cd "$REPO/go-server" && go build -tags nozmq -o bin/ws-node ./cmd/ws-node )

echo
run_bench node "$REPO/node_modules/.bin/tsx" "$REPO/index.ts"
echo
run_bench go   "$REPO/go-server/bin/ws-node"
echo
echo "results saved to $OUT/"
