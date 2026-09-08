import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { RunRecorded } from "../generated/RunRegistry/RunRegistry";
import { Run, Model } from "../generated/schema";

const ZERO = BigInt.fromI32(0);
const ONE = BigInt.fromI32(1);

/**
 * ⚠️ The model key includes the RECORDER. Anyone can write to the registry —
 * that is deliberate — so keying on the model name alone would let a stranger's
 * rows merge into ours and move the aggregates the allocator ranks on. One
 * stranger writing "gpt-oss-120b saved 999999 gas for 1 nanodollar" would
 * otherwise redirect our spending.
 */
function modelKey(recorder: Bytes, name: string): string {
  return recorder.toHexString() + "-" + name;
}

export function handleRunRecorded(event: RunRecorded): void {
  let key = modelKey(event.params.recorder, event.params.model);
  let model = Model.load(key);
  if (model == null) {
    model = new Model(key);
    model.recorder = event.params.recorder;
    model.name = event.params.model;
    model.runCount = ZERO;
    model.attemptCount = ZERO;
    model.failedCount = ZERO;
    model.consecutiveFailures = ZERO;
    model.sumSavedPerCall = ZERO;
    model.sumUsdListNano = ZERO;
    model.totalSavedTotal = ZERO;
    model.formalCount = ZERO;
    model.fuzzedCount = ZERO;
    model.unknownCount = ZERO;
    model.consecutiveUnknown = ZERO;
    model.lastLabel = "";
  }

  let run = new Run(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  run.recorder = event.params.recorder;
  run.runId = event.params.runId;
  run.receiptHash = event.params.receiptHash;
  run.hcsTopicId = event.params.hcsTopicId;
  // ⚠️ Already a BigInt: graph-ts decodes uint64 to BigInt, not to u64.
  run.hcsSequence = event.params.hcsSequence;
  run.model = key;
  run.taskId = event.params.taskId;
  run.label = event.params.label;
  run.scored = event.params.scored;
  run.outcome = event.params.outcome;
  run.savedPerCall = event.params.savedPerCall;
  run.savedTotal = event.params.savedTotal;
  run.maxRegression = event.params.maxRegression;
  run.relativeProgressE4 = event.params.relativeProgressE4;
  run.usdListNano = event.params.usdListNano;
  run.blockNumber = event.block.number;
  run.timestamp = event.block.timestamp;
  run.save();

  // ⚠️ Every attempt counts here, scored or not: this is what cold-start reads,
  // and money burned on a failure is still money burned.
  model.attemptCount = model.attemptCount.plus(ONE);
  model.sumUsdListNano = model.sumUsdListNano.plus(event.params.usdListNano);

  if (!event.params.scored) {
    model.failedCount = model.failedCount.plus(ONE);
    model.consecutiveFailures = model.consecutiveFailures.plus(ONE);
    model.lastLabel = "";
    model.lastRunAt = event.block.timestamp;
    model.save();
    return;
  }
  model.consecutiveFailures = ZERO;

  model.runCount = model.runCount.plus(ONE);
  model.sumSavedPerCall = model.sumSavedPerCall.plus(event.params.savedPerCall);
  model.totalSavedTotal = model.totalSavedTotal.plus(event.params.savedTotal);

  let label = event.params.label;
  if (label == "UNKNOWN") {
    model.unknownCount = model.unknownCount.plus(ONE);
    // ⚠️ The fold the allocator cannot compute from one event. See schema.graphql.
    model.consecutiveUnknown = model.consecutiveUnknown.plus(ONE);
  } else {
    // Any conclusive label breaks the streak, including a FUZZED one: the
    // policy deprioritises models the checker keeps giving up on, not models
    // that earn a weaker-but-real guarantee.
    model.consecutiveUnknown = ZERO;
    if (label == "FUZZED") {
      model.fuzzedCount = model.fuzzedCount.plus(ONE);
    } else {
      model.formalCount = model.formalCount.plus(ONE);
    }
  }
  model.lastLabel = label;
  model.lastRunAt = event.block.timestamp;
  model.save();
}
