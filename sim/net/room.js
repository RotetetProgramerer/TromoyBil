// A room to drive together in: a host and up to three guests. Guests connect only to the host, and the host passes their
// messages on to the others (and tells everyone who is in the room). No DOM and no three.js: tools/test-net.mjs runs it in Node.
//   new Room({transport(local), name(), info(), clean(info), on(type, ...args)}) and optional timings (ms): welcome, stale,
//   retry, retries, now(). transport(local) makes a transport from transport.js; info() is my car as a small object that
//   clean() checks when it comes from someone else.
// Events through on(type, ...): 'status' (text, bad) for the dialog · 'open' () in a room now · 'join' (p) · 'update' (p) name,
//   slot or info changed · 'leave' (p, why: 'left' | 'lost' | null when the room closes) · 'msg' (p, m) a game message ·
//   'closed' (why: 'host' | 'lost') the room ended under you · 'toast' (text, bad) · 'change' () something the lists show.
// p = {id, name, slot, info, seen}. Messages are small JSON objects {t, f: from, ...}. The room's own: hello {v, name, info},
// welcome {slot, list}, full, old, roster {list}, info {info}, ping, bye; anything else is the game's and is passed on.
export const NET_VER = 1, NET_MAX = 4;
const WORDS = ['KRABBE', 'OTER', 'SEL', 'ELG', 'REV', 'HARE', 'ULV', 'GAUPE', 'LUNDE', 'ORRE', 'JERV', 'HJORT', 'MAKRELL', 'TORSK', 'LAKS', 'EKORN', 'SKARV', 'TERNE', 'HUMMER', 'GREVLING'];
const CONTROL = new Set(['hello', 'welcome', 'full', 'old', 'roster']);

export const cleanName = s => String(s || '').replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Sjåfør';
export const newCode = () => WORDS[Math.floor(Math.random() * WORDS.length)] + '-' + (10 + Math.floor(Math.random() * 90));
// «krabbe 42», «KRABBE42» and «Krabbe-42» all become KRABBE-42
export function normCode(s) { const t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), m = t.match(/^([A-Z]{2,10})(\d{2})$/); return m ? m[1] + '-' + m[2] : null; }
export function errText(w, local) {
  if (w === 'noroom' && local) return 'Fant ikke rommet. Med «Lokal test» må verten være i en annen fane i den samme nettleseren.';
  return { taken: 'Koden var opptatt. Prøv igjen.', noroom: 'Fant ikke rommet. Sjekk koden, og at verten fortsatt er i rommet.', browser: 'Denne nettleseren støtter ikke flerspiller.',
    lib: 'Fikk ikke lastet flerspiller. Sjekk nettet.', net: 'Fikk ikke kontakt med koblingstjenesten. Sjekk nettet, eller prøv et annet nett.',
    full: 'Rommet er fullt. Det er plass til fire.', old: 'Den andre spilleren har en annen versjon av spillet. Last siden på nytt begge to.' }[w] || 'Noe gikk galt med tilkoblingen.';
}

