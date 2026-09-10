# Recompute this run

Run id `mtvc2178-b09aa9c7`, model `groq/openai/gpt-oss-20b`, 2026-09-10T09:36:39.577Z.

```
git clone https://github.com/lzmrd/whetstone && cd whetstone
git checkout 8dfd4b48d183f21923b8b7915e40f3d84da70f98
./scripts/bootstrap.sh && source .envrc.sh
```

⚠️ **The working tree was DIRTY when this ran**, so the commit above does not
fully describe what produced these numbers. The bundle is still self-contained —
every input is in this directory — but the repository state is not pinned by that
hash alone.

⚠️ `receipt.json` is the **exact bytes published to Hedera**, compact and with
no trailing newline, so `sha256sum receipt.json` reproduces the hash recorded on
Base Sepolia. Read it with `jq . receipt.json`; do not reformat the file.

| Claim | How to check it yourself |
|---|---|
| this bundle is the run the chains recorded | `sha256sum receipt.json` equals the `receiptHash` on Base Sepolia, and equals the sha256 of the reassembled HCS message |
| equivalence | `hevm equivalence --code-a-file task.runtime.hex --code-b-file patch.runtime.hex --sig 'f(uint256)' --max-iterations -1`, with hevm 0.58.0 [no git revision present] |
| the baseline computes the task | same command on `baseline.runtime.hex` and `task.runtime.hex` — must PASS |
| the mutation is semantic | same command on `task.runtime.hex` and `original.runtime.hex` — must REFUTE |
| gas | `forge test --match-contract GasScenarioTest` after etching these two runtimes; scenario digest `0x2d2fcbae6a80656bae812ebb424f30b5e93e877a00d259f40755177b798439c6` |
| the scenario is the committed one | the digest of `vanity/v1` in `scenario.sol` must equal that digest |
| the mutation is not cosmetic-in-disguise | it moves **192 of 264** scenario inputs |
| nothing was recompiled differently | solc 0.8.35, evm_version osaka, optimizer 200 runs, `--metadata-hash none` |

⚠️ A number that disagrees with the receipt is a **finding**, not a support
request. The falsification bounty in the README applies.
