// Tester flerspillerrommet (sim/net/room.js) uten nettleser: først over et liksom-nett, så over den ekte lokale transporten
// (BroadcastChannel, som Node også har).
//   node tools/test-net.mjs
import { Room, normCode, cleanName, errText } from '../sim/net/room.js';
import { localTransport } from '../sim/net/transport.js';

let fails = 0;
const ok = (c, msg) => { if (!c) fails++; console.log((c ? 'ok    ' : 'FEIL  ') + msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 2000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await wait(5); return f(); };

// a pretend network: hosts found by code, links in pairs, every message delivered a moment later as a copy
function mockNet() {
  const hosts = new Map(); let n = 0;
  const connect = (G, h) => {
    const a = { id: h.T.id, open: true }, b = { id: G.id, open: true };   // a: the guest's link to the host, b: the host's to the guest
    const wire = (L, other, ev) => {
      L.send = m => { const c = JSON.parse(JSON.stringify(m)); setTimeout(() => { if (L.open && other.open) ev.data(other, c); }, 1); };
      L.close = () => { if (!L.open) return; L.open = false; setTimeout(() => { if (other.open) { other.open = false; ev.close(other); } }, 1); };
    };
    wire(a, b, h.ev); wire(b, a, G.ev); h.T.links.add(b); G.links.add(a);
    h.ev.link(b); G.ev.link(a);
  };
  return () => {
    const T = { id: '', links: new Set() };
    T.start = (code, asHost, ev) => new Promise((res, rej) => setTimeout(() => {
      T.code = code; T.ev = ev;
      if (asHost) { if (hosts.has(code)) return rej(new Error('taken')); T.id = 'h-' + code; hosts.set(code, { T, ev }); return res(T.id); }
      const h = hosts.get(code); if (!h) return rej(new Error('noroom'));
      T.id = 'g' + (++n); connect(T, h); res(T.id);
    }, 1));
    T.again = () => new Promise((res, rej) => setTimeout(() => { const h = hosts.get(T.code); if (!h) return rej(new Error('noroom')); connect(T, h); res(); }, 1));
    T.stop = () => { for (const L of T.links) L.close(); T.links.clear(); if (hosts.get(T.code) && hosts.get(T.code).T === T) hosts.delete(T.code); };
    return T;
  };
}

function player(name, transport, opts = {}) {
  const P = { msgs: [], toasts: [], leaves: [], closed: null, status: '' };
  P.room = new Room(Object.assign({
    transport, name: () => name, info: () => ({ car: 'ravn', col: '#ff0000' }), clean: i => ({ car: i && i.car === 'ravn' ? 'ravn' : 'kobbe', col: i && i.col || null }),
    on: (t, a, b) => {
      if (t === 'msg') P.msgs.push({ from: a.id, m: b }); if (t === 'toast') P.toasts.push(a); if (t === 'leave') P.leaves.push({ id: a.id, why: b });
      if (t === 'closed') P.closed = a; if (t === 'status') P.status = a;
    },
  }, opts));
  return P;
}
const names = P => [...P.room.players.values()].map(p => p.name).sort().join(',');

// ---------------------------------------------------------------- pure helpers
ok(normCode('krabbe 42') === 'KRABBE-42' && normCode('Krabbe-42') === 'KRABBE-42' && normCode('KRABBE42') === 'KRABBE-42', 'romkoden leses uansett skrivemåte');
ok(normCode('42') === null && normCode('krabbe') === null, 'feil kode avvises');
ok(cleanName('  <b>Kari   Nordmann</b> og mer  ') === 'bKari Nordmann' && cleanName('') === 'Sjåfør', 'navn vaskes og kortes ned: ' + cleanName('  <b>Kari   Nordmann</b> og mer  '));

// ---------------------------------------------------------------- a room over the pretend network
{
  const net = mockNet(), A = player('Anna', net, { stale: 400 }), B = player('Bjørn', net, { retry: 50 }), C = player('Cato', net), D = player('Dina', net), E = player('Erik', net);
  A.room.create(false); await until(() => A.room.inRoom);
  ok(A.room.inRoom && A.room.host && /^[A-Z]+-\d\d$/.test(A.room.code), 'verten lager rom ' + A.room.code);
  B.room.join(A.room.code.toLowerCase().replace('-', ' '), false); await until(() => B.room.inRoom);
  ok(B.room.inRoom && B.room.slot === 1 && names(B) === 'Anna', 'Bjørn er med på plass 1 og ser Anna');
  ok(names(A) === 'Bjørn' && A.toasts.includes('Bjørn er med og kjører sammen med deg'), 'Anna ser Bjørn og får beskjed');
  C.room.join(A.room.code, false); await until(() => C.room.inRoom && B.room.players.size === 2);
  ok(C.room.slot === 2 && names(C) === 'Anna,Bjørn' && names(B) === 'Anna,Cato', 'Cato er med på plass 2, og Bjørn får vite det');
  // the game's messages are passed on by the host, marked with who sent them
  B.room.send({ t: 's', x: 1 }); await until(() => C.msgs.length && A.msgs.length);
  ok(A.msgs.some(e => e.from === B.room.me && e.m.x === 1) && C.msgs.some(e => e.from === B.room.me && e.m.x === 1), 'Bjørns melding når Anna og Cato');
  ok(!B.msgs.some(e => e.from === B.room.me), 'Bjørn får ikke sin egen melding tilbake');
  // a guest cannot speak for others or run the room
  B.room.hostLink.send({ t: 's', f: A.room.me, y: 2 }); B.room.hostLink.send({ t: 'roster', list: [] }); B.room.hostLink.send({ t: 'welcome', slot: 3, list: [] });
  await wait(30);
  ok(C.msgs.some(e => e.m.y === 2 && e.from === B.room.me) && C.room.players.size === 2 && C.room.slot === 2 && !C.msgs.some(e => e.m.t === 'roster' || e.m.t === 'welcome'), 'en gjest kan ikke utgi seg for verten eller styre rommet');
  // info changes go to everyone
  B.room.setInfo({ car: 'ravn', col: '#00ff00' }); await wait(20);
  ok(C.room.players.get(B.room.me).info.col === '#00ff00' && A.room.players.get(B.room.me).info.col === '#00ff00', 'ny lakk når alle');
  // four is full
  D.room.join(A.room.code, false); await until(() => D.room.inRoom);
  E.room.join(A.room.code, false); await until(() => E.status === errText('full'));
  ok(D.room.slot === 3 && !E.room.inRoom && E.status === errText('full'), 'fire er fullt: Erik får beskjed');
  // an old version is turned away
  {
    const T = net(); let got = null;
    await T.start(A.room.code, false, { link: L => L.send({ t: 'hello', v: 999, name: 'X' }), data: (L, m) => { got = m.t; }, close: () => { } });
    await until(() => got); ok(got === 'old' && A.room.players.size === 3, 'feil versjon avvises');
  }
  // Cato leaves
  C.room.leave('Du forlot rommet'); await until(() => B.room.players.size === 2 && A.room.players.size === 2);
  ok(!A.room.players.has(C.room.me) && B.leaves.some(e => e.why === 'left') && A.toasts.includes('Cato forlot rommet'), 'Cato går, de andre får vite det');
  // Bjørn loses the host for a moment and gets back in
  const bid = B.room.me; [...A.room.links.values()].find(L => L.id === bid).close();
  await until(() => B.toasts.some(t => t.startsWith('Mistet kontakten')));
  await until(() => B.room.hostLink && A.room.players.has(bid));
  ok(B.room.inRoom && A.room.players.has(bid) && B.room.players.size === 2, 'Bjørn mister verten og kommer inn igjen');
  // Dina goes silent: the host drops her after the stale time while the others keep pinging
  const live = setInterval(() => { for (const P of [A, B]) { P.room.send({ t: 'ping' }); P.room.tick(); } }, 40);
  await until(() => !A.room.players.has(D.room.me), 1500);
  ok(!A.room.players.has(D.room.me) && A.toasts.includes('Dina mistet forbindelsen'), 'en stille spiller fjernes etter en stund');
  await until(() => B.room.players.size === 1);
  ok(names(B) === 'Anna', 'Bjørn får vite at Dina er borte');
  clearInterval(live);
  // the host leaves: the guests are told and drive alone
  A.room.leave('Du forlot rommet'); await until(() => !B.room.inRoom);
  ok(!B.room.inRoom && B.closed === 'host' && B.room.players.size === 0 && B.toasts.includes('Verten avsluttet rommet. Du kjører alene nå.'), 'verten går: Bjørn kjører alene');
  D.room.stop();
}

// ---------------------------------------------------------------- the real local transport (BroadcastChannel)
{
  const H = player('Hege', localTransport), G = player('Geir', localTransport, { welcome: 1500 });
  H.room.create(true); await until(() => H.room.inRoom);
  ok(H.room.inRoom && H.room.me === 'host-' + H.room.code, 'lokal test: rommet er laget');
  G.room.join(H.room.code, true); await until(() => G.room.inRoom && H.room.players.size === 1);
  ok(G.room.inRoom && names(G) === 'Hege' && names(H) === 'Geir', 'lokal test: Geir er med');
  G.room.send({ t: 's', z: 3 }); await until(() => H.msgs.length);
  ok(H.msgs.some(e => e.m.z === 3 && e.from === G.room.me), 'lokal test: meldinger går fram');
  const t2 = localTransport(); let taken = '';
  await t2.start(H.room.code, true, { link() { }, data() { }, close() { } }).catch(e => { taken = e.message; });
  ok(taken === 'taken', 'lokal test: en annen vert med samme kode avvises');
  G.room.leave(); await until(() => H.room.players.size === 0);
  ok(H.room.players.size === 0 && H.leaves.some(e => e.why === 'left'), 'lokal test: Geir går');
  const N = player('Nils', localTransport); N.room.join('TORSK-11', true); await until(() => N.status.startsWith('Fant ikke'), 4000);
  ok(!N.room.inRoom && N.status === errText('noroom', true), 'lokal test: et rom som ikke finnes');
  H.room.leave(); await wait(100);
}
console.log(fails ? fails + ' FEIL' : 'alt i orden');
process.exit(fails ? 1 : 0);
