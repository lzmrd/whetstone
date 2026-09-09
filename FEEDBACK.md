# Feedback — Uniswap v4-periphery

Written for the Uniswap Foundation track at ETHOnline 2026, by the author of
[Whetstone](README.md). Everything below was measured on
`Uniswap/v4-periphery` at commit `e75fd8878c70d18234cdf9d0bfeeae6e16713037`.

Whetstone measures whether a language model can make a Solidity function
cheaper **without changing what it computes**, and it refuses to report a
saving that it cannot back with an equivalence argument. Pointing it at
v4-periphery is what produced this document.

---

## 1. The finding

`src/libraries/VanityAddressLib.sol` → `score(address)` can be made **four to
ten times cheaper**, computing exactly the same score.

| workload | current | rewritten | saving |
|---|---:|---:|---:|
| random addresses (34 of 512 score above zero) | 2 681 | 571 | **2 110 gas/call · 79%** |
| addresses that score (210 of 228) | 22 330 | 1 913 | **20 417 gas/call · 91%** |

Both numbers are real and they answer different questions. **The first is the
honest one to quote**: a vanity miner feeds mostly random candidates, and a
random address takes the early exit fifteen times in sixteen. We are not
claiming a 91% saving on a real workload.

### Who actually pays this gas

**Nobody inside v4-periphery.** We fetched the full repository tree at the
pinned commit: the only file that references `VanityAddressLib` is its own
test. It is a published utility, so the cost lands on whoever mines hook
addresses with it — over millions of candidates, where this function is the
whole inner loop. That is a real cost, but it is your consumers' and not
yours, and this document would be overselling if it left that out.

### Where the gas goes

Three things, in order of size:

1. **`getNibble` is called up to 120 times per invocation** — 40 for the digit
   sweep, up to 80 across the two leading-run scans — and each call does a
   bounds-checked `bytes20` index, a division and a modulo. The two leading
   scans also re-read nibbles the sweep reads again.
2. **The leading-zero count walks nibble by nibble.** Under EIP-7939 (Osaka)
   `clz` answers it in one opcode: `z = (clz(uint160(addr)) - 96) / 4`, with
   `clz(0) = 256` giving 40, which is the same early return you already take.
3. **The digit sweep tests one nibble at a time.** The whole word can be tested
   at once: XOR against 40 nibbles of `4` turns every match into a zero nibble,
   OR each nibble down onto its own bit 0 (this cannot carry across a nibble
   boundary — the classic `(v - 0x111..) & ~v & 0x888..` trick **can**, and
   mis-flags a nibble of value 1 sitting above a zero nibble), then fold and
   sum with one multiply.

A complete implementation is in this repository at
[`contracts/src/tasks/vanity/Baseline.sol`](contracts/src/tasks/vanity/Baseline.sol).
It carries a re-tariffed scoring table because it doubles as a benchmark
baseline; the unmutated version, byte-for-byte equivalent to yours, is
[`contracts/src/spike/uniswap/VanityProbes.sol`](contracts/src/spike/uniswap/VanityProbes.sol)
(`UniVanityFast`), and it is the one measured in the table above.

⚠️ **What backs the equivalence claim, and what does not.** We could not prove
it: hevm 0.58.0 consumed 6 GB and 2m25s of CPU in 18 seconds and was
OOM-killed, because the function branches on data at each of the 40 nibbles.
What stands in its place is a 264-address scenario, 60 000 fuzz runs across
three campaigns, and an exhaustive pass over all 861 reachable
(leading zeros, leading fours) pairs. That is strong evidence and it is not a
proof, which is why this paragraph exists rather than the word "verified".

---

## 2. The screen that produced it

All 20 files in `src/libraries`, at the pinned commit:

| | count | which |
|---|---:|---|
| declared MIT | 20 | all of them |
| zero imports **and** exposing `pure` functions | 4 | `AddressStringUtil`, `BipsLibrary`, `HexStrings`, `VanityAddressLib` |
| zero imports, no `pure` surface | 6 | constants, hashes, transient-storage helpers |
| pulling in `v4-core` | 9 | including `LiquidityAmounts`, `PositionInfoLibrary`, `Descriptor` |

Of the 7 pure functions in the self-contained four, we **measured one in full**
(`score`) and **assessed two without measuring them**: `calculatePortion` is
three operations and its headroom would very likely fall below the floor a
mechanical edit already reaches, and `toHexStringNoPrefix` is the same function
family as a target we already had, so it would have been a second observation
rather than a new one. `AddressStringUtil` we did not look at. Saying which is
which seemed better than implying we swept everything.

---

## 3. Developer experience

**The licence boundary is invisible from outside, and we got it wrong.** Our
own design notes recorded "v4-core, restrictive licence" and scoped the work
around it. That is false. `v4-core`'s licence is per file: **18 of its 24
libraries are MIT** — including all the pure math, `TickMath`, `SqrtPriceMath`,
`SwapMath`, `FullMath`, `BitMath`, `TickBitmap` — and **6 are BUSL-1.1**, all
of them the singleton's state internals (`Pool`, `Position`, `CurrencyDelta`,
`CurrencyReserves`, `Lock`, `NonzeroDeltaCount`). There is **no `LICENSE` file
at the repository root**, only a `licenses/` directory holding both texts, so
the only way to know is to open each file. We planned around a constraint that
did not exist, and only found out by checking. A short table in the README
would have saved that, and would tell anyone else building on the math that
they can.

**The self-containment in `src/libraries` is genuinely good.** Four files with
no imports at all is what made this possible in an evening: we could transcribe
one function into our own toolchain and be confident we had transcribed all of
it. Please keep that property when adding libraries.

**`VanityAddressLib` has no gas test.** `test/libraries/VanityAddressLib.t.sol`
is 101 lines and 8 tests, all correctness — no `snapshotGas`, no `gasleft`. For
a library whose entire purpose is to be called in a tight loop over millions of
candidates, a single gas snapshot would have surfaced a 4–10× gap years before
a hackathon did. The correctness tests, for what it is worth, are good: our
rewrite had to satisfy them and the boundary behaviour is well pinned.

**One thing worth knowing if you ever want a formal argument for a refactor
here:** symbolic execution does not survive this function. A branch per nibble
across 40 nibbles is what kills it, and it kills it in 18 seconds, not after a
long wait. If `score` is ever rewritten, differential fuzzing against the old
implementation is the tool that works, and a bounded exhaustive pass over the
`(leading zeros, leading fours)` plane is cheap and covers the control flow
completely.

---

## 4. Reproducing all of it

```bash
git clone <this repository> && cd whetstone
./scripts/bootstrap.sh          # foundry + hevm, pinned
source .envrc.sh

# the measurement in section 1, both workloads and both orderings
forge test --match-path contracts/test/VanitySweep.t.sol -vv

# the equivalence evidence: 60 000 fuzz runs + the exhaustive plane
forge test --match-path contracts/test/VanityTask.t.sol -vv

# the hevm result, memory-capped so it cannot take your desktop with it
./scripts/prove.sh UniVanity UniVanityFast 'f(uint256)'
tail -f .run/proofs/UniVanity-UniVanityFast.log
```

Toolchain is pinned in `foundry.toml`: solc 0.8.35, `evm_version = osaka`,
optimizer on at 200 runs. The `osaka` target matters for point 2 above — `clz`
does not exist before it, and on an earlier target the rewrite loses roughly
that opcode's worth of the saving.
