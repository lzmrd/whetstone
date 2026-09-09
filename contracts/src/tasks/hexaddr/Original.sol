// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// The UNMUTATED function, kept only so proof 2 has something to refute against.
///
/// A faithful transcription of OpenZeppelin's `Strings.toHexString(address)` --
/// `toHexString(uint256(uint160(addr)), 20)` -- into plain Solidity, so the task
/// can be handed to a model without naming its source. The length check upstream
/// performs after the loop is unreachable at a fixed length of 20 and is omitted.
///
/// ⚠️ NEVER sent to a model.
contract HexAddrOriginal {
    bytes16 private constant DIGITS = "0123456789abcdef";

    function f(uint256 x) external pure returns (string memory) {
        uint256 localValue = uint256(uint160(x));
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 41; i > 1; --i) {
            buffer[i] = DIGITS[localValue & 0xf];
            localValue >>= 4;
        }
        return string(buffer);
    }
}
