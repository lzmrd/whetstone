/**
 * Serve web/ locally.
 *
 * ⚠️ A static file server and nothing else. The page talks to the subgraph
 * directly from the browser, so there is no backend that could quietly reshape
 * the numbers between the index and the screen — what the page shows is what a
 * judge gets by querying the same public endpoint themselves.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../web/', import.meta.url));
const PORT = Number(process.env.WEB_PORT ?? 8403);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const file = join(ROOT, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`\n  leaderboard  http://127.0.0.1:${PORT}\n`));
