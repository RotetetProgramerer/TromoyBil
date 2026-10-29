# Measures the WAV files from tools/audio-render.mjs: that the engine's fundamental follows the firing frequency
# (rpm / 60 × cylinders / 2), levels and clipping, that the voices differ, that the inside mix is muffled, that the limiter and
# ABS pulse, that the sound follows the real physics, and that the surfaces and the world are heard.
# Also draws spectrograms (PNG, firing frequency in red) of the sweeps and the physics runs into the same folder.
#   python3 tools/audio-analyze.py <folder>
import json, sys, wave, os
import numpy as np

D = sys.argv[1] if len(sys.argv) > 1 else 'audio-out'
M = json.load(open(os.path.join(D, 'manifest.json')))

def load(f):
    with wave.open(os.path.join(D, f)) as w:
        sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, 2) / 32768.0
    return sr, x
def cut(x, sr, t0, t1): return x[int(t0 * sr):int(t1 * sr)]
def db(v): return 20 * np.log10(max(v, 1e-9))
def rms(x): return float(np.sqrt(np.mean(x ** 2)))
def spec(m, sr, pad=1 << 18):
    w = np.hanning(len(m)); X = np.abs(np.fft.rfft(m * w, pad)); return np.fft.rfftfreq(pad, 1 / sr), X
def at(F, X, f, bw=1.5):   # strongest bin within ±bw Hz
    i0, i1 = np.searchsorted(F, f - bw), np.searchsorted(F, f + bw) + 1
    return X[i0:i1].max() if i1 > i0 else 0.0
def comb(F, X, lo, hi, K=8, n=1500):   # the f0 whose first K harmonics hold the most energy
    best, bf = -1, lo
    for f0 in np.linspace(lo, hi, n):
        s = sum(at(F, X, k * f0, max(1.0, f0 * 0.01)) for k in range(1, K + 1) if k * f0 < 2000)
        if s > best: best, bf = s, f0
    return bf
def centroid(F, X, lo=20, hi=12000):
    s = (F >= lo) & (F <= hi); P = X[s] ** 2; return float((F[s] * P).sum() / P.sum())
def bands(F, X):   # third-octave levels relative to the total, 31.5 Hz – 8 kHz
    c = 31.5 * 2 ** (np.arange(25) / 3); P = X ** 2
    L = np.array([P[(F >= f / 2 ** (1 / 6)) & (F < f * 2 ** (1 / 6))].sum() for f in c])
    return 10 * np.log10(L / L.sum() + 1e-12)
