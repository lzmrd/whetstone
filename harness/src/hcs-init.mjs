/**
 * Create the receipts topic, once. Prints the id to put in .env.
 *
 *   cd harness && npm run hcs:init
 */
import { createTopic } from './hcs.mjs';

if (process.env.HCS_TOPIC_ID) {
  console.log(`\nHCS_TOPIC_ID is already set to ${process.env.HCS_TOPIC_ID}.`);
  console.log('Delete it from .env first if you really want a new topic.\n');
  process.exit(0);
}

const id = await createTopic();
console.log(`
✓ topic created: ${id}

Put it in .env:
  HCS_TOPIC_ID=${id}

Public, readable by anyone, no key needed:
  https://testnet.mirrornode.hedera.com/api/v1/topics/${id}/messages
`);
