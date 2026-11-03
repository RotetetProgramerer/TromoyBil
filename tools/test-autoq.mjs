// Den automatiske grafikken (sim/render/autoq.js) uten nettleser: spillet, grafikken og lageret er små attrapper, og testen mater
// tick() med bildetider.
//   node tools/test-autoq.mjs
// Sjekker: ingen trinn de første 6 s; 40 ms-bilder i 4 s gir ett trinn ned med beskjed (lagret med qualityAuto = true), aldri
// under Lav, 4 s ro etter hvert bytte; 6 ms-bilder i 12 s gir ett trinn opp, aldri over Høy og aldri etter et nedtrinn; bilder over
// 250 ms og de 3 s etter øybytte/teleport teller ikke; spillerens eget valg i Innstillinger slår det hele av (qualityAuto = false).
import { AutoQ } from '../sim/render/autoq.js';

const PRESETS = { lav: { name: 'Lav' }, middels: { name: 'Middels' }, hoy: { name: 'Høy' }, ultra: { name: 'Ultra' } };
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('   FEIL: ' + m); } };

function rig(q = 'middels', opts = {}) {
  const store = { d: {}, get(k, d) { return k in this.d ? this.d[k] : d; }, set(k, v) { this.d[k] = v; } };
  const gfx = { qName: q, sets: [], setQuality(v) { this.qName = v; this.sets.push(v); } };
  const game = { gfx, settings: { quality: q }, toasts: [], islandNow: 'tromoya', island() { return this.islandNow; }, cam: { snap: false },
    set(k, v) { this.settings[k] = v; if (k === 'quality') { gfx.setQuality(v); store.set('quality', v); } }, ui: { toast(t) { game.toasts.push(t); } } };
  const a = new AutoQ(gfx, game, store, Object.assign({ presets: PRESETS }, opts));
  return { a, gfx, game, store };
}
const feed = (a, ms, secs) => { for (let t = 0; t < secs * 1000; t += ms) a.tick(ms); };

