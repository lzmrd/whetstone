// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

contract VanityCandidate {
    function f(uint256 x) external pure returns (uint256) {
        return _score(address(uint160(x)));
    }

    function _score(address addr) internal pure returns (uint256) {
        bytes20 b = bytes20(addr);

        uint256 leadingZeroCount;
        uint256 leadingFourCount;
        uint256 totalFourCount;

        // ---------- count leading zeros ----------
        uint256 i = 0;
        while (i < 40) {
            uint8 byteVal = uint8(b[i / 2]);
            uint8 nib = (i % 2 == 0) ? (byteVal >> 4) : (byteVal & 0x0F);
            if (nib != 0) break;
            leadingZeroCount++;
            i++;
        }

        // ---------- count leading fours ----------
        while (i < 40) {
            uint8 byteVal = uint8(b[i / 2]);
            uint8 nib = (i % 2 == 0) ? (byteVal >> 4) : (byteVal & 0x0F);
            if (nib != 4) break;
            leadingFourCount++;
            totalFourCount++; // these nibbles are also counted for the +2 rule
            i++;
        }

        // if no leading fours, the whole function returns 0
        if (leadingFourCount == 0) {
            return 0;
        }

        // ---------- count remaining fours ----------
        while (i < 40) {
            uint8 byteVal = uint8(b[i / 2]);
            uint8 nib = (i % 2 == 0) ? (byteVal >> 4) : (byteVal & 0x0F);
            if (nib == 4) totalFourCount++;
            i++;
        }

        uint256 score = leadingZeroCount * 7;

        if (leadingFourCount == 4) {
            score += 50;
        } else if (leadingFourCount > 4) {
            score += 30;
        }

        score += totalFourCount * 2;

        // check if the last two bytes are 0x44 0x44
        if (uint16(uint160(addr)) == 0x4444) {
            score += 25;
        }

        return score;
    }
}
