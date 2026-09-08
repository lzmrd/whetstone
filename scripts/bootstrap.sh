#!/usr/bin/env bash
# Provision everything a fresh clone needs to reproduce a Whetstone result.
#
#   ./scripts/bootstrap.sh          # libraries + solver toolchain
#   ./scripts/bootstrap.sh libs     # libraries only (enough for `forge test`)
#
# ⚠️ Why this file exists. The whole point of the project is that a published
# receipt can be recomputed by a third party. `lib/` and `.tools/` are ignored by
# git (vendored tarballs and large binaries), so without this script a clone
# builds nothing and the verifiability claim is decoration.
#
# ⚠️ Every version below is part of the claim, not packaging. Gas numbers are
# only comparable under the pinned solc, and an equivalence LABEL is only
# meaningful under the checker and solver that produced it -- the revert-payload
# behaviour this project depends on is undocumented hevm behaviour (D-03).
set -euo pipefail
cd "$(dirname "$0")/.."

WHAT="${1:-all}"

# ── pinned versions ─────────────────────────────────────────────────────────
OZ_VER=v5.7.0            # mirrors OpenZeppelin's own foundry.toml, see foundry.toml
SOLADY_VER=v0.1.26
FORGE_STD_VER=v1.16.2
SOLC_VER=0.8.35
SOLC_BUILD=solc-linux-amd64-v0.8.35+commit.47b9dedd
HEVM_VER=0.58.0
BITWUZLA_VER=0.9.1
Z3_VER=5.1.0

# sha256 of the exact binaries that produced the published receipts.
# A mismatch is a hard failure: a different build is a different claim.
SHA_SOLC=fa8ac9a32d301ad023a36ee5a29f8e291fe3200c60244e43c142539e82a617f4
SHA_HEVM=7d6da60cfaa5cfe326cef8e4dffc1fb66595c60a325d86921f393bbf5cea275c
SHA_BITWUZLA=d98164badcd34c12ccbbd9e5aab9373854bb187e79f99ccda4ec2aa9951c0eab
# ⚠️ z3 is the FALLBACK solver -- equiv.sh defaults to bitwuzla and every label
# of record was produced by it. The z3 binary on the build machine is a
# differently-packaged 5.1.0 (it did not come from this release asset), so the
# pin below is the upstream release build, not a byte-copy of what ran the day-1
# z3 probes. Recorded rather than quietly loosened.
SHA_Z3=b4e0b3483ce37817230b20d6cad48390eb6a3aefde1d93342ad6dc763f24bc23

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

need() { command -v "$1" >/dev/null || { echo "✗ missing required tool: $1" >&2; exit 1; }; }
need curl; need tar; need sha256sum

verify() {  # $1 = file, $2 = expected sha256, $3 = label
  local got; got=$(sha256sum "$1" | cut -d' ' -f1)
  [ "$got" = "$2" ] || {
    echo "✗ $3: sha256 mismatch" >&2
    echo "   expected $2" >&2
    echo "   got      $got" >&2
    echo "   This is not a packaging detail. A different binary is a different" >&2
    echo "   claim, and results produced with it are not comparable." >&2
    exit 1
  }
  echo "  ✓ $3  ($2)"
}

# ── libraries ───────────────────────────────────────────────────────────────
# ⚠️ Vendored from release tarballs rather than git submodules: a global
# git config that rewrites https://github.com/ to SSH makes `forge install`
# fail, and the tarball is pinned to a tag either way.
fetch_lib() {  # $1 = owner/repo, $2 = tag, $3 = destination directory name
  local repo="$1" tag="$2" dir="$3"
  if [ -d "lib/$dir" ] && [ "$(cat "lib/$dir/.pinned-version" 2>/dev/null)" = "$tag" ]; then
    echo "  = lib/$dir already at $tag"
    return
  fi
  echo "  ↓ lib/$dir $tag"
  curl -fsSL "https://codeload.github.com/$repo/tar.gz/refs/tags/$tag" -o "$TMP/$dir.tgz"
  rm -rf "lib/$dir"; mkdir -p "lib/$dir"
  tar -xzf "$TMP/$dir.tgz" -C "lib/$dir" --strip-components=1
  # The receipt reads this file: provenance is part of the result, not a comment.
  echo "$tag" > "lib/$dir/.pinned-version"
}

# ── solver toolchain ────────────────────────────────────────────────────────
fetch_tools() {
  mkdir -p .tools

  echo "  ↓ solc $SOLC_VER"
  curl -fsSL "https://binaries.soliditylang.org/linux-amd64/$SOLC_BUILD" -o "$TMP/solc"
  verify "$TMP/solc" "$SHA_SOLC" "solc $SOLC_VER"
  install -m755 "$TMP/solc" .tools/solc

  echo "  ↓ hevm $HEVM_VER"
  curl -fsSL "https://github.com/ethereum/hevm/releases/download/release/$HEVM_VER/hevm-x86_64-linux" -o "$TMP/hevm"
  verify "$TMP/hevm" "$SHA_HEVM" "hevm $HEVM_VER"
  install -m755 "$TMP/hevm" .tools/hevm

  echo "  ↓ bitwuzla $BITWUZLA_VER"
  curl -fsSL "https://github.com/bitwuzla/bitwuzla/releases/download/$BITWUZLA_VER/Bitwuzla-Linux-x86_64-static.zip" -o "$TMP/bw.zip"
  need unzip; unzip -qjo "$TMP/bw.zip" -d "$TMP/bw" '*/bin/bitwuzla'
  verify "$TMP/bw/bitwuzla" "$SHA_BITWUZLA" "bitwuzla $BITWUZLA_VER"
  install -m755 "$TMP/bw/bitwuzla" .tools/bitwuzla

  echo "  ↓ z3 $Z3_VER"
  curl -fsSL "https://github.com/Z3Prover/z3/releases/download/z3-$Z3_VER/z3-$Z3_VER-x64-glibc-2.39.zip" -o "$TMP/z3.zip"
  unzip -qjo "$TMP/z3.zip" -d "$TMP/z3" '*/bin/z3'
  verify "$TMP/z3/z3" "$SHA_Z3" "z3 $Z3_VER"
  install -m755 "$TMP/z3/z3" .tools/z3
}

echo "▸ libraries"
fetch_lib OpenZeppelin/openzeppelin-contracts "$OZ_VER"    openzeppelin-contracts
fetch_lib Vectorized/solady                  "$SOLADY_VER" solady
fetch_lib foundry-rs/forge-std                "$FORGE_STD_VER" forge-std

if [ "$WHAT" = "libs" ]; then
  echo
  echo "▸ libraries only. Skipped the solver toolchain, so the equivalence gate"
  echo "  cannot run and no guarantee label can be earned. Re-run without 'libs'."
else
  echo "▸ solver toolchain  (~60 MB)"
  fetch_tools
fi

cat <<'DONE'

▸ next
    source .envrc.sh     # puts .tools and Foundry ahead of the system PATH
    forge test           # 7 tests: instrument controls, gates, gas scenario
    ./scripts/selfcheck.sh
DONE
