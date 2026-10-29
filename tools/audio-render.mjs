// Renders the sound from sim/audio/ without a sound card: tools/audio-test.html in headless Chromium, through an
// OfflineAudioContext. Writes WAV files and manifest.json (what happens when) to a folder; tools/audio-analyze.py measures them.
//   NODE_PATH=$(npm root -g) node tools/audio-render.mjs <folder> [car …]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || 'audio-out'), only = process.argv.slice(3);
const CARS = ['kobbe', 'fjellrev', 'ravn', 'jerv', 'vinsjen', 'knott', 'turbo'].filter(c => !only.length || only.includes(c));
fs.mkdirSync(out, { recursive: true });

// a static file server for the repository (ES modules do not load from file://)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[page] error:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/tools/audio-test.html`);
await page.waitForFunction(() => window.audioTestReady === true);

function wav(file, r) {   // 16-bit stereo PCM
  const pcm = Buffer.from(r.b64, 'base64'), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(r.sr, 24); h.writeUInt32LE(r.sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(out, file), Buffer.concat([h, pcm]));
}
// every voice: held revs outside and inside, and a sweep; then the real physics, the road, the world, one-shots and the fallback
const jobs = [];
for (const id of CARS) jobs.push([id, 'steady', {}], [id, 'steady', { inside: 1 }], [id, 'sweep', {}]);
if (!only.length) jobs.push(['turbo', 'drive', {}], ['fjellrev', 'drive', {}], ['kobbe', 'drive', {}],
  ['ravn', 'road', {}], ['ravn', 'road', { engineOff: true }], ['ravn', 'road', { inside: 1 }], ['ravn', 'ambient', {}], ['jerv', 'events', {}],
  ['knott', 'steady', { worklet: false }], ['turbo', 'sweep', { worklet: false }]);
const manifest = [];
for (const [id, name, o] of jobs) {
  const t0 = Date.now(), r = await page.evaluate(([id, name, o]) => window.renderOffline(id, name, o), [id, name, o]);
  const file = `${id}-${name}${o.inside ? '-inside' : ''}${o.engineOff ? '-noengine' : ''}${o.worklet === false ? '-fallback' : ''}.wav`;
  wav(file, r); delete r.b64;
  manifest.push({ file, ...r, inside: o.inside || 0, fallback: o.worklet === false, engineOff: !!o.engineOff });
  console.log(file.padEnd(32), `${(r.n / r.sr).toFixed(1)} s in ${((Date.now() - t0) / 1000).toFixed(1)} s`, 'peak', r.peak.toFixed(3), r.over ? `CLIPPED ${r.over}` : '', r.worklet ? 'worklet' : 'node graph');
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
await browser.close(); server.close();
