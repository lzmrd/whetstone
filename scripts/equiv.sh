#!/usr/bin/env bash
# Build two spike contracts, extract their runtime bytecode, and prove or
# refute equivalence with hevm.
#
#   ./scripts/equiv.sh OzMulDiv RestoredMulDiv 'f(uint256,uint256,uint256)'
#
# Env overrides:  SOLVER=z3|bitwuzla  TIMEOUT=<s>  SOLVERS=<n>  MAXITER=<n>
set -euo pipefail
cd "$(dirname "$0")/.."
source .envrc.sh

A="${1:?first contract name}"
B="${2:?second contract name}"
SIG="${3:?function signature, e.g. f(uint256,uint256,uint256)}"

SOLVER="${SOLVER:-bitwuzla}"
TIMEOUT="${TIMEOUT:-300}"
SOLVERS="${SOLVERS:-2}"
OUT="${OUT:-$(mktemp -d)}"

forge build --contracts contracts/src/spike >/dev/null

extract() {  # $1 = contract name
  local f
  f=$(find out -name "$1.json" | head -1)
  [ -n "$f" ] || { echo "✗ artifact for $1 not found — did it compile?" >&2; exit 1; }
  python3 -c "
import json,sys
b=json.load(open('$f'))['deployedBytecode']['object']
if not b or b=='0x': sys.exit('✗ $1 has empty runtime bytecode')
print(b, end='')" > "$OUT/$1.hex"
  echo "  $1: $(( $(wc -c < "$OUT/$1.hex") / 2 )) bytes"
}

echo "▸ extracting"
extract "$A"
extract "$B"

echo "▸ hevm equivalence  [$SOLVER, ${TIMEOUT}s, ${SOLVERS} solver(s)]"
set +e
hevm equivalence \
  --code-a-file "$OUT/$A.hex" \
  --code-b-file "$OUT/$B.hex" \
  --sig "$SIG" \
  --solver "$SOLVER" \
  --smt-timeout "$TIMEOUT" \
  --num-solvers "$SOLVERS" \
  ${MAXITER:+--max-iterations "$MAXITER"} \
  > "$OUT/result.txt" 2>&1
code=$?
set -e

head -6 "$OUT/result.txt"
echo "  …full output: $OUT/result.txt"

# ── the label this run earns ────────────────────────────────────────────
#
# ⚠️ Match on hevm's [PASS]/[FAIL] marker, NOT on the phrase "behave
# equivalently". hevm prints "Contracts behave equivalently" on success and
# "Contracts may not behave equivalently" on failure -- the failure string
# CONTAINS the success string, so a substring test reports every failure as a
# pass. That bug was live in this script and was caught only because a run
# happened to be inspected by hand.
strip() { sed -r 's/\x1B\[[0-9;]*[mK]//g' "$1"; }
plain=$(strip "$OUT/result.txt")

partial=0;  grep -q 'partially explore'         <<<"$plain" && partial=1
passed=0;   grep -q '\[PASS\] Contracts behave' <<<"$plain" && passed=1
cex=0;      grep -qiE 'calldata|counterexample'  <<<"$plain" && cex=1

if [ "$cex" = 1 ]; then
  echo "▸ NOT EQUIVALENT -- counterexample above."
  echo "         A counterexample stays sound even under partial exploration:"
  echo "         it is a claim about one input, checkable by running both."
elif [ "$passed" = 1 ] && [ "$partial" = 0 ]; then
  if [ -n "${MAXITER:-}" ] && [ "${MAXITER}" != "-1" ]; then
    echo "▸ LABEL: FORMAL_BOUNDED  (max-iterations=${MAXITER})"
  else
    echo "▸ LABEL: FORMAL_NO_EXPLICIT_INPUT_BOUND"
    echo "         …within the ABI domain and the wrapper assumptions."
  fi
else
  echo "▸ LABEL: UNKNOWN -- exploration was incomplete and no counterexample was found."
  echo "         Neither a proof nor a refutation. Incomplete exploration is NOT"
  echo "         evidence of equivalence, and must never be reported as one."
fi

# ── what the receipt must carry ─────────────────────────────────────────
# The revert-payload behaviour this project depends on is undocumented, so the
# checker version is part of the claim, not metadata.
echo "▸ checker: $(hevm version 2>&1 | head -1) | solver=$SOLVER | max-iterations=${MAXITER:--1}"
exit $code
