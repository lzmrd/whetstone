# Day 1 spike — results

Monday 7 September 2026. Four measurements, no product code. Per [WHETSTONE.md](../WHETSTONE.md) §12.

## Toolchain established

| Tool | Version | Note |
|---|---|---|
| forge | **1.5.1** | 1.4.2 could not fetch solc 0.8.35 (checksum mismatch — its list predates the release). `foundryup` fixed it |
| solc | 0.8.35 | via forge |
| evm_version | **`osaka`** | ✅ compiles. OZ's own setting works, no fallback to `cancun` needed |
| hevm | 0.58.0 | needs a `solc` binary on PATH even for bytecode-level work |
| z3 | 5.1.0 | |
| bitwuzla | 0.9.1 | materially stronger than z3 here, as expected for bitvector problems |
| halmos | 0.3.3 | installed, not yet exercised |

⚠️ **`/usr/bin/forge` shadows Foundry's forge** (an unrelated ZOE tool). `source .envrc.sh` before any forge command.

⚠️ **Libraries are vendored, not git submodules.** Global git config rewrites `https://github.com/` → SSH and the agent refuses; `forge install` therefore fails. Tarballs pinned instead: **OZ v5.7.0**, **solady v0.1.26**, versions recorded in `lib/*/.pinned-version`.

---

## 1. Negative revert test — PASSED ✅

**The question**: hevm documents equivalence as *"same return value, same storage, matching success/failure"* and does **not** state that it compares revert payloads. If it does not, reverts fall out of the formal guarantee — and that is the load-bearing case, since OZ and solady diverge precisely there.

Two contracts, identical on every successful path, differing only in which custom error they raise (`contracts/src/spike/RevertProbe.sol`):

```
Difference: Both end in Failure but different EVM error.
A err: Revert 6d2cd4cb   ← ErrA()
B err: Revert ed0c2823   ← ErrB()
```

**hevm distinguishes revert payloads.** 0.1 s.

> **Consequence**: the guarantee label may state *return value, storage, outcome **and revert data***. Risk #1 level 3 is resolved favourably, and the `restored_f` story is not weakened.

## 2. Positive control — PASSED ✅

A checker that reports "not equivalent" for everything proves nothing. Two implementations computing `x & 0xff` and `x % 256`, with an identical revert path:

```
[PASS] Contracts behave equivalently — No discrepancies found
```

0.055 s. The tool is sound in both directions.

## 3. OZ.mulDiv vs solady.fullMulDiv — NOT EQUIVALENT, with a concrete counterexample ✅

| | Revert when `d == 0` |
|---|---|
| **OZ** `Math.mulDiv` | `4e487b71` + `0x12` → **`Panic(0x12)`** (division by zero) |
| **solady** `FixedPointMathLib.fullMulDiv` | `ae47f702` → **`FullMulDivFailed()`** |

This is the *price of semantics* the design predicted, now measured rather than assumed. It confirms **D-04**: raw solady cannot serve as the denominator, and `restored_f` must exist.

## 4. ⚠️ Exploration is partial on the real target

Both solvers ran out of memory on some branches of the 512-bit multiplication:

| Solver | Config | Outcome |
|---|---|---|
| z3 | 300 s timeout, default solvers | `6x` branches → out of memory, **partial** |
| bitwuzla | 300 s timeout, 4 solvers | `3x` branches → `std::bad_alloc`, **partial** |

Machine has 15 GB RAM; ~5 GB free during the runs.

### The asymmetry that matters

- **"Not equivalent" + a concrete counterexample is SOUND under partial exploration.** It is a positive claim about one input, and anyone can verify it by running both.
- **"Equivalent" under partial exploration is NOT a proof.** It only means no difference was found in the part explored.

> So today's counterexample stands. But proving `restored_f ≡ OZ` on `mulDiv` may not reach `FORMAL_*` on this hardware — it could land on `UNKNOWN`, and the label must say so.

---

## Decision

**Proceed.** Gate 3 works, is sound in both directions, and covers reverts. The open question is not *whether* the method works but *how far* the solver reaches on this particular target.

