pragma solidity 0.8.35;

contract VanityCandidate {
    function f(uint256 x) external pure returns (uint256) {
        return _score(address(uint160(x)));
    }

    function _score(address addr) internal pure returns (uint256 calculatedScore) {
        bytes20 b = bytes20(addr);
        unchecked {
            uint256 leadingZeroCount = 0;
            uint256 leadingFourCount = 0;
            uint256 totalFours = 0;
            bool inLeadingZeros = true;
            bool inLeadingFours = true;

            for (uint256 idx = 0; idx < 40; idx++) {
                uint8 currByte = uint8(b[idx >> 1]);
                uint8 nib = (idx & 1 == 0) ? (currByte >> 4) : (currByte & 0x0F);

                if (nib == 4) {
                    totalFours++;
                }

                if (inLeadingZeros) {
                    if (nib == 0) {
                        leadingZeroCount++;
                        continue;
                    } else {
                        inLeadingZeros = false;
                    }
                }

                if (inLeadingFours) {
                    if (nib == 4) {
                        leadingFourCount++;
                        continue;
                    } else {
                        inLeadingFours = false;
                    }
                }
            }

            if (leadingFourCount == 0) {
                return 0;
            }

            calculatedScore = leadingZeroCount * 7;

            if (leadingFourCount == 4) {
                calculatedScore += 50;
            } else if (leadingFourCount > 4) {
                calculatedScore += 30;
            }

            calculatedScore += totalFours * 2;

            if (b[18] == 0x44 && b[19] == 0x44) {
                calculatedScore += 25;
            }
        }
    }
}