export class Room {
  constructor(o) {
    this.o = Object.assign({ welcome: 8000, stale: 60000, retry: 3000, retries: 5, now: () => performance.now(), on: () => { }, clean: i => i }, o);
    this.inRoom = false; this.joining = false; this.host = false; this.local = false; this.code = ''; this.me = ''; this.name = ''; this.slot = 0;
    this.players = new Map(); this.links = new Map(); this.hostLink = null; this.tr = null; this.hostSeen = 0; this.leaving = false; this.retry = 0; this.welcomeT = null; this.text = ''; this.bad = false;
  }
  emit(...a) { this.o.on(...a); }
  status(t, bad) { this.text = t || ''; this.bad = !!bad; this.emit('status', this.text, this.bad); }
  // a new transport; its events count only while it is the room's transport
  open(local) {
    const tr = this.tr = this.o.transport(local), ok = () => this.tr === tr;
    tr.ev = { link: L => ok() && this.onLink(L), data: (L, m) => ok() && this.onData(L, m), close: L => ok() && this.onClose(L) };
    return tr;
  }
  create(local, tries = 0) {
    if (this.inRoom || this.joining) return;
    this.joining = true; this.leaving = false; this.local = !!local; this.name = cleanName(this.o.name()); const code = newCode(), tr = this.open(local); this.status('Lager rom …');
    tr.start(code, true, tr.ev).then(id => {
      if (this.tr !== tr) return;
      Object.assign(this, { joining: false, inRoom: true, host: true, me: id, code, slot: 0 }); this.status(''); this.emit('open'); this.emit('toast', 'Rom ' + code + ' er klart'); this.emit('change');
    }).catch(e => {
      if (this.tr !== tr) return; this.joining = false; this.tr = null;
      if (e.message === 'taken' && tries < 3) return this.create(local, tries + 1);
      this.status(errText(e.message, local), true); this.emit('change');
    });
  }
  join(raw, local) {
    if (this.inRoom || this.joining) return;
    const code = normCode(raw); if (!code) { this.status('Skriv koden slik: KRABBE-42', true); return; }
    this.joining = true; this.leaving = false; this.local = !!local; this.name = cleanName(this.o.name()); this.code = code; this.host = false; const tr = this.open(local);
    this.status('Kobler til ' + code + ' …'); this.emit('change');
    tr.start(code, false, tr.ev).then(id => {
      if (this.tr !== tr) return; this.me = id;
      // the host answers the hello with welcome (or full/old); give up if it never does
      this.welcomeT = setTimeout(() => { if (!this.inRoom && this.tr === tr) { this.stop(); this.status(errText('noroom', local), true); } }, this.o.welcome);
    }).catch(e => { if (this.tr !== tr) return; this.joining = false; this.tr = null; this.status(errText(e.message, local), true); this.emit('change'); });
  }
  // back to driving alone at once (no goodbye)
  stop() {
    clearTimeout(this.welcomeT); const tr = this.tr; this.tr = null; if (tr) { this.leaving = true; tr.stop(); }
    this.inRoom = false; this.joining = false; this.host = false; this.hostLink = null; this.links.clear(); this.retry = 0; this.dropAll();
  }
  dropAll() { for (const p of [...this.players.values()]) { this.players.delete(p.id); this.emit('leave', p, null); } this.emit('change'); }
  // say goodbye, then stop (a host leaving ends the room for everyone)
  leave(msg) {
    if (!this.inRoom && !this.joining) return;
    this.leaving = true; this.send({ t: 'bye' }); const tr = this.tr;
    setTimeout(() => { if (this.tr === tr) this.stop(); else if (tr) tr.stop(); }, 60);   // time for the goodbye to go out
    this.inRoom = false; this.joining = false; if (msg) this.emit('toast', msg); this.dropAll();
  }
  // the page is going away: goodbye and stop now
  bye() { if (!this.inRoom) return; this.leaving = true; this.send({ t: 'bye' }); this.stop(); }

  send(m) { if (!this.tr) return; m.f = this.me; if (this.host) { for (const L of this.links.values()) if (this.players.has(L.id)) L.send(m); } else if (this.hostLink) this.hostLink.send(m); }
  relay(from, m) { for (const L of this.links.values()) if (L.id !== from && this.players.has(L.id)) L.send(m); }
  setInfo(info) { this.send({ t: 'info', info }); }
  list() { const L = [{ id: this.me, name: this.name, slot: this.slot, info: this.o.info() }]; for (const p of this.players.values()) L.push({ id: p.id, name: p.name, slot: p.slot, info: p.info }); return L; }
  sendRoster(except) { const m = { t: 'roster', f: this.me, list: this.list() }; for (const L of this.links.values()) if (L.id !== except && this.players.has(L.id)) L.send(m); }

