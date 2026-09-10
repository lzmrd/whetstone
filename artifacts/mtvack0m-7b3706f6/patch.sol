pragma solidity 0.8.35;

contract VanityCandidate {
    function f(uint256 x) external pure returns (uint256) {
        uint160 addr = uint160(x);
        uint160 temp = addr;
        
        unchecked {
            uint256 lz = 0;
            while (temp >> 156 == 0) {
                if (temp == 0) return 0;
                lz++;
                temp <<= 4;
            }
            
            if (temp >> 156 != 4) return 0;
            
            uint256 score = lz * 7;
            
            uint256 l4 = 0;
            while (temp >> 156 == 4) {
                l4++;
                temp <<= 4;
            }
            
            if (l4 == 4) {
                score += 50;
            } else if (l4 > 4) {
                score += 30;
            }
            
            uint256 c4 = l4;
            while (temp != 0) {
                if (temp >> 156 == 4) {
                    c4++;
                }
                temp <<= 4;
            }
            
            score += c4 * 2;
            
            if (addr & 0xFFFF == 0x4444) {
                score += 25;
            }
            
            return score;
        }
    }
}
