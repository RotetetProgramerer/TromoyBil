// Spillflyten i nettleseren: verkstedet fra tilbudet, kart/innstillinger og Tilbake, avbrutt løp, bilen etter målgang og ferja,
// drevet gjennom window.SIM og DOM-klikk i headless Chromium (q=lav, 800×450, tegningen koblet ut så tilstanden kan kjøres fort).
//   python3 -m http.server 8123 --bind 127.0.0.1 &   (fra repo-rota)
//   node tools/test-ui.mjs [port]                      (port: 8123 om ikke oppgitt, eller PORT=…)
// Skriver PASS/FAIL per sjekk og avslutter med feilkode hvis noe feilet. Sjekkene er funnene UI-01, -02, -03, -05, -07 og -08
// i docs/gjennomgang-2026-11.md.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = +(process.argv[2] || process.env.PORT || 8123);
const URL = `http://127.0.0.1:${PORT}/index.html?q=lav&dyr=0`;
const errs = []; let fails = 0, n = 0;
const check = (name, ok, info) => { n++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '   (' + info + ')' : '')); if (!ok) fails++; };
const dist = (a, b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]);

// in the page: the state in one object, the game clock driven by hand, teleport
const helpers = () => {
  const $ = id => document.getElementById(id), g = SIM.game;
  SIM.gfx.render = () => {};                                     // software GL takes seconds per frame; the state is what we test
  window.ST = () => ({ mode: g.mode, open: g.ui.open, from: g.ui.from, vis: [...document.querySelectorAll('.overlay')].filter(o => !o.hidden).map(o => o.id), hud: !$('hud').hidden,
    offer: $('offer').hidden ? null : $('oKind').textContent, pAbort: !$('pAbort').hidden, hCourse: !$('hCourse').hidden, count: !$('count').hidden,
    toast: $('toast').classList.contains('on') ? $('toast').textContent : null, pos: [g.car.pos.x, g.car.pos.z], kmh: Math.round(g.car.kmh), race: !!g.courses.active, nuts: g.prof.nuts,
    spin: Math.max(...g.car.wheels.map(w => Math.abs(w.omega))) });
  window.TICK = (sec, dt = 0.05) => { for (let t = 0; t < sec - 1e-9; t += dt) g.update(dt); return ST(); };
  window.TP = (x, z, h = 0) => { g.car.place(SIM.world, x, z, h); for (let i = 0; i < 200; i++) g.car.step(1 / 400, SIM.world); g.afterIslandChange(); g.cam.snap = true; };
  window.RESET = () => { g.courses.stop(); g.ui.course(null); g.ui.hide(); g.mode = 'drive'; g.car.vel.set(0, 0, 0); g.car.w.set(0, 0, 0); };
};

const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader-webgl'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } }); p.setDefaultTimeout(600000);
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!/GPU stall|status of 404|WebGL/.test(t)) errs.push(m.type() + ': ' + t.slice(0, 300)); } });
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
const t0 = Date.now();
await p.goto(URL, { timeout: 300000 });
await p.waitForFunction(() => window.SIM && document.getElementById('loading').hidden, null, { timeout: 600000, polling: 1000 });
console.log('lastet på', ((Date.now() - t0) / 1000).toFixed(1), 's');
await p.evaluate(helpers);
const ev = (f, a) => p.evaluate(f, a);
const st = () => ev(() => ST());
const tick = s => ev(s => TICK(s), s);
const click = sel => ev(sel => { const el = document.querySelector(sel); if (!el || el.hidden || el.closest('[hidden]') || el.disabled) return false; el.click(); return true; }, sel);
// click, and read the camera's snap flag in the same turn, before the page's own frame loop consumes it
const clickSnap = sel => ev(sel => { const el = document.querySelector(sel); if (!el || el.hidden || el.closest('[hidden]')) return null; el.click(); return SIM.game.cam.snap; }, sel);
const key = async (k, sec = 0.1) => { await p.keyboard.press(k); return tick(sec); };
const reset = () => ev(() => RESET());
const flow = async (name, fn) => { try { await fn(); } catch (e) { check(name + ': kjørte ikke ferdig', false, e.message.split('\n')[0]); } };

// UI-02: main menu → settings → Tilbake → Kjør! → M → Lukk must land back in the driving, not in the settings
await flow('UI-02', async () => {
  await ev(() => SIM.game.toMenu());
  await click('#mSettings'); const s1 = await st();
  await click('#settings [data-back]'); const s2 = await st();
  check('UI-02 meny → innstillinger → Tilbake → menyen', s1.vis.includes('settings') && s2.vis.includes('menu'), `vis ${s1.vis} → ${s2.vis}`);
  await click('#mDrive'); await tick(0.2);
  const s3 = await key('m');
  check('UI-02 M under kjøring → kartet, pauset', s3.vis.includes('map') && s3.mode === 'pause', `vis ${s3.vis}, mode ${s3.mode}`);
  await click('#map [data-back]'); const s4 = await tick(0.1);
  check('UI-02 «Lukk» på kartet → kjøring, ingen overlay', s4.mode === 'drive' && s4.vis.length === 0 && s4.hud, `mode ${s4.mode}, vis [${s4.vis}], from ${s4.from}`);
  const s5 = await key('m'); await click('#map [data-back]'); const s6 = await tick(0.1);
  check('UI-02 M og «Lukk» en gang til → fortsatt kjøring', s5.vis.includes('map') && s6.mode === 'drive' && s6.vis.length === 0, `mode ${s6.mode}, vis [${s6.vis}]`);
});

