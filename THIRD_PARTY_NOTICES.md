# Third-party notices

This repository contains code transcribed from third-party projects. Each entry
below names what was taken, from where, and reproduces the notice its licence
requires.

---

## Uniswap v4-periphery

**Files here that contain it**

| file | relationship |
|---|---|
| [`contracts/src/spike/uniswap/VanityProbes.sol`](contracts/src/spike/uniswap/VanityProbes.sol) | `UniVanity` is a verbatim transcription; `UniVanityFast` is an independent reimplementation of the same behaviour |
| [`contracts/src/tasks/vanity/Original.sol`](contracts/src/tasks/vanity/Original.sol) | verbatim transcription |
| [`contracts/src/tasks/vanity/Task.sol`](contracts/src/tasks/vanity/Task.sol) | modified copy — the scoring tariff is changed |
| [`contracts/src/tasks/vanity/Trivial.sol`](contracts/src/tasks/vanity/Trivial.sol) | modified copy — the tariff change, plus one `unchecked` |
| [`contracts/src/tasks/vanity/Baseline.sol`](contracts/src/tasks/vanity/Baseline.sol) | independent implementation of the same behaviour, written here |

**What was taken**: `score`, `getLeadingNibbleCount` and `getNibble` from
`src/libraries/VanityAddressLib.sol`, at commit
`e75fd8878c70d18234cdf9d0bfeeae6e16713037`. The function was exposed as
`f(uint256)` and the address is passed as a truncated `uint256`; the logic is
otherwise unchanged in the files marked "verbatim" above.

**Notice**, reproduced from `LICENSE` at the root of `Uniswap/v4-periphery` as
that licence requires:

> Copyright 2023 Universal Navigation Inc.
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

⚠️ **Nothing from `Uniswap/v4-core` is used.** Six of its libraries are
BUSL-1.1, which is source-available rather than open source: it permits copying
and modification for **non-production use only** until its Change Date
(2027-06-15, or four years from a version's publication, whichever is earlier),
after which it becomes MIT. A hackathon project is plausibly non-production use,
but "plausibly" is not a licence analysis, and the file also requires the
licence to be displayed conspicuously on every copy. Staying inside MIT avoided
the question entirely.

---

## OpenZeppelin Contracts, solady

Used as **dependencies**, under `lib/`, at the versions pinned by
`.gitmodules`. Their source is not copied into this repository; the task files
under `contracts/src/tasks/` that mirror OpenZeppelin functions are
transcriptions written against the published behaviour, and each names its
origin in a header comment. Both projects are MIT.
