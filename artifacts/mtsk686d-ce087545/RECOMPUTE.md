# Recompute this run

Run id `mtsk686d-ce087545`, model `groq/openai/gpt-oss-120b`, 2026-09-08T11:00:33.642Z.

```
git clone https://github.com/lzmrd/whetstone && cd whetstone
git checkout 2d3db5a40e92e296b0951fd9e46398b95fd390f1
./scripts/bootstrap.sh && source .envrc.sh
```


| Claim | How to check it yourself |
|---|---|
| equivalence | `hevm equivalence --code-a-file task.runtime.hex --code-b-file patch.runtime.hex --sig 'f(uint256)' --max-iterations -1`, with hevm 0.58.0 [no git revision present] |
| the baseline computes the task | same command on `baseline.runtime.hex` and `task.runtime.hex` — must PASS |
| the mutation is semantic | same command on `task.runtime.hex` and `original.runtime.hex` — must REFUTE |
| gas | `forge test --match-contract GasScenarioTest` after etching these two runtimes; scenario digest `0xd8fd95feb303bffc21724cbcca5ffad44286df2c602461e73026abc243e81f00` |
| the scenario is the committed one | `keccak256(abi.encode(Scenario.inputs()))` from `scenario.sol` must equal that digest |
| the mutation is not cosmetic-in-disguise | it moves **769 of 769** scenario inputs |
| nothing was recompiled differently | solc 0.8.35, evm_version osaka, optimizer 200 runs, `--metadata-hash none` |

⚠️ A number that disagrees with the receipt is a **finding**, not a support
request. The falsification bounty in the README applies.