// UI-01: the workshop from the road offer, then «Tilbake» or Esc: back in the car, not stuck in mode 'garage'
await flow('UI-01', async () => {
  await reset();
  const base = await ev(() => { const a = SIM.game.base.ask; return [a.x, a.z]; });
  await ev(b => TP(b[0], b[1], 0), base); const w1 = await tick(0.6);
  check('UI-01 tilbudet «Verkstedet» ved verkstedet', w1.offer === 'Verkstedet', `offer ${w1.offer}, mode ${w1.mode}`);
  const w2 = await key('Enter');
  check('UI-01 Enter åpner verkstedet', w2.vis.includes('garage'), `vis [${w2.vis}], mode ${w2.mode}`);
  const snap = await clickSnap('#garage [data-back]'); const w3 = await tick(0.3);
  check('UI-01 «Tilbake» fra verkstedet → kjøring', w3.mode === 'drive' && w3.vis.length === 0 && w3.hud, `mode ${w3.mode}, vis [${w3.vis}]`);
  check('UI-01 kameraet klipper bak bilen (cam.snap) ved «Tilbake»', snap === true, `snap ${snap}`);
  await tick(0.6); const w4 = await key('Enter'); const w5 = await key('Escape');
  check('UI-01 Esc fra verkstedet → kjøring', w4.vis.includes('garage') && w5.mode === 'drive' && w5.vis.length === 0, `garage ${w4.vis.includes('garage')}, mode ${w5.mode}, vis [${w5.vis}]`);
  const w6 = await key('m');
  check('UI-01 tastene virker etterpå (M → kartet)', w6.vis.includes('map'), `vis [${w6.vis}], mode ${w6.mode}`);
  await click('#map [data-back]'); await tick(0.1);
});

// UI-03: «Avbryt løpet» disappears from the pause menu with the run, and says so
await flow('UI-03', async () => {
  await reset();
  await ev(() => { const g = SIM.game; g.courses.start(g.courses.forIsland(g.island())[0]); }); const a0 = await tick(0.3);
  const a1 = await key('Escape');
  check('UI-03 løp i gang, pausemenyen har «Avbryt løpet»', a0.race && a0.mode === 'race' && a1.vis.includes('pause') && a1.pAbort, `race ${a0.race}, vis [${a1.vis}], pAbort ${a1.pAbort}`);
  await click('#pAbort'); const a2 = await tick(0.2);
  check('UI-03 «Avbryt løpet» → kjøring, toast, nedtellingen borte', a2.mode === 'drive' && !a2.race && !a2.hCourse && !a2.count && a2.toast === 'Løpet er avbrutt', `mode ${a2.mode}, toast ${a2.toast}, count ${a2.count}`);
  const a3 = await key('Escape');
  check('UI-03 pausemenyen etterpå uten «Avbryt løpet»', a3.vis.includes('pause') && !a3.pAbort, `vis [${a3.vis}], pAbort ${a3.pAbort}`);
  await click('#pResume'); await tick(0.1);
  // called off for being too far from the course
  await ev(() => { const g = SIM.game; g.courses.start(g.courses.forIsland(g.island())[0]); }); await tick(4.2); await ev(() => TP(-900, 455, 0)); const f1 = await tick(0.3);
  const f2 = await key('Escape');
  check('UI-03 «for langt fra løypa» → ingen «Avbryt løpet»', !f1.race && (f1.toast || '').startsWith('For langt') && !f1.pAbort && f2.vis.includes('pause') && !f2.pAbort, `toast ${f1.toast}, pAbort ${f2.pAbort}`);
  await click('#pResume'); await tick(0.1);
});

