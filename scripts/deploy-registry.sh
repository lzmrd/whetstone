#!/usr/bin/env bash
# Deploy RunRegistry to Base Sepolia and print the line to paste into .env.
#
#   BASE_SEPOLIA_RPC_URL=... BASE_SEPOLIA_PRIVATE_KEY=... ./scripts/deploy-registry.sh
#
# ⚠️ Uses the `registry` foundry profile, never the default one. The default
# profile is the measurement instrument and compiles to evm_version 'osaka',
# which Base Sepolia does not run.
set -euo pipefail
cd "$(dirname "$0")/.."
source .envrc.sh
set -a; [ -f .env ] && . ./.env; set +a

: "${BASE_SEPOLIA_RPC_URL:?set it in .env — e.g. https://sepolia.base.org}"
: "${BASE_SEPOLIA_PRIVATE_KEY:?set it in .env — a funded Base Sepolia key}"

addr=$(cast wallet address --private-key "$BASE_SEPOLIA_PRIVATE_KEY")
bal=$(cast balance "$addr" --rpc-url "$BASE_SEPOLIA_RPC_URL")
echo "▸ deployer $addr"
echo "  balance  $(cast to-unit "$bal" ether) ETH"
[ "$bal" != "0" ] || { echo "✗ no funds. Faucet: https://www.alchemy.com/faucets/base-sepolia" >&2; exit 1; }

echo "▸ chain    $(cast chain-id --rpc-url "$BASE_SEPOLIA_RPC_URL") (expect 84532)"

out=$(FOUNDRY_PROFILE=registry forge create \
  contracts/registry/RunRegistry.sol:RunRegistry \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$BASE_SEPOLIA_PRIVATE_KEY" \
  --broadcast 2>&1)
echo "$out" | tail -5

deployed=$(grep -oE 'Deployed to: 0x[0-9a-fA-F]{40}' <<<"$out" | awk '{print $3}')
[ -n "$deployed" ] || { echo "✗ could not parse the deployed address" >&2; exit 1; }

block=$(cast block-number --rpc-url "$BASE_SEPOLIA_RPC_URL")
cat <<DONE

▸ paste into .env
    RUN_REGISTRY_ADDRESS=$deployed

▸ paste into subgraph/subgraph.yaml
    address: "$deployed"
    startBlock: $block          # ⚠️ not 0: indexing from genesis wastes hours
DONE
