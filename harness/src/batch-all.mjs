/**
 * Every scorable model against every scored task, in one resumable pass.
 *
 *   cd harness && npm run batch:all -- [seeds]
 *   cd harness && npm run batch:all -- 5 --dry-run
 *
 * WHY IT SHELLS OUT to batch.mjs instead of reimplementing it: that file
 * publishes the HCS receipt, exports the recomputation bundle and writes the
 * Base Sepolia row. This repository has twice shipped a defect of the form
 * "wired into one entry point and not the other" -- once when batch.mjs
 * published to Hedera and wrote nothing to Base Sepolia, once when the task
 * path came from argv here and from the manifest there. A second copy of that
 * logic would be a third opportunity.
 *
 * The cost of that choice is real and is not hidden: each task is prepared once
 * per MODEL rather than once, and preparing the vanity task takes 183 seconds
 * (two hevm invocations that die at the memory ceiling, then two fuzz
 * campaigns). The pass prints its own elapsed time so the bill is visible.
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { resolve as resolveModel } from './providers.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const HARNESS = fileURLToPath(new URL('../', import.meta.url));

/**
 * Ordered MOST-INFORMATIVE FIRST, and that ordering is the point.
 *
 * If the pass is cut short -- and it runs the day before a freeze -- what
 * survives should be COMPLETE tasks, not four half-populated ones. A task with
 * every model on it is a row that can be published; four tasks at 40% are an
 * anecdote.
 *
 * vanity leads because it is the only target whose trivial floor does not eat
 * the headroom (1 399 against 14 137, 9%), so it is where models can actually
 * separate. log256 is last because its floor EXCEEDS the whole gap: what it
 * produces is already known, and what it produces is ties.
 */
const TASKS = [
  { manifest: 'contracts/src/tasks/manifest-vanity.json',  why: 'headroom 14 137, floor 9% -- the only task that can separate models' },
  { manifest: 'contracts/src/tasks/manifest-hexaddr.json', why: 'headroom 152, floor 42' },
  { manifest: 'contracts/src/tasks/manifest-satmul.json',  why: 'headroom 152, floor 42' },
  { manifest: 'contracts/src/tasks/manifest.json',         why: 'log256 -- floor exceeds the gap; kept for continuity with the published runs' },
];

/**
 * manifest-control.json and manifest-negative.json are deliberately NOT here.
 * They are gates that exist in order to FAIL: a cosmetic mutation the admission
 * checks must reject, and a pair the prover must refuse. Scoring a model on
 * them would publish a leaderboard row for an exercise whose correct outcome is
 * rejection.
 */

const MODELS = [
  'groq/openai/gpt-oss-120b',
  'groq/openai/gpt-oss-20b',
  'groq/qwen/qwen3.6-27b',
  'openrouter/deepseek/deepseek-v4-flash',
  'openrouter/qwen/qwen3-coder-30b-a3b-instruct',
  'openrouter/mistralai/mistral-small-3.2-24b-instruct',
  'openrouter/meta-llama/llama-4-scout',
  'openrouter/z-ai/glm-5.2',
  'openrouter/moonshotai/kimi-k2.7-code',
];

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const seeds = Number(argv.find((a) => /^[0-9]+$/.test(a)) ?? 5);

/**
 * What has already been done.
 *
 * Resumability is not a convenience here. A pass is dozens of paid calls and
 * hours of prover time; a crash in the middle must not mean paying for all of
 * it again, and must not mean a second registry row for a run already on chain.
 */
function seedsAlreadyRun() {
  const dir = join(REPO, '.run', 'batches');
  const best = new Map();
  let files = [];
  try { files = readdirSync(dir); } catch { return best; }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const b = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (!b.model || !b.task?.id) continue;
      // A batch that produced NO patch does not count as done. It is a result
      // worth keeping and worth retrying: it may have been an outage on our
      // side, which is exactly what attribution exists to separate and exactly
      // what must not be silently frozen into the record.
      if ((b.summary?.produced_patch ?? 0) === 0) continue;
      const key = b.model + ' ' + b.task.id;
      const attempted = b.summary?.attempted ?? 0;
      if (attempted > (best.get(key) ?? 0)) best.set(key, attempted);
    } catch { /* a half-written file from a kill is not a completed batch */ }
  }
  return best;
}