### Carried into day 2

- [x] ~~Write `restored_f` by hand~~ — **VOID**. OZ ≡ solady already holds on the chosen targets, so there is nothing to restore ([Addendum 2](#addendum-2--the-measuring-instrument-was-unstable)). Notes archived in [MULDIV-NOTES.md](MULDIV-NOTES.md)
- [x] ~~Attempt `restored_f ≡ OZ`~~ — **VOID**, same reason. The nearest real question was asked instead and answered `UNKNOWN` ([Addendum 5](#addendum-5--the-muldiv-second-pass-and-what-it-returned))
- [ ] Verify the precondition — now `gas(solady_M) < gas(OZ_M)`, and not evaluable until `M` exists
- [ ] If `mulDiv` proves out of reach, fall back to a smaller fixed-size target and say why

⚠️ **If `UNKNOWN` is the best available on every candidate**, the headline metric loses its denominator and branch B from DESIGN-NOTES applies: the story becomes the price of semantics, measured, rather than the percentage closed.

---

# Addendum — the trilemma, measured

A review raised what it called the function trilemma: a target must be
**(a)** optimizable enough to leave a measurable gap, **(b)** tractable for
symbolic equivalence, and **(c)** mutable by hand while preserving difficulty.
`mulDiv` maximizes (a) and minimizes (b) and (c). The critique is correct, and
none of the specs named it.

It is also testable. Five candidate targets, OZ vs solady, same wrapper shape:

| Target | Equivalence verdict | Label | Gas (OZ → solady, 10-input fixture) |
|---|---|---|---|
| `mulDiv` | **NOT equivalent** — concrete counterexample | n/a | large headroom, semantics gap real |
| `sqrt` | no difference found, **partial exploration** | `UNKNOWN` | not measured |
| `log10` | no difference found, **partial exploration** | `UNKNOWN` | not measured |
| **`log2`** | **PASS, complete exploration** | **`FORMAL_NO_EXPLICIT_INPUT_BOUND`** | 2740 → 2220 = **520 saved, 19%** |
| **`log256`** | **PASS, complete exploration** | **`FORMAL_NO_EXPLICIT_INPUT_BOUND`** | 2250 → 1980 = **270 saved, 12%** |

## What this changes

**Leg (b) has a solution.** `log2` and `log256` are provable end to end, in
seconds, with no bounds and no partial-exploration warning.

**Leg (c) becomes feasible.** These are simple enough to mutate semantically by
hand — unlike rewriting correct 512-bit assembly, which is researcher work.

**`restored_f` is not needed for these targets.** OZ and solady are *proven
equivalent* on `log2` and `log256`, so the baseline is solady itself: externally
authored, not written by us. That removes the circularity concern, the
hand-writing burden, and the force of rule **R2** for this target. `restored_M`
is still hand-written, but over a much simpler function.

**Branch A and Branch B both exist, on different functions.**

- `log2` / `log256`: the gap is **entirely free lunch** — equivalence is proven,
  so no semantics were paid. Branch A.
- `mulDiv`: the gap **includes a semantics component** — `Panic(0x12)` versus
  `FullMulDivFailed()`. Branch B, and the price of semantics is real.

That is a richer result than either branch alone, and it is measured.

## The cost, stated plainly

⚠️ **Headroom on `log2` is 52 gas per call (19%).** Real, but small in absolute
terms, so the denominator is coarse: a model saving 20 gas scores 38%. The
quantization must be shown, not smoothed over.

⚠️ **Gas is constant across all ten fixtures** for both implementations on
`log2` — this target is branchless. That is a finding, not an assumption, and it
is only knowable by measuring across a fixture set. The scenario stays in the
receipt regardless: for other targets it will not be constant.

---

# Addendum 2 — the measuring instrument was unstable

⚠️ **Before trusting any gap figure, the method had to be fixed.**

Measuring with `gasleft()` deltas around *inlined internal* calls inside a test
is not stable. The `log256` figure moved **27 → 39 gas/call** purely because
unrelated imports and test functions were added to the same file: the surrounding
compiled code shifts, and the delta absorbs it.

**Stable method**: deploy each wrapper — the same one hevm proves equivalence on —
and measure a `staticcall` to it. Call overhead is constant and cancels in the
A-vs-B delta. `contracts/test/GasStable.t.sol`.

## Corrected figures, ⚠️ *not* a stable method, 10-input fixture

> "Stable" was wrong. This instrument was order-biased by ~10% of the delta it
> reported; it simply did not move when unrelated imports changed, which is a
> weaker property than the one being claimed.

| Target | Verdict | Label | Gas/call saved |
|---|---|---|---|
| `log2` | proven equivalent | `FORMAL_NO_EXPLICIT_INPUT_BOUND` | 51 |
| **`log256`** | proven equivalent | `FORMAL_NO_EXPLICIT_INPUT_BOUND` | **66** |
| `toString` | partial exploration | `UNKNOWN` | 486 |
| **`toHexString`** | partial exploration | `UNKNOWN` | **4 833** |
| `sqrt`, `log10` | partial exploration | `UNKNOWN` | not measured |
| `mulDiv` | **not** equivalent, counterexample | — | semantics-laden |

## The trilemma does not break at high headroom

`toString` and `toHexString` return `string memory`. Both are **intractable** —
partial exploration, `UNKNOWN`. High headroom and symbolic tractability did not
coexist in any candidate tested.

## Proposed pairing — and why it is better than two FORMAL rows

| Role | Target | Label | Headroom |
|---|---|---|---|
| Primary | **`log256`** | `FORMAL_NO_EXPLICIT_INPUT_BOUND` | 66 gas |
| Secondary | **`toHexString`** | `FUZZED` | 4 833 gas |

A guarantee vocabulary that only ever prints one label is decoration. Two targets
earning **two different labels**, with the leaderboard saying which is which, is
the vocabulary doing its job — and it is the honest way to include a target with
real headroom for the agent to contend for.

⚠️ `toHexString` rows carry `FUZZED`, never `FORMAL`. That is the point, not a
concession.

---

# Addendum 3 — ⚠️ RETRACTED: "exhaustive fixtures halved the headroom"

> The heading is left as it was written so the record is honest, but the claim is
> false. The halving was gas-instrument bias, not fixture overfitting — see
> [Addendum 4](#addendum-4--the-instrument-was-biased-twice-and-two-spec-claims-are-withdrawn).

`Scenario.inputs()` — 0, every `2**k` and `2**k ± 1` for k = 0..255, and
`type(uint256).max`. **769 inputs**, measured in seconds.

| Target | 10 fixtures | **769 boundary** | OZ spread (max−min) |
|---|---|---|---|
| `log2` | 51 | **18** | 46 |
| `log256` | 66 | **32** | 81 |
| `toHexString` | 4 833 | **7 596** | 15 994 |

⚠️ **RETRACTED — see [Addendum 4](#addendum-4--the-instrument-was-biased-twice-and-two-spec-claims-are-withdrawn).**
This was gas-instrument bias, not fixture overfitting. With an order-neutral
instrument the exhaustive set gives the same 66 gas/call the sparse set gave.
The original text follows, unedited.

⚠️ **The sparse fixture set overstated the gap by roughly 2×** on both log targets.
Fixture-overfitting was already biting our own baseline measurement, before any
model patch existed. This is the strongest argument in the project for the
scenario being a first-class artifact rather than a footnote.

⚠️ **On `log256` the input-dependent spread (81 gas) exceeds the mean saving (32).**
Not noise — gas is deterministic per input, so a fixed scenario gives an exact,
comparable total. But it means a patch can improve some inputs and worsen others
and net out ambiguously, so **report the total over the fixed scenario plus
min/max/spread**, never a bare mean.

## Admission rule, pre-declared

⚠️ **Superseded by [Addendum 4](#addendum-4--the-instrument-was-biased-twice-and-two-spec-claims-are-withdrawn).**
The figures in this section came from a biased instrument, and the rule itself
was replaced by the fuller scoring rule in WHETSTONE §1 — ranking on the total,
with max-regression as a mandatory second column. Kept as written, because the
history of what was believed and when is part of the record.

> A target enters the leaderboard only if its **total gap over `boundary/v1`**
> is large enough that one gas is a meaningful fraction of it. Primary metric is
> **absolute gas over the fixed scenario**; percentage is derived and secondary.

Applied to measurement rather than to preference:

| Target | Total gap over 769 inputs | Role |
|---|---|---|
| `toHexString` | **5 841 982** | headroom target — `FUZZED` |
| `log256` | 25 237 | formal target — `FORMAL_NO_EXPLICIT_INPUT_BOUND` |
| `log2` | 14 446 | dropped: strictly worse than log256 on both axes |

**Final pairing: `log256` (FORMAL, exact, small) + `toHexString` (FUZZED, large).**
Two targets, two labels, the leaderboard saying which is which — a guarantee
vocabulary that only ever prints one label is decoration.

---

# Addendum 4 — the instrument was biased twice, and two spec claims are withdrawn

Written after building an **order-neutrality control** for the gas harness. It
should have existed before any number was written into the spec; it did not, and
two claims that reached WHETSTONE §1 were artefacts of the measuring instrument
rather than properties of the code.

## Three instruments

| # | Method | Fault | log256 gas/call |
|---|---|---|---|
| 1 | `gasleft()` around **inlined internal** calls | Moved 27 → 39 → 66 as unrelated imports were added to the test file | 66 (sparse fixtures) |
| 2 | Two separate loops, Solidity `.staticcall` | Memory is not reset between internal calls, so whoever ran **second** paid memory expansion at a higher offset where the quadratic term dominates. `.staticcall` also copies returndata, so memory grew *between* the two calls even inside one paired loop | 32 |
| 3 | One pre-allocated calldata buffer, raw `staticcall` with `outsize = 0` | Order bias measured at **0** | **66** |

Instrument 2's bias, measured directly by running the same comparison in both
orders: **5 038 gas over 769 inputs on `log256`** — about 10% of the delta it was
reporting. The control is now [`OrderControl.t.sol`](../../contracts/test/OrderControl.t.sol)
and asserts `bias == 0`, so this cannot regress silently.

## Corrected figures — `boundary/v1`, instrument 3

Scenario digest `0xd8fd95fe…3e81f00`, 769 inputs, 0 skipped.

| Target | Base total | Candidate total | Saved total | Per call | Base spread | Max regression |
|---|---|---|---|---|---|---|
| `toHexString` | 7 565 070 | 1 641 198 | **5 923 872** | **7 703** | 15 710 | 0 |
| `log256` | 413 722 | 362 968 | **50 754** | **66** | **0** | 0 |
| `log2` | 451 403 | 411 415 | 39 988 | 52 | **0** | 0 |

## Withdrawal 1 — the exhaustive fixtures did **not** halve the gap

Addendum 3 reported that the sparse ten-input set overstated the gap by roughly
2× (`log256` 66 → 32, `log2` 51 → 18), and called this *"the strongest argument
in the project for the scenario being a first-class artifact"*.

**That was instrument 2's bias, not fixture overfitting.** With an instrument
that passes an order control, the exhaustive set gives 66 gas/call — the same
figure the sparse set gave. Changing the fixtures and changing the instrument
happened in the same step, and the effect was attributed to the wrong one.

The design argument for exhaustive fixtures survives on its own terms: a model's
patch can be input-dependent even when the baseline is not, and a sparse set
would not see it. But it survives **as an a-priori argument with no supporting
measurement**, which is weaker than what was claimed, and the claim is retracted
rather than quietly softened.

## Withdrawal 2 — there is no input-dependent spread on the log targets

WHETSTONE §1 warned that *"on `log256` the input-dependent spread (81 gas)
exceeds the mean saving (32)"*, and built a reporting rule on it.

The measured spread is **0**. `log2` and `log256` cost identical gas on every one
of the 769 inputs, because OpenZeppelin 5.x implements both branchlessly. The
81- and 93-gas "spreads" were memory expansion accumulating across the loop.

Controls that make the zero credible rather than suspicious:

- `toHexString`, measured by the same instrument in the same run, has a spread of
  15 710 — so the harness is varying the argument.
- [`HarnessSelfCheck.t.sol`](../../contracts/test/HarnessSelfCheck.t.sol) asserts
  the scenario produces **94 distinct** `log256` results. A bug sending the same
  argument 769 times would have looked like the stability we were trying to
  achieve, and would have been believed.

Consequence: the concern about a patch that "improves some inputs and worsens
others" is an a-priori risk for a *candidate*, not an observed property of the
baseline — and it is now measured on every run rather than assumed, via the
mandatory max-regression column.

## Consequence for the admission rule

The reviewer's objection was aimed at a 32-gas denominator where 1 gas is 3.1%.
With the corrected figure the formal target is **66 gas/call, 50 754 total**, and
1 gas is 1.5%. Two notes on the objection itself, recorded because getting this
wrong in the submission would be worse than getting it wrong here:

- There was never a *"gap ≥ 100 gas"* rule to violate. The pre-declared rule is
  in WHETSTONE §1 and is about absolute gas being primary and percentage derived.
- `log256` was never coarser than `log2`. At 32 gas one gas was 3.1%; at `log2`'s
  18 it was 5.6%. `log256` was and remains the finer instrument of the two.

---

# Addendum 5 — the `mulDiv` second pass, and what it returned

Day 1 left `mulDiv` as a counterexample: OpenZeppelin raises `Panic(0x12)`,
solady raises `FullMulDivFailed()`. Sound, but half an answer — it establishes
that the *revert reasons* differ and says nothing about whether the arithmetic
agrees. Reporting only that would be selling a counterexample as an analysis.

## The wrapper

[`MulDivConditional.sol`](../../contracts/src/spike/MulDivConditional.sol) asks
the question the counterexample does not:

> assuming `d != 0` and the 512-bit product `x*y` fits in `d`,
> do `Math.mulDiv` and `FixedPointMathLib.fullMulDiv` return the same value?

Two design points, both of which the obvious implementation gets wrong:

**Normalise the payload, keep the flag.** The natural phrasing is "a wrapper that
normalises `(success, returndata)`". Normalising the *success flag* as well would
be unsound: if one implementation reverted where the other returned a value, the
normalisation would hide a genuine divergence rather than isolate the revert
reason. The wrapper returns `(bool ok, uint256 v)` with `v = 0` when `ok` is
false, so a domain disagreement still surfaces as `(false, 0)` against
`(true, x)`.

**No `try/catch`.** Catching a revert requires an external call, which puts an
address hevm has no code for into the symbolic state. The guard is evaluated
inline instead, byte-identical on both sides, so both wrappers succeed on exactly
the same inputs by construction and the wrapper stays a single self-contained
runtime object.

## Result: `UNKNOWN`

```
hevm 0.58.0, bitwuzla, --max-iterations -1, --smt-timeout 900
[FAIL] Contracts may not behave equivalently
[WARNING] partially explored: 2x -> SMT solver says: Unable to parse SMT solver
          output (maybe it got killed?): terminate called after throwing an
          instance of 'std::bad_alloc'
```

**No counterexample. No proof.** The solver ran out of memory, as z3 did on the
unconditional form. Conditioning the domain did not rescue tractability: solady's
`fullMulDiv` performs a 512-bit division by Newton–Raphson inverse, and that is
what exhausts the solver, not the revert paths the guard removes.

⚠️ **`UNKNOWN` is not evidence of equivalence.** It is the label that exists so
that a solver timeout cannot be quietly written up as a pass — and this is the
first time in the project a target has earned it, which is the point of having a
four-label vocabulary rather than a boolean.

## What this costs, stated plainly

The by-product number promised in D-04 — *"the price of the semantics solady
dropped"* — was to come from `mulDiv`, the one chosen target where the semantics
genuinely differ. It cannot be published as a verified quantity, because the
arithmetic underneath it is unproven. A gas delta between two implementations
that have **not** been shown to compute the same thing is not a price, it is a
comparison of two different functions.

Remaining honest options, in preference order:

1. Publish the `mulDiv` gas delta explicitly labelled `UNKNOWN`, next to the
   counterexample, as a *measured* number with an *unproven* precondition.
2. Narrow the domain further — to products that fit in 256 bits, where `mulDiv`
   reduces to `(x*y)/d` — and see whether the solver survives. A weaker claim,
   but a complete one. **Not attempted yet**: it needs the machine to itself, and
   the `toHexString` attempt currently holds 11 GB.
3. Drop the by-product. It was already weakened when day 1 showed the chosen
   targets need no restoration; this would retire it.

Option 1 is what the guarantee vocabulary was built for and costs nothing.

---

# Addendum 6 — the first batches, and what pinning temperature did

Placeholder task (unmutated `log256`), scenario `boundary/v1`, 769 inputs,
n=5 seeds, `temperature 0.2`, `max_rounds 8`, all patches gated through the
x402 gateway and receipted on HCS.

| | `groq/openai/gpt-oss-120b` | `openrouter/minimax/minimax-m3:free` |
|---|---|---|
| produced a patch | **5/5** | 4/5 |
| gas/call, median | **151** | 46.5 |
| range | 142 – 263 | 11 – 121 |
| **max regression, worst** | **0** | **203** |
| rounds used | 1, 1, 1, 1, 1 | 1, 1, 3, 5, exhausted |
| cost, total | $0.006123 | **$0.000000** |
| label | `FORMAL_NO_EXPLICIT_INPUT_BOUND` ×5 | ×4 |

## Pinning temperature was not cosmetic

Before it was fixed, four runs of `gpt-oss-120b` on this task returned
**+291, +136, +263 and −60** gas per call — the last a *proved-equivalent* patch
that regressed 624 of 769 inputs. With `temperature 0.2` declared, the same model
over five seeds gives **142 – 263 and zero regressions**.

⚠️ The interface parameter was load-bearing and was not being measured. §5 said
temperature was "the provider default, recorded in the receipt", but no provider
returns it, so the receipt recorded `null` and the runs were not reproducible even
by us. This is the clearest evidence in the project that **the agent interface is
the independent variable**, not a configuration detail.

⚠️ It reduces the spread; it does not remove it. 142 vs 263 is still a factor of
1.85 between seeds of one model on one task. Medians and dispersion stay
mandatory, and ties stay the normal outcome.

## The free model is the more interesting row

`minimax-m3:free` does roughly a third of the median saving **at zero marginal
cost**, which is the finding the cost column exists for. But it is also the row
that needs both columns:

- seed 4 improved the total by 11 gas/call **while regressing one input by 203**.
  On the total alone that is a win; the mandatory second column is what makes it
  legible.
- seed 1 burned all 8 rounds and produced nothing. A leaderboard reporting only
  successful runs would have hidden a 20% failure rate.

## What these numbers are NOT

⚠️ Every receipt from these batches carries `mutation_refuted: false`. The task is
the **unmutated placeholder**, so a memorised answer is still a correct answer and
these are pipeline measurements, not benchmark results. They must never be quoted
as a comparison of model capability.


---

# Addendum 7 — the mutation lands, and the task gets harder

`M` applied by hand to both sides, and both proof obligations discharged by hevm:

```
proof 1   hevm(Baseline ≡ Candidate)   PASS, FORMAL_NO_EXPLICIT_INPUT_BOUND
proof 2   hevm(Candidate ≡ Original)   REFUTED
precondition  gas(Baseline) 398 592  <  gas(Candidate) 616 320   (283/call, 0 regressions)
```

⚠️ Both are now run by `prepareTask()` on **every batch**, and a task failing
either cannot be scored. `mutation_refuted` stopped being a boolean somebody set
in a JSON file and became a property that is checked.

`skipped 1` in every measurement is the mutation showing up in the instrument:
zero now reverts on both sides, so 768 of 769 inputs are scored.

## Same model, same interface, before and after the mutation

`groq/openai/gpt-oss-120b`, n=5, temperature 0.2:

| | placeholder (unmutated) | **`log256-bytelen/v1` (mutated)** |
|---|---|---|
| produced a patch | 5/5 | 4/5 |
| gas/call, median | 151 | **40** |
| range | 142 – 263 | **−71 – 236** |
| max regression, worst | **0** | **331** |
| vs baseline | — (no baseline existed) | **13.9%** |

⚠️ **These are different functions, so the absolute numbers are not directly
comparable.** What is comparable is the *character* of the results: a tight
cluster with no regressions became a spread crossing zero with regressions on
three of four seeds. On the unmutated task the model reached for `clz` and
landed cleanly every time; with the semantics changed it produces inconsistent
patches, all still proved equivalent, several of them worse than what they
replaced.

That is the anti-memorisation defence doing visible work, and it is the first
measurement in the project that speaks to the question it was built to answer.

⚠️ It is **not** proof that memorisation was the cause. One task, one model, n=5.
The control that would settle it — the same model on a *cosmetically* mutated
variant, where a memorised answer stays correct — is the control family already
listed as cut from this hackathon's scope.

---

# Addendum 8 — the control, and what it settles

Addendum 7 reported that the semantic mutation cost `gpt-oss-120b` most of its
performance, and said plainly that two explanations fitted equally well:

- **(a)** the mutation removed the memorised answer
- **(b)** the mutated function is simply harder

and that the control which separates them had been cut for time. It was built,
because the schedule allowed it. It changes the reading.

## The control

`log256-cosmetic-control/v1` shares no line with the original — renamed
variables, an extracted helper, `* 128` for `<< 7`, `/ 8` for `>> 3`, a ternary
for the branchless cast — and computes **exactly the same function**. Both proof
obligations discharged, with proof 2 **inverted** for this kind of variant:

```
proof 1   hevm(ControlBaseline ≡ ControlCandidate)   PASS   (denominator computes the task)
proof 2   hevm(ControlCandidate ≡ Original)          PASS   (INVERTED: a control that
                                                             changed behaviour is not a control)
```

So here **a memorised answer is still correct**, while the source looks nothing
like what the model was trained on.

## The result

`groq/openai/gpt-oss-120b`, n=5, temperature 0.2, identical interface, identical
instrument:

| | **control** (cosmetic) | **`log256-bytelen/v1`** (semantic) |
|---|---|---|
| produced a patch | **5/5** | 4/5 |
| gas/call | 799, 799, 799, 799, 780 | −71, 40, 40, 236 |
| range | **780 – 799** | **−71 – 236** |
| max regression, worst | **0** | **331** |
| **vs baseline, median** | **99.9%** | **13.9%** |

## What it settles

**Explanation (b) does not survive.** When the function is cosmetically
unrecognisable but semantically familiar, the model reaches **99.9% of the
efficient reference implementation, five times out of five, with a spread of 19
gas across seeds**. Its ability to find the optimum is intact; source-level
disguise does not touch it.

Change the semantics and the same model, same interface, same day, closes **13.9%**
with a spread that crosses zero.

⚠️ **99.9% means it essentially reproduced the reference implementation.** That is
itself the finding: on a familiar function the model does not search, it recalls.

## What it does not settle

⚠️ The mutated function could still be intrinsically harder for reasons unrelated
to memory — the control shows recall is available and sufficient on the familiar
variant, not that nothing else changed. Establishing that would need several
mutations of differing kinds, which is the mutation family still out of scope.

⚠️ One model, one function, n=5. This is a demonstration that the method detects
the effect, not a measurement of how large the effect is in general.

⚠️ The control **must never share a leaderboard column with a semantic task**. Its
receipts carry `mutation_refuted: false`, and 799 gas/call against 40 is not a
comparison, it is two different questions.
