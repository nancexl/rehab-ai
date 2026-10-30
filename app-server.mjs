// Demo server: serves dist/ and the Nemotron liner-agent API. The Token Factory key stays in this
// process's environment; it is never sent to the browser or written to traces/logs.
// Usage: NEBIUS_TOKEN_FACTORY_KEY=... node app-server.mjs [--port 4173] [--host 127.0.0.1]
import { createReadStream, existsSync, statSync, appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);
const agent = require('./integration/liner-agent.cjs');
const args = process.argv.slice(2);
const flag = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const port = Number(process.env.PORT || flag('--port', '4173'));
const host = flag('--host', process.env.HOST || '127.0.0.1');
const root = join(here, 'dist');
const ledgerDir = join(here, 'output');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

// Public-demo guards: per-client rate limit and a process-wide token budget.
const RATE = { windowMs: 10 * 60 * 1000, max: Number(process.env.AGENT_RATE_MAX || 8) };
const TOKEN_BUDGET = Number(process.env.AGENT_TOKEN_BUDGET || 600000);
let tokensSpent = 0;
const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  if (list.length >= RATE.max) return true;
  list.push(now); hits.set(ip, list); return false;
}
let busy = 0;

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/liner/status' && req.method === 'GET') {
    return send(res, 200, { live_configured: !!process.env.NEBIUS_TOKEN_FACTORY_KEY, provider: 'Nebius Token Factory',
      model: process.env.NEBIUS_MODEL || agent.DEFAULT_MODEL, fallback_model: agent.FALLBACK_MODEL, budget_remaining_tokens: Math.max(0, TOKEN_BUDGET - tokensSpent) });
  }
  if (url.pathname === '/api/liner/agent') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    const origin = req.headers.origin, hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
    if (origin && new URL(origin).host !== hostHeader) return send(res, 403, { error: 'Cross-origin agent requests are refused' });
    if ((req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') return send(res, 415, { error: 'Use application/json' });
    const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
    if (limited(ip)) return send(res, 429, { error: 'Rate limit: try again in a few minutes (protects the demo credit budget).' });
    if (tokensSpent >= TOKEN_BUDGET) return send(res, 503, { error: 'Demo token budget for this server process is used up.' });
    if (busy >= 3) return send(res, 503, { error: 'Agent busy; retry shortly.' });
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > 32768) return send(res, 413, { error: 'Request too large' }); chunks.push(c); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
    busy++;
    try {
      const result = await agent.runLinerAgent(body);
      tokensSpent += (result.totals && result.totals.total_tokens) || 0;
      try {
        mkdirSync(ledgerDir, { recursive: true });
        appendFileSync(join(ledgerDir, 'usage-ledger.jsonl'), JSON.stringify({ ts: result.timestamp, case: result.case_label, model: result.model_returned, outcome: result.outcome && result.outcome.status, ...result.totals }) + '\n');
      } catch {}
      return send(res, result.status === 'unavailable' ? 503 : 200, result);
    } catch (e) {
      return send(res, 400, { error: String(e.message || 'bad request').slice(0, 200) });
    } finally { busy--; }
  }
  if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Unknown API route' });
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'bad path' }); }
  const requested = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  if (!requested.startsWith(root) || !existsSync(requested) || !statSync(requested).isFile()) return send(res, 404, { error: 'Not found' });
  res.writeHead(200, { 'content-type': types[extname(requested)] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(requested).pipe(res);
}).listen(port, host, () => console.log(`Rehab AI demo server on http://${host}:${port}/ (live model: ${process.env.NEBIUS_TOKEN_FACTORY_KEY ? 'configured' : 'NOT configured'})`));