  onLink(L) {
    if (this.host) { this.links.set(L.id, L); return; }
    this.hostLink = L; L.send({ t: 'hello', f: this.me, v: NET_VER, name: this.name, info: this.o.info() });
  }
  onClose(L) {
    if (this.host) { this.links.delete(L.id); const p = this.players.get(L.id); if (p) { this.remove(p, 'left'); this.sendRoster(); } return; }
    if (L !== this.hostLink || this.leaving) return; this.hostLink = null;
    if (!this.inRoom) { this.stop(); this.status(errText('noroom', this.local), true); return; }
    // lost the host: try to get back in a few times before giving up
    this.retry = 0; this.status('Mistet kontakten med verten, prøver igjen …', true); this.emit('toast', this.text, true); this.reconnect();
  }
  reconnect() {
    const tr = this.tr; if (!tr || this.hostLink || this.leaving) return; this.retry++;
    tr.again(tr.ev).then(() => { this.retry = 0; }).catch(() => {
      if (this.tr !== tr) return;
      if (this.retry < this.o.retries) setTimeout(() => this.reconnect(), this.o.retry);
      else { this.stop(); this.emit('closed', 'lost'); this.emit('toast', 'Rommet er borte. Du kjører alene nå.', true); }
    });
  }
  onData(L, m) {
    if (this.leaving || !m || typeof m !== 'object' || typeof m.t !== 'string') return;
    if (this.host) {
      m.f = L.id;   // a guest cannot speak for anyone else
      if (m.t === 'hello') { this.hello(L, m); return; }
      const p = this.players.get(L.id); if (!p || CONTROL.has(m.t)) return;
      this.handle(p, m);
      if (m.t !== 'bye') this.relay(L.id, m); else { L.close(); this.links.delete(L.id); this.remove(p, 'left'); this.sendRoster(); }
      return;
    }
    // a guest: everything comes from the host, on behalf of whoever sent it; only the host itself runs the room
    this.hostSeen = this.o.now();
    if (m.f === L.id) {
      if (m.t === 'welcome') {
        clearTimeout(this.welcomeT); const first = !this.inRoom; this.inRoom = true; this.joining = false; this.slot = m.slot | 0; this.roster(m.list, first); this.status('');
        if (first) { this.emit('open'); this.emit('toast', 'Du er med i rom ' + this.code); } this.emit('change'); return;
      }
      if (m.t === 'full' || m.t === 'old') { this.stop(); this.status(errText(m.t), true); return; }
      if (m.t === 'roster') { this.roster(m.list); return; }
      if (m.t === 'bye') { this.stop(); this.emit('closed', 'host'); this.emit('toast', 'Verten avsluttet rommet. Du kjører alene nå.', true); return; }
    } else if (CONTROL.has(m.t)) return;
    const p = this.players.get(m.f); if (p) this.handle(p, m);
  }
  hello(L, m) {
    if (m.v !== NET_VER) { L.send({ t: 'old', f: this.me }); setTimeout(() => L.close(), 200); return; }
    let p = this.players.get(L.id);
    if (!p) {
      const used = new Set([0, ...[...this.players.values()].map(q => q.slot)]); let slot = 1; while (used.has(slot)) slot++;
      if (slot >= NET_MAX) { L.send({ t: 'full', f: this.me }); setTimeout(() => L.close(), 200); return; }
      p = this.add(L.id, cleanName(m.name), slot, this.o.clean(m.info)); this.emit('join', p); this.emit('toast', p.name + ' er med og kjører sammen med deg');
    } else { p.name = cleanName(m.name); p.info = this.o.clean(m.info); this.emit('update', p); }
    p.seen = this.o.now(); L.send({ t: 'welcome', f: this.me, slot: p.slot, list: this.list() }); this.sendRoster(L.id); this.emit('change');
  }
  roster(list, quiet) {
    if (!Array.isArray(list)) return; const keep = new Set();
    for (const e of list.slice(0, NET_MAX)) {
      if (!e || typeof e.id !== 'string' || e.id === this.me) continue; keep.add(e.id);
      const info = this.o.clean(e.info), name = cleanName(e.name), slot = Math.max(0, Math.min(NET_MAX - 1, e.slot | 0)), p = this.players.get(e.id);
      if (!p) { this.emit('join', this.add(e.id, name, slot, info)); if (!quiet) this.emit('toast', name + ' er med i rommet'); }
      else { const ch = JSON.stringify(p.info) !== JSON.stringify(info) || p.slot !== slot || p.name !== name; p.name = name; p.slot = slot; p.info = info; if (ch) this.emit('update', p); }
    }
    for (const p of [...this.players.values()]) if (!keep.has(p.id)) this.remove(p, 'left');
    this.emit('change');
  }
  add(id, name, slot, info) { const p = { id, name, slot, info, seen: this.o.now() }; this.players.set(id, p); return p; }
  remove(p, why) {
    if (!this.players.delete(p.id)) return; this.emit('leave', p, why);
    if (why && this.inRoom) this.emit('toast', p.name + (why === 'lost' ? ' mistet forbindelsen' : ' forlot rommet')); this.emit('change');
  }
  handle(p, m) {
    p.seen = this.o.now();
    if (m.t === 'info') { p.info = this.o.clean(m.info); this.emit('update', p); this.emit('change'); return; }
    if (m.t !== 'ping' && m.t !== 'bye') this.emit('msg', p, m);
  }
  // every frame or so: drop players that went silent (host), notice a host that went silent (guest)
  tick() {
    if (!this.inRoom) return; const now = this.o.now();
    if (this.host) {
      for (const p of [...this.players.values()]) if (now - p.seen > this.o.stale) { const L = this.links.get(p.id); if (L) { L.close(); this.links.delete(p.id); } this.remove(p, 'lost'); this.sendRoster(); }
    } else if (this.hostLink && this.hostSeen && now - this.hostSeen > this.o.stale) { const L = this.hostLink; L.close(); this.onClose(L); }
  }
}
