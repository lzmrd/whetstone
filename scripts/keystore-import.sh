#!/usr/bin/env bash
#
# Move the Base Sepolia signing key out of the command line and into an
# encrypted keystore. Run ONCE.
#
# ⚠️ Why this exists. `cast send --private-key <key>` puts the key in the
# process's argument vector, and on Linux that is world-readable:
#
#     -r--r--r--   /proc/<pid>/cmdline     any user on the machine
#     -r--------   /proc/<pid>/environ     the owner only
#
# For the few seconds of each transaction, any local process could read the
# key. RunRegistry is permissionless, so the key buys no write access that
# nobody else has -- what it buys is our IDENTITY: the subgraph groups models
# by recorder address, so a stolen key writes invented scores attributed to us,
# onto an append-only log that cannot be corrected.
#
# ⚠️ What this does NOT fix. Anyone who can already read files as this user can
# read the keystore and its password file. This closes exposure to OTHER users
# on the machine, which is the part that was open by construction.
set -euo pipefail
cd "$(dirname "$0")/.."
source .envrc.sh

KEYS_DIR="${KEYS_DIR:-$PWD/.keys}"
NAME="registry"
PASS_FILE="$KEYS_DIR/$NAME.pass"
KEY_FILE="$KEYS_DIR/$NAME"

RAW=$(grep -E '^BASE_SEPOLIA_PRIVATE_KEY=' .env | cut -d= -f2- || true)
[ -n "$RAW" ] || { echo "✗ BASE_SEPOLIA_PRIVATE_KEY is not in .env — nothing to import." >&2; exit 1; }

mkdir -p "$KEYS_DIR"; chmod 700 "$KEYS_DIR"
[ -e "$KEY_FILE" ] && { echo "✗ $KEY_FILE already exists. Delete it deliberately if you mean to replace it." >&2; exit 1; }

# The password never reaches a command line either: cast reads it from
# CAST_UNSAFE_PASSWORD, and the environment is not world-readable.
umask 077
head -c 32 /dev/urandom | base64 > "$PASS_FILE"
chmod 600 "$PASS_FILE"

expected=$(cast wallet address --private-key "$RAW")

# ⚠️ `cast wallet import --interactive` requires a terminal — on a pipe it
# fails with "No such device or address". A pty is what keeps the key off the
# argument vector during the import itself; passing --private-key here would
# reintroduce, for one invocation, exactly the exposure being removed.
CAST_UNSAFE_PASSWORD="$(cat "$PASS_FILE")" \
RAWKEY="$RAW" NAME="$NAME" KEYS_DIR="$KEYS_DIR" \
python3 "$(dirname "$0")/_pty_import.py"

got=$(cast wallet address --keystore "$KEY_FILE" --password-file "$PASS_FILE")
if [ "$got" != "$expected" ]; then
  echo "✗ the keystore does not reproduce the address: expected $expected, got $got" >&2
  exit 1
fi

echo
echo "✓ keystore written and verified: it signs as $got"
echo
echo "  Add to .env:"
echo "    BASE_SEPOLIA_KEYSTORE=$KEY_FILE"
echo "    BASE_SEPOLIA_KEYSTORE_PASSWORD_FILE=$PASS_FILE"
echo
echo "  Then DELETE BASE_SEPOLIA_PRIVATE_KEY from .env. The harness refuses to"
echo "  use it, but a key that still exists is a key that can be pasted back."