/**
 * ⚠️ A pair is done only if ONE batch already ran at least this many seeds.
 *
 * The first version of this asked "has any batch for this pair produced a
 * patch?", which is wrong in a way that would have been invisible in the
 * output: gpt-oss-120b has seven batches on log256 at 2, 5, 3, 3, 2, 2 and 5
 * seeds, so a 5-seed pass would have SKIPPED a pair holding 2 seeds and
 * published a leaderboard where the seed count silently varies by model. The
 * README already carries "several ran fewer than the intended five seeds" as a
 * known weakness; a resume rule that reproduces it on purpose is worse than the
 * accident was.
 *
 * The counts are NOT summed across batches. Those runs happened at different
 * times against different revisions of the harness, and adding them would build
 * one sample out of several experiments.
 */
function isDone(best, spec, taskId, seeds) {
  return (best.get(spec + ' ' + taskId) ?? 0) >= seeds;
}

function taskIdOf(manifestPath) {
  return JSON.parse(readFileSync(join(REPO, manifestPath), 'utf8')).id;
}

/**
 * ⚠️ The toolchain, before anything is planned or paid for.
 *
 * Found by running one pair as a smoke test: without `source .envrc.sh` the
 * pass dies on the FIRST task preparation with `spawn solc ENOENT` -- and it
 * dies AFTER printing "self-check ... ok", because the self-check is a shell
 * script that sources .envrc.sh itself while this process does not inherit it.
 * A reader would reasonably conclude the environment was fine and the task was
 * broken.
 *
 * An unattended overnight pass is exactly where a cryptic failure costs most:
 * it fails at minute two and is discovered at hour eight. equivalence.mjs
 * already refuses to treat a missing hevm as a verdict; this is the same rule
 * applied to the whole toolchain, at the entry point that runs longest.
 */
function requireToolchain() {
  // ⚠️ Per-tool version flags, because they are NOT the same and guessing
  // costs the whole pass: `hevm --version` is an error, hevm wants `version`.
  // The first launch of this pass refused to start, reporting hevm missing on a
  // machine where hevm was installed and on PATH -- a preflight built to
  // prevent a confusing failure, producing one.
  const PROBE = { solc: ['--version'], forge: ['--version'], cast: ['--version'], hevm: ['version'] };
  const missing = [];
  for (const [bin, args] of Object.entries(PROBE)) {
    try { execFileSync(bin, args, { stdio: 'ignore' }); }
    catch { missing.push(bin); }
  }
  if (missing.length) {
    console.error('\n  not on PATH: ' + missing.join(', '));
    console.error('  This shell has not been prepared. From the repository root:');
    console.error('      source .envrc.sh          # foundry + .tools');
    console.error('      ./scripts/bootstrap.sh    # if the tools are not installed yet\n');
    process.exit(1);
  }
}
requireToolchain();

const seedsRun = seedsAlreadyRun();
let skipped = 0;
const plan = [];
const refused = [];

for (const t of TASKS) {
  const id = taskIdOf(t.manifest);
  for (const spec of MODELS) {
    try {
      resolveModel(spec, { gateway: process.env.GATEWAY_URL || 'http://127.0.0.1:8402' });
    } catch (e) {
      // R14 and a missing price entry both land here, and both must stop the
      // pair BEFORE anything is paid for rather than partway through a pass.
      refused.push({ spec, reason: e.message.split('\n')[0] });
      continue;
    }
    if (isDone(seedsRun, spec, id, seeds)) { skipped++; continue; }
    plan.push({ ...t, id, spec });
  }
}

const uniqueRefused = [...new Map(refused.map((r) => [r.spec, r])).values()];
if (uniqueRefused.length) {
  console.log('\nrefused before spending anything:');
  for (const r of uniqueRefused) console.log('   ' + r.spec + '\n     ' + r.reason);
}

console.log('\n  seeds per pair   ' + seeds);
console.log('  tasks            ' + TASKS.length);
console.log('  models           ' + (MODELS.length - uniqueRefused.length));
// ⚠️ ACTUAL skips, not the size of the done set. Those differ: the done set
// also holds pairs from tasks not in this pass -- the cosmetic control, for one
// -- and reporting its size claimed three skips where the plan made two.
console.log('  pairs to run     ' + plan.length + (skipped ? '   (' + skipped + ' already have ' + seeds + '+ seeds, skipped)' : ''));
console.log('  runs to run      ' + plan.length * seeds + '\n');

