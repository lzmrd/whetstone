// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// A tamper-evident, append-only log of Whetstone runs on Base Sepolia.
///
/// ⚠️ THIS CONTRACT VERIFIES NOTHING, and saying so plainly is better than
/// letting a reader discover it (D-09). A contract cannot observe a run: it
/// cannot compile a patch, cannot call hevm, cannot measure gas. It records what
/// the harness reports.
///
/// Verifiability comes from elsewhere and already exists: the pinned toolchain
/// plus the published artifact bundle mean **anyone can recompute the numbers and
/// catch a lie**. What this log adds is that the claim cannot be quietly changed
/// afterwards, and that it is indexable.
///
/// ⚠️ WHY A THIRD CHAIN. The Graph does not support Hedera, and HCS is not EVM,
/// so the canonical record (tied to the payment) lives on HCS and this emits a
/// POINTER to it: content hash + topic + sequence number, plus the few fields the
/// allocator has to filter on. Given an event you can fetch the HCS message from
/// the mirror node and compare hashes — the cross-chain link is checkable by a
/// third party with no access to our machine.
///
/// ⚠️ ANYONE CAN WRITE HERE. That is deliberate: a benchmark registry that only
/// its author may write to is a database with extra steps. The consequence is
/// that a stranger can log whatever they like, so `recorder` is indexed and
/// **every consumer must filter on it** — the subgraph does, and the allocator
/// reads only rows from the recorder it was configured with. Without that filter
/// a stranger could steer our spending by writing attractive fake rows.
contract RunRegistry {
    /// One run. Field order matters only for readability; the subgraph decodes by name.
    ///
    /// ⚠️ `label` is a string rather than an enum. The guarantee vocabulary is
    /// defined in WHETSTONE §7, and an on-chain enum would be a SECOND definition
    /// of it, free to drift from the first. One definition, and gas is irrelevant
    /// on a testnet log.
    event RunRecorded(
        address indexed recorder,
        string runId,
        // ── the pointer to the canonical record ──
        bytes32 receiptHash,      // sha256 of the exact HCS message content
        string hcsTopicId,        // e.g. "0.0.10408009", the mirror-node form
        uint64 hcsSequence,
        // ── what the allocator filters on ──
        string model,             // "groq/openai/gpt-oss-120b"
        string taskId,            // "log256-bytelen/v1"
        string label,             // FORMAL_NO_EXPLICIT_INPUT_BOUND | FUZZED | UNKNOWN | ...
        // ⚠️ SIGNED. A patch can be WORSE than what it replaced; the published
        // batches contain runs at -61 gas/call. An unsigned type here would
        // silently wrap a regression into a spectacular saving.
        int256 savedPerCall,
        int256 savedTotal,
        uint256 maxRegression,
        // ⚠️ Scaled by 1e4, and signed for the same reason. Values above 1e4 are
        // legitimate: the patch beat the baseline, it did not violate a limit.
        int256 relativeProgressE4,
        // Nanodollars at pinned list price. NOT what was paid on Hedera --
        // those are different numbers and §12 forbids conflating them.
        uint64 usdListNano
    );

    /// Monotonic, per-recorder. Lets a consumer detect a gap: a run that was
    /// paid for and never made it here (RPC down, bad nonce) leaves a hole,
    /// which is exactly the failure mode §9 anticipates.
    mapping(address => uint256) public countOf;

    /// Total across every recorder. Cheap, and it makes "is this thing live?"
    /// answerable with one eth_call and no indexer.
    uint256 public total;

    /// ⚠️ A struct, not twelve arguments. Twelve made solc fail with "stack too
    /// deep" -- the fields are irreducible (the pointer needs four, the allocator
    /// filters on seven) so the fix is to pass a calldata pointer rather than to
    /// drop information the consumer needs.
    struct Run {
        string runId;
        bytes32 receiptHash;
        string hcsTopicId;
        uint64 hcsSequence;
        string model;
        string taskId;
        string label;
        int256 savedPerCall;
        int256 savedTotal;
        uint256 maxRegression;
        int256 relativeProgressE4;
        uint64 usdListNano;
    }

    function record(Run calldata r) external {
        unchecked {
            countOf[msg.sender] += 1;
            total += 1;
        }
        emit RunRecorded(
            msg.sender,
            r.runId,
            r.receiptHash,
            r.hcsTopicId,
            r.hcsSequence,
            r.model,
            r.taskId,
            r.label,
            r.savedPerCall,
            r.savedTotal,
            r.maxRegression,
            r.relativeProgressE4,
            r.usdListNano
        );
    }
}
