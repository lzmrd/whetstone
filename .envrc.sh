# Foundry's `forge` is shadowed by /usr/bin/forge (an unrelated ZOE tool), and
# the solver toolchain lives in .tools/ (provisioned by ./scripts/bootstrap.sh).
# Source this before any forge or hevm command:  source .envrc.sh
#
# ⚠️ Resolved from THIS FILE's location, not from $PWD. It used to say
# `$PWD/.tools`, which silently did nothing whenever it was sourced from a
# subdirectory -- including from `artifacts/<run_id>/`, which is exactly where
# the published RECOMPUTE.md instructions tell a third party to run hevm. The
# reproducibility instructions were broken by the line meant to enable them.
_whetstone_root=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)
export PATH="$HOME/.foundry/bin:$PATH"
export PATH="$_whetstone_root/.tools:$PATH"
unset _whetstone_root
