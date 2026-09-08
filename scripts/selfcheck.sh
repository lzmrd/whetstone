#!/usr/bin/env bash
# Gate self-check. Runs before every measured run, and fails the run if the
# instruments the score depends on are not behaving.
#
# ⚠️ WHY THIS EXISTS. Two load-bearing properties of this project were
# established once, by hand, on day 1, and then simply believed:
#
#   1. hevm compares REVERT PAYLOADS. Its documentation states only "same
#      return value, same storage, matching success/failure". The whole
#      equivalence gate is worthless for our targets if it does not, because
#      OpenZeppelin and solady diverge precisely on revert reasons. The
#      behaviour is undocumented, so it can change between hevm releases
#      without anyone announcing it.
#
#   2. The gas instrument is order-neutral. Two earlier instruments were not,
#      and both wrote numbers into the spec before anyone checked.
#
# A load-bearing property verified once by hand is not a property, it is a
# memory. Both are now asserted on every run, in ALL THREE directions: a checker
# that called everything different would pass the negative test and fail the
# positive one, and a checker that called an unfinished exploration a proof would
# pass both and fail the third.
set -uo pipefail

# ⚠️ equiv.sh exits non-zero on a refutation, which for check 1 is the SUCCESS
# case. Piping it into grep under `pipefail` makes the pipeline inherit that
# exit code, so the check reported "hevm did not distinguish ErrA from ErrB"
# while equiv.sh was printing exactly that distinction. Capture, then match.
run() { "$@" 2>&1 || true; }
cd "$(dirname "$0")/.."
source .envrc.sh

fail=0
step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗ %s\033[0m\n' "$1"; fail=1; }

step "checker identity — goes into the receipt, because the behaviour below is undocumented"
HEVM_VERSION=$(hevm version 2>&1 | head -1)
SOLC_VERSION=$(solc --version 2>&1 | tail -1)
FORGE_VERSION=$(forge --version 2>&1 | head -1)
echo "  hevm  $HEVM_VERSION"
echo "  solc  $SOLC_VERSION"
echo "  forge $FORGE_VERSION"

step "gate check 1/3 (negative) — hevm must REFUSE two contracts differing only in revert payload"
if grep -q 'NOT EQUIVALENT' <<<"$(run ./scripts/equiv.sh RevertA RevertB 'f(uint256)')"; then
  ok "revert payloads are compared — the equivalence gate covers the case our targets diverge on"
else
  bad "hevm did NOT distinguish ErrA() from ErrB(). Every equivalence claim in this repo is void."
  echo "     This is the failure mode the check exists for: hevm's documented notion"
  echo "     of equivalence does not mention revert payloads, so a release may stop"
  echo "     comparing them without it being a regression on their side."
fi

step "gate check 2/3 (positive) — hevm must ACCEPT two contracts that genuinely agree"
if grep -q 'LABEL: FORMAL' <<<"$(run ./scripts/equiv.sh SameA SameB 'f(uint256)')"; then
  ok "a real equivalence is still provable — the checker is not simply saying 'different'"
else
  bad "hevm failed to prove x & 0xff equivalent to x % 256. The checker is not trustworthy."
fi

step "gate check 3/3 (incomplete) — partial exploration must NEVER earn a FORMAL label"
#
# ⚠️ The third direction, and the only dangerous one. Checks 1 and 2 fail toward
# REFUSAL, which is safe. This one guards the path that fails toward an
# OVERCLAIM: if hevm's wording changes, an exploration that stopped early could
# be read as a completed proof and UNKNOWN would silently become
# FORMAL_NO_EXPLICIT_INPUT_BOUND. It had been verified zero times, on a project
# that pins the checker version precisely because its behaviour is undocumented.
#
# `toString` returns `string memory` and is intractable for the symbolic engine;
# bounding iterations makes the incompleteness fast and deterministic (~6 s)
# rather than waiting for a solver to exhaust memory.
#
# ⚠️ The assertion is on the LABEL, not on the marker string. Observed with hevm
# 0.58.0: a partial exploration is reported as [FAIL] + a partial warning, never
# as [PASS] + a partial warning -- so the PASS and partial markers appear to be
# mutually exclusive and the overclaim may not currently be reachable at all.
# That is an observation about one version of an undocumented behaviour, which is
# exactly the class of fact this file exists to stop believing. Asserting the
# label covers the case whichever internal marker moves.
out3=$(MAXITER=1 TIMEOUT=20 SOLVERS=1 run ./scripts/equiv.sh OzToString SdToString 'f(uint256)')
if grep -q 'LABEL: UNKNOWN' <<<"$out3"; then
  ok "an incomplete exploration is labelled UNKNOWN, not proved"
elif grep -q 'LABEL: FORMAL' <<<"$out3"; then
  bad "an INCOMPLETE exploration earned a FORMAL label. Every proof claim in this repo is suspect."
  echo "     hevm stopped early and the harness read it as a completed proof."
  echo "     This is the one failure direction that overclaims instead of refusing."
else
  bad "the intractable pair produced neither UNKNOWN nor FORMAL — the label logic no longer matches hevm's output"
fi

step "instrument check — gas measurement must be order-neutral, and the scenario must be the committed vector"
if forge test --match-contract 'OrderControlTest|HarnessSelfCheckTest' >/dev/null 2>&1; then
  ok "order bias is 0, the scenario digest matches, and the input domain is exercised"
else
  bad "instrument or scenario check failed — run 'forge test -vv' for the detail"
fi

echo
if [ "$fail" = 0 ]; then
  printf '\033[32m▸ self-check passed. Measured runs may proceed.\033[0m\n'
else
  printf '\033[31m▸ SELF-CHECK FAILED. No run may be scored or published.\033[0m\n'
fi
exit $fail
