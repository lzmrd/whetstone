#!/usr/bin/env bash
#
# Run scripts/equiv.sh under a HARD MEMORY CAP, detached from the terminal that
# launched it.
#
#   ./scripts/prove.sh UniVanity UniVanityFast 'f(uint256)'
#   MEM=8G MAXITER=64 WALL=3600 ./scripts/prove.sh A B 'f(uint256)'
#
# ⚠️ Why the cap exists. hevm's symbolic exploration of a loop-heavy function
# grows without bound. On this machine it has twice been killed mid-run by the
# kernel's OOM killer -- which does not necessarily choose hevm. It took the
# editor with it, and the first time the job simply vanished, leaving a log
# that stopped at "compiled" and no indication of why. A cgroup limit makes
# hevm the process that dies: a failed proof is information, a dead desktop is
# not, and a run that ends inside its own limit leaves a log saying so.
#
# ⚠️ Why a transient systemd SERVICE and not `systemd-run --scope`, and not a
# backgrounded `&`. All three were tried, in that order, and the first two die
# for the same reason in different clothes: a plain `&` shares the terminal's
# process group and takes the SIGHUP that closing the window sends, and a
# `--scope` is owned by whatever launched it, so it received SIGTERM the instant
# the launching shell returned (exit 143, twenty-five seconds in). A transient
# service is owned by systemd, so it outlives the terminal, the editor, and the
# shell that started it. Stop one deliberately with:
#     systemctl --user stop whetstone-proof-<A>-<B>
set -euo pipefail
cd "$(dirname "$0")/.."

# ── the detached half, invoked by systemd ─────────────────────────────────
#
# ⚠️ It exists only so the log records HOW a run ended. Pointing the unit
# straight at equiv.sh left a log whose last line was "hevm equivalence [...]"
# and a zero-byte result file -- indistinguishable, from the log alone, between
# "still running", "crashed" and "hit the cap". The exit status is the finding.
if [ "${1:-}" = "--worker" ]; then
  shift
  A="$1"; B="$2"; SIG="$3"; WALL="$4"; MEM="$5"
  set +e
  timeout "$WALL" ./scripts/equiv.sh "$A" "$B" "$SIG"
  status=$?
  set -e
  echo "=== exit $status at $(date -Is)"
  case $status in
    124) echo "=== ENDED ON THE WALL CLOCK (${WALL}s). Neither a proof nor a refutation." ;;
    137) echo "=== KILLED (signal 9) at the $MEM cap. hevm could not fit this function." ;;
  esac
  exit $status
fi

# ── the launcher ───────────────────────────────────────────────────────────
A="${1:?first contract name}"
B="${2:?second contract name}"
SIG="${3:?function signature, e.g. f(uint256)}"

MEM="${MEM:-6G}"
WALL="${WALL:-3600}"
LOGDIR=".run/proofs"
OUTDIR="$LOGDIR/$A-$B"
LOG="$LOGDIR/$A-$B.log"
mkdir -p "$OUTDIR"

USE_CGROUP=0
if command -v systemd-run >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  USE_CGROUP=1
fi

echo "▸ $A vs $B   sig $SIG"
echo "  memory cap $MEM · wall clock ${WALL}s · max-iterations ${MAXITER:--1}"
[ "$USE_CGROUP" = 1 ] && echo "  limit: systemd cgroup MemoryMax=$MEM" \
                      || echo "  ⚠️ limit: ulimit -v fallback (address space, not RSS)"

UNIT="whetstone-proof-$(echo "$A-$B" | tr -c 'A-Za-z0-9-' '-')"
ABS_LOG="$PWD/$LOG"
ABS_OUT="$PWD/$OUTDIR"

{
  echo "=== $(date -Is)  $A vs $B  sig=$SIG  mem=$MEM  wall=${WALL}s  maxiter=${MAXITER:--1}"
} >> "$LOG"

if [ "$USE_CGROUP" = 1 ]; then
  systemctl --user reset-failed "$UNIT" 2>/dev/null || true
  systemd-run --user --quiet --unit="$UNIT" --collect \
    -p MemoryMax="$MEM" -p MemorySwapMax=0 \
    -p WorkingDirectory="$PWD" \
    -p StandardOutput="append:$ABS_LOG" -p StandardError="append:$ABS_LOG" \
    --setenv=OUT="$ABS_OUT" \
    ${MAXITER:+--setenv=MAXITER="$MAXITER"} \
    ${SOLVER:+--setenv=SOLVER="$SOLVER"} \
    ${TIMEOUT:+--setenv=TIMEOUT="$TIMEOUT"} \
    "$PWD/scripts/prove.sh" --worker "$A" "$B" "$SIG" "$WALL" "$MEM"
  echo "  launched as systemd unit $UNIT -- owned by systemd, not by this shell."
  echo "  follow it:  tail -f $LOG"
  echo "  status:     systemctl --user status $UNIT"
  echo "  stop it:    systemctl --user stop $UNIT"
else
  # No user systemd. ulimit bounds ADDRESS SPACE rather than resident memory --
  # cruder, and hevm may then fail in a way that looks like a crash.
  setsid nohup bash -c "ulimit -v $(( ${MEM%G} * 1024 * 1024 )) || true
    OUT=$ABS_OUT timeout $WALL ./scripts/equiv.sh $A $B '$SIG'
    echo \"=== exit \$? at \$(date -Is)\"" >> "$LOG" 2>&1 < /dev/null &
  disown 2>/dev/null || true
  echo "  launched detached (ulimit fallback). follow it:  tail -f $LOG"
fi
