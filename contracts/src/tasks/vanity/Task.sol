// SPDX-License-Identifier: MIT
//
// ⚠️ Contains code from Uniswap/v4-periphery (MIT), (c) 2023 Universal
// Navigation Inc. See THIRD_PARTY_NOTICES.md at the repository root for the
// notice that licence requires, and for exactly what was taken.
pragma solidity 0.8.35;

/// Scores an address by the shape of its hexadecimal digits.
///
/// This is the contract handed to a model. Comments are stripped before it is
/// sent, so nothing here reaches the prompt.
contract VanityCandidate {
    function f(uint256 x) external pure returns (uint256) {
        return _score(address(uint160(x)));
    }

    function _score(address addr) internal pure returns (uint256 calculatedScore) {
        bytes20 addrBytes = bytes20(addr);

        unchecked {
            uint256 leadingZeroCount = _getLeadingNibbleCount(addrBytes, 0, 0);
            calculatedScore += (leadingZeroCount * 7);

            uint256 leadingFourCount = _getLeadingNibbleCount(addrBytes, leadingZeroCount, 4);
            if (leadingFourCount == 0) {
                return 0;
            } else if (leadingFourCount == 4) {
                calculatedScore += 50;
            } else if (leadingFourCount > 4) {
                calculatedScore += 30;
            }

            for (uint256 i = 0; i < addrBytes.length * 2; i++) {
                uint8 currentNibble = _getNibble(addrBytes, i);
                if (currentNibble == 4) {
                    calculatedScore += 2;
                }
            }

            if (addrBytes[18] == 0x44 && addrBytes[19] == 0x44) {
                calculatedScore += 25;
            }
        }
    }

    function _getLeadingNibbleCount(bytes20 addrBytes, uint256 startIndex, uint8 comparison)
        internal pure returns (uint256 count)
    {
        if (startIndex >= addrBytes.length * 2) {
            return count;
        }
        for (uint256 i = startIndex; i < addrBytes.length * 2; i++) {
            uint8 currentNibble = _getNibble(addrBytes, i);
            if (currentNibble != comparison) {
                return count;
            }
            count += 1;
        }
    }

    function _getNibble(bytes20 input, uint256 nibbleIndex) internal pure returns (uint8 currentNibble) {
        uint8 currByte = uint8(input[nibbleIndex / 2]);
        if (nibbleIndex % 2 == 0) {
            currentNibble = currByte >> 4;
        } else {
            currentNibble = currByte & 0x0F;
        }
    }
}
