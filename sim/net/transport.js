// How the browsers in a room reach each other. Both transports open a room as host or join one, and hand the room links
// {id, open, send(m), close()} through ev = {link(L), data(L, m), close(L)}:
//   start(code, asHost, ev) → Promise(my id)    again(ev) → Promise (a guest that lost the host tries a new link)    stop()
// Failures reject with Error('taken' | 'noroom' | 'net' | 'lib' | 'browser') (texts in room.js).
//   peerTransport()   WebRTC straight between the browsers through PeerJS, loaded on first use. The free public PeerJS broker
//                     finds the host by the room code.
//   localTransport()  BroadcastChannel between tabs of the same browser, no network. For testing on one machine (also runs
//                     in Node, see tools/test-net.mjs).
const PEER_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
const peerId = code => 'tromoybil-sim-v1-' + code.toLowerCase();

function loadPeerJS() {
  if (globalThis.Peer) return Promise.resolve();
  return new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = PEER_URL; s.async = true;
    s.onload = () => globalThis.Peer ? ok() : no(new Error('lib')); s.onerror = () => no(new Error('lib')); document.head.appendChild(s);
  });
}

export function peerTransport() {
  const T = { peer: null, code: '' };
  function wire(c, ev, onOpen) {
    const L = { id: c.peer, open: false, send: m => { if (L.open) try { c.send(m); } catch (e) { } }, close: () => { L.open = false; try { c.close(); } catch (e) { } } };
    c.on('open', () => { L.open = true; ev.link(L); if (onOpen) onOpen(); });
    c.on('data', m => { if (L.open) ev.data(L, m); });
    const gone = () => { if (L.open) { L.open = false; ev.close(L); } }; c.on('close', gone); c.on('error', gone);
  }
  T.start = (code, asHost, ev) => loadPeerJS().then(() => new Promise((ok, no) => {
    T.code = code; let done = false; const fail = w => { if (!done) { done = true; T.stop(); no(new Error(w)); } };
    const p = T.peer = asHost ? new Peer(peerId(code), { debug: 0 }) : new Peer({ debug: 0 });
    const to = setTimeout(() => fail('net'), 15000);
    p.on('open', id => {
      if (asHost) { if (!done) { done = true; clearTimeout(to); ok(id); } }
      else wire(p.connect(peerId(code), { serialization: 'json', reliable: true }), ev, () => { if (!done) { done = true; clearTimeout(to); ok(id); } });
    });
    p.on('connection', c => { if (asHost) wire(c, ev); });
    p.on('error', e => { const ty = e && e.type; if (!done) { clearTimeout(to); fail(ty === 'unavailable-id' ? 'taken' : ty === 'peer-unavailable' ? 'noroom' : ty === 'browser-incompatible' ? 'browser' : 'net'); } });
    // the broker connection can drop while the room still works; get it back so new players can find the host
    p.on('disconnected', () => { if (T.peer === p && !p.destroyed) setTimeout(() => { try { if (T.peer === p && !p.destroyed) p.reconnect(); } catch (e) { } }, 2000); });
  }));
  T.again = ev => new Promise((ok, no) => {
    if (!T.peer || T.peer.destroyed) return no(new Error('net'));
    let done = false; wire(T.peer.connect(peerId(T.code), { serialization: 'json', reliable: true }), ev, () => { done = true; ok(); });
    setTimeout(() => { if (!done) no(new Error('noroom')); }, 6000);
  });
  T.stop = () => { const p = T.peer; T.peer = null; if (p) try { p.destroy(); } catch (e) { } };
  return T;
}

export function localTransport() {
  const T = { ch: null, id: '', hostId: '', links: new Map(), wait: null };
  const mk = to => {
    const L = { id: to, open: true, send: m => { if (L.open && T.ch) T.ch.postMessage({ k: 'd', f: T.id, to, m }); }, close: () => { if (!L.open) return; L.open = false; T.links.delete(to); if (T.ch) T.ch.postMessage({ k: 'x', f: T.id, to }); } };
    T.links.set(to, L); return L;
  };
  T.start = (code, asHost, ev) => new Promise((ok, no) => {
    if (typeof BroadcastChannel === 'undefined') return no(new Error('browser'));
    T.hostId = 'host-' + code; T.id = asHost ? T.hostId : 'tab-' + Math.random().toString(36).slice(2, 9); let done = false;
    const ch = T.ch = new BroadcastChannel('tromoybil-local-' + code);
    ch.onmessage = e => {
      const d = e.data; if (!d) return;
      if (d.k === 'who') { if (asHost && done) ch.postMessage({ k: 'here', f: T.id, to: d.f }); return; }   // someone else wants to host this code
      if (d.to !== T.id) return;
      if (d.k === 'here') { if (!done) { done = true; T.stop(); no(new Error('taken')); } return; }
      if (d.k === 'open' && asHost) { const had = T.links.get(d.f); ch.postMessage({ k: 'ack', f: T.id, to: d.f }); if (!had) ev.link(mk(d.f)); return; }
      if (d.k === 'ack' && !asHost) { if (!T.links.has(d.f)) { ev.link(mk(d.f)); if (T.wait) { const w = T.wait; T.wait = null; w(); } } return; }
      const L = T.links.get(d.f); if (!L) return;
      if (d.k === 'd') ev.data(L, d.m); else if (d.k === 'x') { L.open = false; T.links.delete(d.f); ev.close(L); }
    };
    if (asHost) { ch.postMessage({ k: 'who', f: T.id }); setTimeout(() => { if (!done) { done = true; ok(T.id); } }, 300); }
    else {
      T.wait = () => { if (!done) { done = true; ok(T.id); } }; ch.postMessage({ k: 'open', f: T.id, to: T.hostId });
      setTimeout(() => { if (!done) { done = true; T.wait = null; T.stop(); no(new Error('noroom')); } }, 2500);
    }
  });
  T.again = () => new Promise((ok, no) => {
    if (!T.ch) return no(new Error('net'));
    T.wait = ok; T.ch.postMessage({ k: 'open', f: T.id, to: T.hostId });
    setTimeout(() => { if (T.wait === ok) { T.wait = null; no(new Error('noroom')); } }, 2500);
  });
  T.stop = () => { for (const L of [...T.links.values()]) L.close(); if (T.ch) { T.ch.close(); T.ch = null; } };
  return T;
}
