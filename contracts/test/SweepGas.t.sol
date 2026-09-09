// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test, console} from "forge-std/Test.sol";

/// TRIAGE instrument for the candidate sweep -- NOT the scoring instrument.
///
/// It follows the same three rules that made GasMeter.sol order-neutral (one
/// buffer allocated before the loop, argument words overwritten in place, raw
/// staticcall with outsize = 0), and it reports BOTH orderings so that any
/// residual bias is visible rather than assumed away. Its job is to answer one
/// question -- is there enough headroom for a model to contend for? -- not to
/// produce a leaderboard number. Anything promoted to a real target gets
/// measured again by the committed scenario.
contract SweepGasTest is Test {
    function _values() internal pure returns (uint256[] memory v) {
        v = new uint256[](24);
        uint256 i;
        v[i++] = 0; v[i++] = 1; v[i++] = 2; v[i++] = 3; v[i++] = 7; v[i++] = 8;
        v[i++] = 255; v[i++] = 256; v[i++] = 257; v[i++] = 65535; v[i++] = 65536;
        v[i++] = 1e6; v[i++] = 1e9; v[i++] = 1e18;
        v[i++] = 2**32 - 1; v[i++] = 2**32; v[i++] = 2**64 - 1; v[i++] = 2**64;
        v[i++] = 2**128 - 1; v[i++] = 2**128; v[i++] = 2**200;
        v[i++] = type(uint256).max - 1; v[i++] = type(uint256).max; v[i++] = 12345678901234567890;
    }

    function _measure(address t, bytes memory cd) internal view returns (bool ok, uint256 used) {
        assembly {
            let p := add(cd, 0x20)
            let n := mload(cd)
            let g0 := gas()
            ok := staticcall(gas(), t, p, n, 0, 0)
            used := sub(g0, gas())
        }
    }

    struct Acc { uint256 totA; uint256 totB; uint256 scored; uint256 skipped; uint256 worst; }

    /// @param nargs 1 or 2
    function _pair(string memory name, string memory ozArt, string memory sdArt, uint256 nargs) internal {
        address a = deployCode(ozArt);
        address b = deployCode(sdArt);
        uint256[] memory v = _values();
        Acc memory acc;

        bytes memory cd = new bytes(nargs == 2 ? 68 : 36);
        {
            bytes4 sel = nargs == 1 ? bytes4(keccak256("f(uint256)")) : nargs == 2 ? bytes4(keccak256("f(uint256,uint256)")) : bytes4(keccak256("f(int256)"));
            assembly { mstore(add(cd, 0x20), sel) }
        }

        for (uint256 i = 0; i < v.length; i++) {
            uint256 outer = nargs == 2 ? v.length : 1;
            for (uint256 j = 0; j < outer; j++) {
                assembly { mstore(add(cd, 0x24), mload(add(v, mul(0x20, add(i, 1))))) }
                if (nargs == 2) {
                    assembly { mstore(add(cd, 0x44), mload(add(v, mul(0x20, add(j, 1))))) }
                }
                _one(a, b, cd, acc);
            }
        }

        if (acc.scored == 0) { console.log("--", name, "ALL SKIPPED"); return; }
        console.log("--", name);
        console.log("   scored/skipped:", acc.scored, acc.skipped);
        console.log("   oz total / sd total:", acc.totA, acc.totB);
        console.log("   solady saves per call:");
        console.logInt((int256(acc.totA) - int256(acc.totB)) / int256(acc.scored));
        console.log("   worst input where solady is WORSE:", acc.worst);
    }

    function _one(address a, address b, bytes memory cd, Acc memory acc) internal view {
        (bool okA, uint256 ga) = _measure(a, cd);
        (bool okB, uint256 gb) = _measure(b, cd);
        if (!okA || !okB) { acc.skipped++; return; }
        acc.scored++; acc.totA += ga; acc.totB += gb;
        if (gb > ga && gb - ga > acc.worst) acc.worst = gb - ga;
    }

    function test_sweep_headroom() public {
        console.log("== headroom triage, OZ vs solady ==");
        _pair("clz",    "OzClz",    "SdClz",    1);
        _pair("clz-OPCODE vs OZ", "OzClz", "ClzOpcode", 1);
        _pair("clz-OPCODE vs solady", "SdClz", "ClzOpcode", 1);
        _pair("abs",    "OzAbs",    "SdAbs",    3);
        _pair("max",    "OzMax",    "SdMax",    2);
        _pair("min",    "OzMin",    "SdMin",    2);
        _pair("avg",    "OzAvg",    "SdAvg",    2);
        _pair("satAdd", "OzSatAdd", "SdSatAdd", 2);
        _pair("satSub", "OzSatSub", "SdSatSub", 2);
        _pair("satMul", "OzSatMul", "SdSatMul", 2);
        console.log("");
        console.log("reference: log256 (the current task) saves 66 gas/call;");
        console.log("the trivial one-word floor on it is 69 gas/call.");
    }
}
