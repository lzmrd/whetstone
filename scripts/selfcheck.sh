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
# memory. Both are now asserted on every run, in both directions: a checker
# that called everything different would pass the negative test and fail the
# positive one.
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

step "gate check 1/2 (negative) — hevm must REFUSE two contracts differing only in revert payload"
if grep -q 'NOT EQUIVALENT' <<<"$(run ./scripts/equiv.sh RevertA RevertB 'f(uint256)')"; then
  ok "revert payloads are compared — the equivalence gate covers the case our targets diverge on"
else
  bad "hevm did NOT distinguish ErrA() from ErrB(). Every equivalence claim in this repo is void."
  echo "     This is the failure mode the check exists for: hevm's documented notion"
  echo "     of equivalence does not mention revert payloads, so a release may stop"
  echo "     comparing them without it being a regression on their side."
fi

step "gate check 2/2 (positive) — hevm must ACCEPT two contracts that genuinely agree"
if grep -q 'LABEL: FORMAL' <<<"$(run ./scripts/equiv.sh SameA SameB 'f(uint256)')"; then
  ok "a real equivalence is still provable — the checker is not simply saying 'different'"
else
  bad "hevm failed to prove x & 0xff equivalent to x % 256. The checker is not trustworthy."
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