def envmod(m, sr, lo=6, hi=30):   # the strongest amplitude modulation between lo and hi Hz, and its depth (std/mean of the envelope)
    fr = int(sr * 0.004); e = np.sqrt(np.mean(m[:len(m) // fr * fr].reshape(-1, fr) ** 2, axis=1)); er = sr / fr
    E = np.abs(np.fft.rfft((e - e.mean()) * np.hanning(len(e)), 1 << 14)); Fe = np.fft.rfftfreq(1 << 14, 1 / er)
    s = (Fe >= lo) & (Fe <= hi); i = np.argmax(E[s]); return float(Fe[s][i]), float(e.std() / (e.mean() + 1e-12))
def kurt(v): return float(np.mean(v ** 4) / np.mean(v ** 2) ** 2)
def spectrogram(f, sr, x, segs, fmax=3000, track=None):
    try: from PIL import Image, ImageDraw
    except ImportError: return
    m = x.mean(1); N, H = 4096, 512; w = np.hanning(N)
    fr = np.array([np.abs(np.fft.rfft(m[i:i + N] * w)) for i in range(0, len(m) - N, H)])
    k = int(fmax / (sr / N)); S = 20 * np.log10(fr[:, :k].T + 1e-6); S = np.clip((S - (S.max() - 70)) / 70, 0, 1)
    img = Image.fromarray((np.flipud(S) * 255).astype(np.uint8)).resize((1000, 400)).convert('RGB'); d = ImageDraw.Draw(img)
    T = len(m) / sr
    if track:   # firing frequency from the physics' revs
        cyl, tr = track
        d.line([(t / T * 1000, 400 - rpm / 60 * cyl / 2 / fmax * 400) for t, rpm, *_ in tr], fill=(255, 60, 40), width=1)
    for s in segs:
        if 'rpm0' in s:   # expected firing frequency during the run up
            pts = []
            for t in np.linspace(s['t0'], s['t1'], 60):
                f0 = s['f0'] + (s['f1'] - s['f0']) * ((t - s['t0']) / (s['t1'] - s['t0'])) ** s['pow']
                pts.append((t / T * 1000, 400 - f0 / fmax * 400))
            d.line(pts, fill=(255, 60, 40), width=1)
    img.save(os.path.join(D, f.replace('.wav', '.png')))

print('ENGINE, held revs (outside unless the file says inside). f_fire = rpm/60 × cyl/2.')
print('  comb f0: the fundamental that best explains the first 8 partials, searched in 0.6–1.6 × f_fire; peak: strongest line 15–1500 Hz')
print('  fire%: share of the energy in the cycle orders (rpm/120 · k, below 1500 Hz) that sits on firing orders; centroid: spectral centroid')
print(f"{'file':30} {'segment':20} {'f_fire':>7} {'comb f0':>8} {'error':>6} {'peak Hz':>8} {'order':>6} {'fire%':>6} {'RMS dB':>7} {'peak dB':>7} {'centroid':>8}")
voice = {}
for r in M:
    if r['name'] != 'steady': continue
    sr, x = load(r['file'])
    for i, s in enumerate(r['segs']):
        seg = cut(x, sr, s['t0'] + 0.45, s['t1'] - 0.1); m = seg.mean(1); F, X = spec(m, sr)
        f = s['f']; f0 = comb(F, X, 0.6 * f, 1.6 * f); band = (F > 15) & (F < 1500); fp = F[band][np.argmax(X[band])]
        fc = f / r['cyl']; ks = [k for k in range(1, 400) if k * fc < 1500]                   # cycle orders
        P = {k: at(F, X, k * fc, min(1.5, fc * 0.3)) ** 2 for k in ks}; fire = sum(v for k, v in P.items() if k % r['cyl'] == 0) / sum(P.values())
        Fw, Xw = spec(m, sr, 1 << 16)
        print(f"{r['file']:30} {s.get('en', s['label']):20} {f:7.1f} {f0:8.1f} {100 * (f0 / f - 1):+5.1f}% {fp:8.1f} {fp / f:6.2f} {100 * fire:5.0f}% {db(rms(seg)):7.1f} {db(np.abs(seg).max()):7.1f} {centroid(Fw, Xw):8.0f}")
        if i == 2: voice[(r['id'], r['inside'], r['fallback'])] = (bands(Fw, Xw), db(rms(seg)), centroid(Fw, Xw))
print()
print('PEAKS over whole files (1.0 = 0 dBFS):')
for r in M: print(f"  {r['file']:32} peak {r['peak']:.3f} ({db(r['peak']):5.1f} dBFS)  clipped samples {r['over']}  {'AudioWorklet' if r['worklet'] else 'node graph'}")
print()
ids = [k[0] for k in voice if not k[1] and not k[2]]
print('VOICES DIFFER: RMS distance (dB) between third-octave spectra at 60 % revs, full load, outside:')
print(' ' * 10 + ''.join(f'{i:>9}' for i in ids))
for a in ids: print(f'{a:10}' + ''.join(f"{np.sqrt(np.mean((voice[(a, 0, False)][0] - voice[(b, 0, False)][0]) ** 2)):9.1f}" for b in ids))
print()
print('OUTSIDE vs INSIDE (60 % revs, full load): centroid and level')
for a in ids:
    if (a, 1, False) in voice:
        o, i = voice[(a, 0, False)], voice[(a, 1, False)]
        print(f'  {a:10} centroid outside {o[2]:6.0f} Hz  inside {i[2]:6.0f} Hz   RMS outside {o[1]:6.1f} dB  inside {i[1]:6.1f} dB')
print()
print('SWEEP: fundamental vs. revs (0.25 s windows through the full-throttle run), limiter pulse, pulling vs. overrun (kurtosis: crackle)')
for r in M:
    if r['name'] != 'sweep': continue
    sr, x = load(r['file']); spectrogram(r['file'], sr, x, r['segs']); m = x.mean(1); seg = {q.get('key'): q for q in r['segs']}
    s = seg['run']; errs = []
    for t in np.arange(s['t0'] + 0.3, s['t1'] - 0.25, 0.25):
        f = s['f0'] + (s['f1'] - s['f0']) * ((t + 0.125 - s['t0']) / (s['t1'] - s['t0'])) ** s['pow']
        F, X = spec(cut(m, sr, t, t + 0.25), sr, 1 << 16); errs.append(comb(F, X, 0.75 * f, 1.33 * f, n=600) / f - 1)
    errs = np.abs(errs) * 100
    lf, ld = envmod(cut(m, sr, seg['limiter']['t0'] + 0.2, seg['limiter']['t1']), sr)
    pull = cut(m, sr, 4.0, 5.0); ov = cut(m, sr, seg['lift']['t0'] + 0.3, seg['lift']['t0'] + 1.5)
    print(f"  {r['file']:30} error median {np.median(errs):4.1f} % max {errs.max():4.1f} %  limiter pulse {lf:4.1f} Hz depth {ld:4.2f}  "
          f"pulling {db(rms(pull)):6.1f} dB, overrun {db(rms(ov)):6.1f} dB (kurtosis {kurt(ov):4.1f} vs {kurt(pull):4.1f})  events {r.get('events')}")
print()
print('REAL PHYSICS (Vehicle on flat tarmac, pedals ramped like game.js): fundamental vs. the physics rpm, 0.2 s windows of steady revs')
print('  under full throttle (after the lift the quiet overrun drowns in wind and tyre noise at 130–220 km/h, as it does in a real car)')
for r in M:
    if r['name'] != 'drive': continue
    sr, x = load(r['file']); m = x.mean(1); tr = r['track']; spectrogram(r['file'], sr, x, r['segs'], track=(r['cyl'], tr))
    T = np.array([q[0] for q in tr]); R = np.array([q[1] for q in tr]); S = np.array([q[3] for q in tr]); G = [q[2] for q in tr]
    errs = []
    for t in np.arange(0.3, r['segs'][0]['t1'] - 0.25, 0.2):
        w = (T >= t) & (T < t + 0.2)
        if not w.any() or S[w].any() or np.ptp(R[w]) > 0.04 * R[w].mean() or R[w].mean() < 900: continue
        f = R[w].mean() / 60 * r['cyl'] / 2; F, X = spec(cut(m, sr, t + 0.02, t + 0.22), sr, 1 << 16)
        errs.append(comb(F, X, 0.75 * f, 1.33 * f, n=600) / f - 1)
    e = np.abs(errs) * 100; shifts = sum(1 for i in range(1, len(G)) if G[i] != G[i - 1])
    print(f"  {r['file']:22} {len(e)} windows: error median {np.median(e):4.1f} %, 90 % below {np.percentile(e, 90):4.1f} %;  rpm {R.min()}–{R.max()},"
          f" {shifts} gear changes, ABS on {100 * np.mean([q[4] for q in tr if q[0] > 9.5]):.0f} % of the stop, peak {r['peak']:.2f}, events {r.get('events')}")
print()
for r in M:
    if r['name'] not in ('road', 'ambient', 'events'): continue
    sr, x = load(r['file'])
    print(f"{r['file']}: segment, RMS, peak, centroid{', tone (peak/median 600–2000 Hz)' if r['name'] == 'road' else ''}   events {r.get('events')}")
    for s in r['segs']:
        seg = cut(x, sr, s['t0'] + (0 if r['name'] == 'events' else 0.2), s['t1'] - 0.05); m = seg.mean(1); F, X = spec(m, sr, 1 << 16); extra = ''
        if r['name'] == 'road':
            b = (F > 600) & (F < 2000); extra = f"  tone {db(X[b].max() / np.median(X[b])):5.1f} dB"
            if 'abs' in s['label']: extra += '  pulse %.1f Hz' % envmod(m, sr, 8, 25)[0]
        print(f"  {s.get('en', s['label']):22} {db(rms(seg)):6.1f} dB  {db(np.abs(seg).max()):6.1f} dB  {centroid(F, X):6.0f} Hz{extra}")
    print()
