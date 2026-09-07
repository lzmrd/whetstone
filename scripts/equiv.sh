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
partial=$(grep -c 'partially explore' "$OUT/result.txt" || true)
if grep -q 'behave equivalently' "$OUT/result.txt"; then
  if [ "$partial" -gt 0 ]; then
    echo "▸ LABEL: UNKNOWN  — no difference found, but exploration was partial."
    echo "         Partial exploration is NOT a proof of equivalence."
  elif [ -n "${MAXITER:-}" ] && [ "${MAXITER}" != "-1" ]; then
    echo "▸ LABEL: FORMAL_BOUNDED  (max-iterations=${MAXITER})"
  else
    echo "▸ LABEL: FORMAL_NO_EXPLICIT_INPUT_BOUND"
    echo "         …within the ABI domain and the wrapper assumptions."
  fi
else
  echo "▸ NOT EQUIVALENT — counterexample above."
  echo "         A counterexample stays sound even under partial exploration:"
  echo "         it is a claim about one input, checkable by running both."
fi
exit $code
