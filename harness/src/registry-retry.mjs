/**
 * Drain the registry queue.
 *
 * ⚠️ §9's failure mode made operable: an RPC hiccup leaves a paid run with an
 * HCS receipt and no catalogue card, so it is missing from the subgraph and from
 * the allocator's memory. The local queue is the source of truth; this empties
 * it. A hole in the registry has to be recoverable, not merely regrettable.
 */
import { retryPending } from './registry.mjs';

const r = await retryPending();
console.log(`\nattempted ${r.attempted} · recorded ${r.recorded} · still pending ${r.stillPending}`);
if (r.stillPending > 0) {
  console.log('⚠️  Rows remain queued. They are NOT in the subgraph, so the allocator cannot see them.\n');
  process.exit(1);
}
console.log();