// UI-05: the car stands still while the result screen (and the main menu) is up
await flow('UI-05', async () => {
  await reset();
  const G = await ev(() => { const g = SIM.game; return g.courses.forIsland(g.island())[0].gates; });
  await ev(() => { const g = SIM.game; g.courses.start(g.courses.forIsland(g.island())[0]); }); await tick(4.2);
  for (let i = 0; i < G.length - 1; i++) { await ev(([x, z]) => SIM.game.car.place(SIM.world, x, z, 0), G[i]); await tick(0.1); }
  // through the last gate at speed
  const last = G[G.length - 1], prev = G[G.length - 2], hh = Math.atan2(last[0] - prev[0], last[1] - prev[1]);
  await ev(([x, z, h]) => { const c = SIM.game.car; c.place(SIM.world, x - Math.sin(h) * 25, z - Math.cos(h) * 25, h); for (let i = 0; i < 50; i++) c.step(1 / 400, SIM.world); c.vel.set(Math.sin(h) * 28, 0, Math.cos(h) * 28); }, [last[0], last[1], hh]);
  let pre = null, fin = null; for (let i = 0; i < 60; i++) { pre = fin; fin = await tick(0.05); if (fin.mode === 'result') break; }
  check('UI-05 målgang i fart → resultatskjermen', fin.mode === 'result' && fin.vis.includes('result'), `mode ${fin.mode}, ${pre ? pre.kmh : '?'} km/t før mål`);
  check('UI-05 hjulene står stille i samme bilde som resultatet (ingen spinn mot bakken)', fin.mode === 'result' && fin.spin < 0.5, `maks |omega| ${fin.spin.toFixed(2)} rad/s (${pre ? pre.spin.toFixed(1) : '?'} før mål)`);
  const r5 = await tick(5);
  check('UI-05 bilen står stille mens resultatet er oppe (< 2 m på 5 s)', r5.mode === 'result' && dist(fin, r5) < 2 && r5.kmh === 0, `${dist(fin, r5).toFixed(1)} m, ${r5.kmh} km/t`);
  await click('#rDone'); const d1 = await tick(0.1);
  check('UI-05 «Kjør videre» → kjøring', d1.mode === 'drive' && d1.vis.length === 0, `mode ${d1.mode}, vis [${d1.vis}]`);
  // Hovedmeny at speed: the car stops
  await ev(() => { const c = SIM.game.car, h = Math.atan2(c.fw.x, c.fw.z); c.vel.set(Math.sin(h) * 15, 0, Math.cos(h) * 15); }); const m0 = await tick(0.05);
  await ev(() => SIM.game.toMenu()); const m1 = await tick(3);
  check('UI-05 Hovedmeny i fart → bilen stopper (< 2 m på 3 s)', m1.mode === 'menu' && dist(m0, m1) < 2 && m1.kmh === 0, `${m0.kmh} km/t før, ${dist(m0, m1).toFixed(1)} m, ${m1.kmh} km/t`);
  await click('#mDrive'); await tick(0.1);
});

// UI-07: the ferry offer opens the map paused; UI-08: the offer bar goes away with the ferry
await flow('UI-07/08', async () => {
  await reset();
  const deck = await ev(() => { const f = SIM.game.ferry.group.position; return [f.x, f.z]; });
  await ev(d => TP(d[0], d[1], 0), deck); const f1 = await tick(0.6);
  check('UI-07 tilbudet «Ferja» på dekket', f1.offer === 'Ferja', `offer ${f1.offer}`);
  const f2 = await key('Enter');
  check('UI-07 Enter → kartet med mode pause', f2.vis.includes('map') && f2.mode === 'pause', `vis [${f2.vis}], mode ${f2.mode}`);
  await p.keyboard.down('ArrowUp'); const f3 = await tick(1); await p.keyboard.up('ArrowUp');
  check('UI-07 gass med kartet oppe flytter ikke bilen', dist(f2, f3) < 0.5 && f3.vis.includes('map'), `${dist(f2, f3).toFixed(1)} m, ${f3.kmh} km/t`);
  await click('#map [data-back]'); const f4 = await tick(0.1);
  check('UI-07 «Lukk» → kjøring', f4.mode === 'drive' && f4.vis.length === 0, `mode ${f4.mode}, vis [${f4.vis}]`);
  // the offer bar is up, the map is opened with M and a destination picked
  const g1 = await tick(0.6); const g2 = await key('m');
  check('UI-08 tilbudslinjen oppe, kartet åpnet med M', g1.offer === 'Ferja' && g2.vis.includes('map'), `offer ${g1.offer}, vis [${g2.vis}]`);
  const ok = await click('#ferryList .item'); const g3 = await tick(0.1);
  check('UI-08 ferja valgt → overfart uten tilbudslinjen', ok && g3.mode === 'ferry' && g3.offer === null && g3.vis.length === 0, `mode ${g3.mode}, offer ${g3.offer}, nuts ${g3.nuts}`);
  const g4 = await tick(15);
  check('UI-08 framme etter overfarten', g4.mode === 'drive' && (g4.toast || '').startsWith('Velkommen'), `mode ${g4.mode}, toast ${g4.toast}`);
});

await b.close();
if (errs.length) console.log('konsollfeil:', errs.join('\n'));
console.log(`${n - fails} av ${n} sjekker PASS` + (fails ? `, ${fails} FAIL` : ''));
process.exit(fails || errs.length ? 1 : 0);