console.log('1) trege bilder: ett trinn ned etter 6 s + 4 s, så videre ned til Lav, aldri lenger');
{
  const { a, gfx, game, store } = rig('hoy');
  feed(a, 40, 5.9); ok(gfx.qName === 'hoy', 'trinn før 6 s er gått');
  feed(a, 40, 3.9); ok(gfx.qName === 'hoy', 'trinn før 4 s med trege bilder');
  feed(a, 40, 0.3); ok(gfx.qName === 'middels', 'ikke satt ned til middels etter 6 + 4 s: ' + gfx.qName);
  ok(game.toasts[0] === 'Grafikken er satt ned til Middels for jevnere bilde', 'beskjeden: ' + game.toasts[0]);
  ok(store.get('quality') === 'middels' && store.get('qualityAuto') === true, 'lagret ' + JSON.stringify(store.d));
  ok(game.settings.quality === 'middels', 'innstillingen fulgte ikke med');
  ok(a.auto === true, 'et automatisk trinn slo av automatikken');
  feed(a, 40, 3.9); ok(gfx.qName === 'middels', 'trinn i de 4 s ro etter byttet');
  feed(a, 40, 4.2); ok(gfx.qName === 'lav', 'ikke satt ned til lav etter 4 + 4 s: ' + gfx.qName);
  ok(game.toasts[1] === 'Grafikken er satt ned til Lav for jevnere bilde', 'beskjeden: ' + game.toasts[1]);
  feed(a, 40, 30); ok(gfx.qName === 'lav' && gfx.sets.length === 2, 'gikk under Lav eller byttet igjen: ' + gfx.sets);
  feed(a, 6, 30); ok(gfx.qName === 'lav', 'satt opp igjen etter et nedtrinn');
}
console.log('2) raske bilder: ett trinn opp etter 6 s + 12 s, aldri over Høy');
{
  const { a, gfx, game } = rig('middels');
  feed(a, 6, 17.9); ok(gfx.qName === 'middels', 'trinn før 6 + 12 s');
  feed(a, 6, 0.2); ok(gfx.qName === 'hoy', 'ikke satt opp til høy: ' + gfx.qName);
  ok(game.toasts[0] === 'Grafikken er satt opp til Høy – bildet er jevnt', 'beskjeden: ' + game.toasts[0]);
  feed(a, 6, 60); ok(gfx.qName === 'hoy', 'gikk over Høy: ' + gfx.qName);
  const r2 = rig('lav'); feed(r2.a, 6, 18.1); ok(r2.gfx.qName === 'middels', 'lav gikk ikke opp til middels: ' + r2.gfx.qName);
  feed(r2.a, 6, 16.1); ok(r2.gfx.qName === 'hoy', 'middels gikk ikke videre opp til høy: ' + r2.gfx.qName);
}
console.log('3) grensene: 27 ms er ikke tregt, 30 ms er; 10 ms er ikke raskt, 8 ms er');
{
  const r = rig('middels'); feed(r.a, 27, 30); ok(r.gfx.qName === 'middels', '27 ms-bilder ga et trinn ned');
  const s = rig('middels'); feed(s.a, 30, 10.2); ok(s.gfx.qName === 'lav', '30 ms-bilder ga ikke et trinn ned: ' + s.gfx.qName);
  const t = rig('middels'); feed(t.a, 10, 40); ok(t.gfx.qName === 'middels', '10 ms-bilder ga et trinn opp');
  const u = rig('middels'); feed(u.a, 8, 18.2); ok(u.gfx.qName === 'hoy', '8 ms-bilder ga ikke et trinn opp: ' + u.gfx.qName);
}
console.log('4) bilder over 250 ms teller ikke (skjult fane, et langt stopp)');
{
  const { a, gfx } = rig('middels');
  feed(a, 1000, 60); ok(gfx.qName === 'middels' && a.ema === 0, 'lange bilder talte: ema ' + a.ema);
  feed(a, 40, 6.2); feed(a, 1000, 20); ok(gfx.qName === 'middels', 'lange bilder talte som trege');
  feed(a, 40, 4.2); ok(gfx.qName === 'lav', 'trege bilder etter de lange ga ikke trinn: ' + gfx.qName);
}
console.log('5) øybytte og teleport: 3 s ro, og tellingen begynner på nytt');
{
  const { a, gfx, game } = rig('middels');
  feed(a, 40, 6.5); feed(a, 40, 3); game.islandNow = 'sand'; feed(a, 40, 2.9); ok(gfx.qName === 'middels', 'trinn i roen etter øybytte');
  feed(a, 40, 1.5); ok(gfx.qName === 'middels', 'tellingen fortsatte over øybyttet');
  feed(a, 40, 3); ok(gfx.qName === 'lav', 'ikke satt ned 4 s etter roen: ' + gfx.qName);
  const r = rig('middels'); feed(r.a, 40, 9.5); r.game.cam.snap = true; r.a.tick(40); r.game.cam.snap = false; feed(r.a, 40, 2.9); ok(r.gfx.qName === 'middels', 'trinn i roen etter teleport');
  feed(r.a, 40, 4.2); ok(r.gfx.qName === 'lav', 'ikke satt ned etter teleport-roen: ' + r.gfx.qName);
}
console.log('6) spillerens eget valg vinner: game.set fra Innstillinger slår automatikken av for godt');
{
  const { a, gfx, game, store } = rig('middels');
  feed(a, 40, 2); game.set('quality', 'hoy');
  ok(a.auto === false && store.get('qualityAuto') === false, 'valget ble ikke merket som spillerens: ' + JSON.stringify(store.d));
  ok(gfx.qName === 'hoy' && store.get('quality') === 'hoy', 'valget nådde ikke grafikken');
  feed(a, 40, 60); ok(gfx.qName === 'hoy', 'automatikken trappet ned etter spillerens valg');
  feed(a, 6, 60); ok(gfx.qName === 'hoy', 'automatikken trappet opp etter spillerens valg');
  const r = rig('hoy', { auto: false }); feed(r.a, 40, 60); ok(r.gfx.qName === 'hoy', 'lagret valg (auto: false) ble overstyrt');
}
console.log(`${n - fails} av ${n} sjekker i orden`);
process.exit(fails ? 1 : 0);