let last = null;
for (const p of plan) {
  if (p.id !== last) { console.log('  ' + p.id + '   ' + p.why); last = p.id; }
  console.log('      ' + p.spec);
}

if (dryRun) {
  console.log('\n  --dry-run: nothing was called and nothing was paid for.\n');
  process.exit(0);
}

if (!process.env.GATEWAY_URL) {
  console.error('\nGATEWAY_URL is not set. A batch reaches the models through the x402 gateway or not at all.');
  console.error('  Start it with: npm run gateway\n');
  process.exit(1);
}

const startedAt = Date.now();
const log = [];
const RULE = '-'.repeat(72);
const outDir = join(REPO, '.run', 'batches');
mkdirSync(outDir, { recursive: true });
const passFile = join(outDir, Date.now() + '-PASS.json');

/**
 * ⚠️ Written after EVERY pair, not once at the end.
 *
 * A pass that is killed -- by a reboot, by the OOM killer picking the wrong
 * process, by someone closing the terminal -- would otherwise leave no record
 * of itself at all, and the one thing you want after an unattended run dies is
 * to know where it died.
 */
function writePass(extra = {}) {
  writeFileSync(passFile, JSON.stringify({
    schema: 'whetstone/batch-pass/v1',
    started: new Date(startedAt).toISOString(),
    seeds,
    tasks: TASKS.map((t) => t.manifest),
    models: MODELS,
    refused: uniqueRefused,
    planned: plan.length,
    pairs: log,
    ...extra,
  }, null, 2));
}
writePass({ status: 'running' });

/**
 * ⚠️ Three failures in a row stops the pass.
 *
 * Individual failures must not stop it -- one provider refusing or one prover
 * dying is exactly what "continue" is for. But three consecutive is not bad
 * luck: the gateway has died, the key has expired, the disk is full. Without
 * this the pass would spend the rest of the night failing fast through thirty
 * pairs and marking each one retryable, which looks identical in the morning to
 * having run them.
 */
const ABORT_AFTER = 3;
let consecutiveFailures = 0;

for (const [i, p] of plan.entries()) {
  console.log('\n' + RULE + '\n[' + (i + 1) + '/' + plan.length + '] ' + p.id + '  x  ' + p.spec + '\n' + RULE);
  const t0 = Date.now();

  const code = await new Promise((res) => {
    const child = spawn(
      process.execPath,
      ['--env-file=../.env', 'src/batch.mjs', p.spec, String(seeds)],
      { cwd: HARNESS, stdio: 'inherit', env: { ...process.env, TASK_MANIFEST: p.manifest } },
    );
    child.on('close', res);
    child.on('error', () => res(-1));
  });

  const secs = Math.round((Date.now() - t0) / 1000);
  // A failed pair does NOT stop the pass. One provider refusing, or one prover
  // running out of memory, must not cost the other pairs -- and the failure is
  // recorded here so it is visible afterwards instead of scrolled past.
  log.push({ task: p.id, model: p.spec, exit: code, seconds: secs });
  writePass({ status: 'running' });

  if (code === 0) {
    consecutiveFailures = 0;
    console.log('\n  ok, ' + secs + 's');
  } else {
    consecutiveFailures++;
    console.log('\n  FAILED exit ' + code + ' after ' + secs + 's -- continuing');
    if (consecutiveFailures >= ABORT_AFTER) {
      console.error('\n  ' + ABORT_AFTER + ' pairs failed in a row. Something is wrong with the');
      console.error('  environment rather than with these pairs -- check the gateway is still up,');
      console.error('  then rerun: completed pairs are skipped.\n');
      writePass({ status: 'aborted', reason: ABORT_AFTER + ' consecutive failures' });
      process.exit(1);
    }
  }
}

const total = Math.round((Date.now() - startedAt) / 1000);
const failed = log.filter((l) => l.exit !== 0);

console.log('\n' + '='.repeat(72));
console.log('  pairs      ' + (log.length - failed.length) + '/' + log.length + ' completed');
console.log('  wall clock ' + Math.floor(total / 60) + 'm ' + (total % 60) + 's');
if (failed.length) {
  console.log('\n  failed pairs (rerun the pass -- completed ones are skipped):');
  for (const f of failed) console.log('    ' + f.task + '  x  ' + f.model + '   exit ' + f.exit);
}

writePass({ status: 'complete', seconds: total });
console.log('\n  pass record  ' + passFile.replace(REPO, '') + '\n');
