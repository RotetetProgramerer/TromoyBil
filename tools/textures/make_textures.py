"""Lager sømløse PBR-teksturer for terrenget, veiene, husene og trærne (ingen teksturfiler fra nett: alt er regnet ut her).
Hver tekstur blir to JPEG-filer i assets/tex/: <navn>_a.jpg (farge, sRGB) og <navn>_n.jpg (normal i R og G, ruhet i B).
Bruk: python3 tools/textures/make_textures.py [størrelse=1024]
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree

S = int(sys.argv[1]) if len(sys.argv) > 1 else 1024
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'tex')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)
yy, xx = np.mgrid[0:S, 0:S] / S

def spectral(beta=2.0, lo=2, hi=None, seed=None, aniso=None):
    """tileable noise with a power spectrum ~ 1/f^beta between frequencies lo..hi (cycles per tile); aniso=(angle, stretch)"""
    r = np.random.default_rng(seed) if seed is not None else rng
    f = np.fft.fftfreq(S) * S
    fx, fy = np.meshgrid(f, f)
    if aniso:
        a, k = aniso; c, s = np.cos(a), np.sin(a); u = fx * c + fy * s; v = -fx * s + fy * c; fr = np.sqrt(u * u + (v * k) ** 2)
    else: fr = np.sqrt(fx * fx + fy * fy)
    hi = hi or S / 2
    amp = np.where((fr >= lo) & (fr <= hi), 1.0 / np.maximum(fr, 1) ** (beta / 2), 0)
    ph = np.exp(2j * np.pi * r.random((S, S)))
    n = np.real(np.fft.ifft2(amp * ph))
    n -= n.mean(); n /= (n.std() + 1e-9)
    return n
def norm01(a): a = a - a.min(); return a / (a.max() + 1e-9)
def voronoi(n, seed=1, jitter=1.0):
    """tileable Voronoi: distance to nearest and second nearest site, and the site id"""
    r = np.random.default_rng(seed)
    pts = r.random((n, 2))
    tiles = np.concatenate([pts + [dx, dy] for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
    ids = np.tile(np.arange(n), 9)
    tree = cKDTree(tiles)
    q = np.stack([xx.ravel(), yy.ravel()], 1)
    d, i = tree.query(q, k=2)
    return d[:, 0].reshape(S, S), d[:, 1].reshape(S, S), ids[i[:, 0]].reshape(S, S)
def blend(c1, c2, t): t = np.clip(t, 0, 1)[..., None]; return np.asarray(c1) * (1 - t) + np.asarray(c2) * t
def srgb(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255
def normals(height, strength):
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5 * strength
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5 * strength
    n = np.stack([-gx, -gy, np.ones_like(gx)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n
def save(name, albedo, height, strength, rough):
    a = np.clip(albedo, 0, 1)
    n = normals(height, strength)
    nr = np.stack([n[..., 0] * 0.5 + 0.5, n[..., 1] * 0.5 + 0.5, np.broadcast_to(np.clip(rough, 0, 1), (S, S))], -1)
    Image.fromarray((a * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name + '_a.jpg'), quality=90)
    Image.fromarray((nr * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name + '_n.jpg'), quality=93)
    print(name)

# --------------------------------------------------------------------- grass
def grass(name='grass', base=('#3d5a22', '#6f8a35'), dry=('#8a8440', '#a99a55'), seed=1):
    blades = spectral(1.0, 60, None, seed, aniso=(0.3, 0.35)) * 0.6 + spectral(1.2, 30, 200, seed + 1) * 0.4
    big = spectral(2.6, 1, 12, seed + 2); mid = spectral(2.0, 6, 40, seed + 3)
    col = blend(srgb(base[0]), srgb(base[1]), norm01(blades) * 0.7 + norm01(mid) * 0.3)
    col = blend(col, blend(srgb(dry[0]), srgb(dry[1]), norm01(blades)), np.clip(big * 0.5 - 0.2, 0, 0.6))
    # clover and small flowers
    fl = (spectral(0.6, 150, None, seed + 4) > 2.6)
    col[fl] = col[fl] * 0.4 + np.array([0.85, 0.85, 0.75]) * 0.6
    col *= (0.82 + 0.18 * norm01(blades))[..., None]
    h = norm01(blades) * 0.8 + norm01(mid) * 0.2
    save(name, col, h, 2.5, 0.88 + 0.08 * norm01(mid))
# --------------------------------------------------------------------- forest floor: needles, moss, twigs
def forest():
    soil = spectral(2.0, 4, 80, 21)
    moss = spectral(2.4, 2, 20, 22)
    col = blend(srgb('#3b2c1d'), srgb('#5a4228'), norm01(soil))
    # needles: many short thin streaks in random directions
    nd = np.zeros((S, S))
    r = np.random.default_rng(23)
    for _ in range(int(S * S / 90)):
        x, y = r.random(2) * S; a = r.random() * np.pi; L = r.random() * S * 0.018 + S * 0.006
        t = np.linspace(0, 1, int(L) + 2); px = (x + np.cos(a) * L * t).astype(int) % S; py = (y + np.sin(a) * L * t).astype(int) % S
        nd[py, px] = 0.6 + r.random() * 0.4
    nd = np.maximum(nd, ndimage.grey_dilation(nd, size=(2, 2)) * 0.7)
    needle_col = blend(srgb('#8a5a2e'), srgb('#b07a3e'), spectral(1, 40, None, 24) * 0.3 + 0.5)
    col = blend(col, needle_col, nd * 0.9)
    mm = np.clip(moss * 0.8 - 0.1, 0, 1)
    moss_col = blend(srgb('#3d5a1f'), srgb('#6b8a2e'), norm01(spectral(1.5, 30, None, 25)))
    col = blend(col, moss_col * 0.8, mm * 0.75)
    # a few twigs and cones
    tw = (spectral(0.8, 90, None, 26) > 2.9)
    col[tw] = srgb('#2a1c12')
    h = norm01(soil) * 0.3 + nd * 0.5 + mm * 0.5
    save('forest', col * 0.95, h, 3.0, 0.92 - 0.1 * mm)
# --------------------------------------------------------------------- granite (svaberg) with lichen and cracks
def rock(name='rock', tint=('#6e6a65', '#938c85'), lichen=True, seed=31):
    big = spectral(2.2, 1, 16, seed); mid = spectral(1.8, 8, 120, seed + 1); grain = spectral(0.5, 120, None, seed + 2)
    col = blend(srgb(tint[0]), srgb(tint[1]), norm01(big) * 0.6 + norm01(mid) * 0.4)
    feld = grain > 1.2; col[feld] = col[feld] * 0.6 + srgb('#c99a8a') * 0.4         # pink feldspar
    quartz = grain < -1.6; col[quartz] = col[quartz] * 0.5 + srgb('#e8e4de') * 0.5
    mica = spectral(0.4, 150, None, seed + 3) > 2.3; col[mica] = srgb('#2b2a28')
    d1, d2, _ = voronoi(18, seed + 4)
    crack = np.exp(-((d2 - d1) * S / 2.2) ** 2)
    col *= (1 - 0.55 * crack)[..., None]
    if lichen:
        li = np.clip(spectral(2.0, 3, 50, seed + 5) - 0.6, 0, 1)
        lc = blend(srgb('#8f8a5e'), srgb('#b8b49e'), norm01(spectral(1, 40, None, seed + 6)))
        col = blend(col, lc, li * 0.6)
        dark = np.clip(spectral(2.2, 2, 30, seed + 7) - 1.0, 0, 1); col *= (1 - 0.35 * dark)[..., None]
    h = norm01(big) * 0.5 + norm01(mid) * 0.35 + norm01(grain) * 0.08 - crack * 0.4
    save(name, col, h, 5.0, 0.72 + 0.18 * norm01(mid))
# --------------------------------------------------------------------- dirt with pebbles
def dirt(name='dirt', a='#4f3824', b='#7a5a3a', seed=41):
    n1 = spectral(2.0, 2, 60, seed); n2 = spectral(1.2, 40, None, seed + 1)
    col = blend(srgb(a), srgb(b), norm01(n1) * 0.7 + norm01(n2) * 0.3)
    d1, d2, ids = voronoi(260, seed + 2)
    peb = d1 * S < (S / 160) * (0.4 + (ids % 7) / 7)
    pc = blend(srgb('#6d655c'), srgb('#a39a8e'), (ids % 11) / 11)
    col[peb] = pc[peb] * (0.8 + 0.2 * norm01(n2)[peb])[..., None]
    h = norm01(n1) * 0.4 + norm01(n2) * 0.2 + peb * (0.5 - d1 * S / (S / 80))
    save(name, col, h, 3.5, 0.9 - peb * 0.12)
# --------------------------------------------------------------------- gravel
def gravel():
    d1, d2, ids = voronoi(1800, 51)
    shade = (ids * 7919 % 101) / 101
    stone = blend(srgb('#6a645c'), srgb('#b0a89b'), shade)
    edge = np.clip((d2 - d1) * S / 3.0, 0, 1)
    dust = spectral(2, 2, 30, 52)
    col = blend(srgb('#5a5249'), stone, edge) * (0.9 + 0.1 * norm01(dust))[..., None]
    col = blend(col, srgb('#8a7e6c'), np.clip(dust * 0.4, 0, 0.5))
    h = np.sqrt(np.clip(edge, 0, 1)) * 0.8 + norm01(dust) * 0.2
    save('gravel', col, h, 6.0, 0.82)
# --------------------------------------------------------------------- sand with ripples
def sand(name='sand', a='#c2a576', b='#e0c896', seed=61):
    rip = np.sin((xx * 0.8 + yy * 0.25 + spectral(2.5, 1, 6, seed) * 0.03) * np.pi * 2 * 14)
    fine = spectral(0.4, 200, None, seed + 1); big = spectral(2.3, 1, 10, seed + 2)
    col = blend(srgb(a), srgb(b), norm01(big) * 0.6 + norm01(fine) * 0.25 + rip * 0.06 + 0.1)
    dark = spectral(0.3, 250, None, seed + 3) > 2.4; col[dark] = col[dark] * 0.55
    h = rip * 0.2 + norm01(fine) * 0.1 + norm01(big) * 0.3
    save(name, col, h, 2.0, 0.92)
# --------------------------------------------------------------------- snow
def snow():
    big = spectral(2.6, 1, 12, 71); mid = spectral(2, 6, 60, 72); sp = spectral(0.2, 300, None, 73)
    col = blend(srgb('#d8e2ec'), srgb('#f8fbff'), norm01(big) * 0.5 + norm01(mid) * 0.5)
    h = norm01(big) * 0.6 + norm01(mid) * 0.4
    rough = 0.55 + 0.25 * norm01(mid) - (sp > 2.8) * 0.4
    save('snow', col, h, 1.5, rough)
# --------------------------------------------------------------------- ploughed field / stubble
def field():
    fur = np.sin((yy + spectral(2.5, 1, 4, 81) * 0.01) * np.pi * 2 * 22) * 0.5 + 0.5
    clod = spectral(1.2, 30, None, 82); big = spectral(2.2, 1, 10, 83)
    col = blend(srgb('#3e2c1e'), srgb('#6b4e33'), fur * 0.5 + norm01(clod) * 0.35 + norm01(big) * 0.15)
    stub = (spectral(0.5, 160, None, 84, aniso=(1.57, 0.2)) > 1.6) & (fur > 0.5)
    col[stub] = col[stub] * 0.4 + srgb('#b8a066') * 0.6
    h = fur * 0.6 + norm01(clod) * 0.3
    save('field', col, h, 4.0, 0.95)
# --------------------------------------------------------------------- mud (wet, glossy puddles)
def mud():
    n1 = spectral(2.0, 2, 50, 91); n2 = spectral(1.0, 40, None, 92)
    col = blend(srgb('#2a1f15'), srgb('#4e3a28'), norm01(n1) * 0.7 + norm01(n2) * 0.3)
    wet = np.clip(-n1 * 0.9 - 0.2, 0, 1)
    col *= (1 - 0.35 * wet)[..., None]
    h = norm01(n1) * 0.5 + norm01(n2) * 0.2
    save('mud', col, h, 3.0, 0.65 - 0.45 * wet)
# --------------------------------------------------------------------- asphalt
def asphalt():
    agg = spectral(0.3, 200, None, 101); big = spectral(2.4, 1, 10, 102); mid = spectral(1.8, 10, 80, 103)
    col = blend(srgb('#3a3a39'), srgb('#5b5a57'), norm01(agg) * 0.5 + norm01(big) * 0.3 + norm01(mid) * 0.2)
    light = agg > 2.0; col[light] = col[light] * 0.6 + srgb('#9a978f') * 0.4
    d1, d2, _ = voronoi(9, 104)
    crack = np.exp(-((d2 - d1) * S / 1.2) ** 2) * (spectral(2, 2, 20, 105) > 0.4)
    col *= (1 - 0.5 * crack)[..., None]
    patch = np.clip(spectral(2.5, 1, 8, 106) - 1.6, 0, 1) > 0; col[patch] *= 0.94
    h = norm01(agg) * 0.5 + norm01(mid) * 0.2 - crack * 0.5
    save('asphalt', col, h, 3.0, 0.78 + 0.1 * norm01(agg))
# --------------------------------------------------------------------- ash / lava rock
def ash():
    n1 = spectral(1.8, 3, 90, 111); n2 = spectral(0.6, 100, None, 112)
    col = blend(srgb('#1d1a18'), srgb('#4a423c'), norm01(n1) * 0.6 + norm01(n2) * 0.4)
    pores = n2 < -1.8; col[pores] *= 0.4
    save('ash', col, norm01(n1) * 0.6 + norm01(n2) * 0.3 - pores * 0.3, 4.0, 0.9)
# --------------------------------------------------------------------- building materials
def boards(name, plank=0.11):
    """painted wooden cladding (vertical boards), white: the colour comes from the building"""
    u = xx * (1 / plank); edge = np.abs(u - np.round(u))
    gap = np.exp(-(edge * plank * S / 1.5) ** 2)
    grain = spectral(1.0, 30, None, 121, aniso=(0.0, 6.0))
    col = np.ones((S, S, 3)) * (0.93 + 0.05 * norm01(grain))[..., None]
    col *= (1 - 0.45 * gap)[..., None]
    dirt = np.clip(spectral(2.4, 1, 10, 122), 0, 1); col *= (1 - 0.08 * dirt)[..., None]
    save(name, col, norm01(grain) * 0.1 - gap * 0.6, 4.0, 0.7)
def rooftiles():
    v = yy * 16; row = np.floor(v); off = (row % 2) * 0.5
    u = xx * 12 + off; fu = u - np.floor(u); fv = v - row
    tile = np.sin(np.pi * fu) * 0.6 + (1 - fv) * 0.4
    shade = (np.floor(u) * 13 + row * 7) % 9 / 9
    col = blend(srgb('#2b2a2a'), srgb('#3d3b39'), shade * 0.6 + tile * 0.3)
    moss = np.clip(spectral(2.2, 2, 20, 131) - 0.8, 0, 1) * (fv > 0.6)
    col = blend(col, srgb('#4b5a2a'), moss * 0.5)
    save('roof', col, tile * 0.6 - (fv < 0.06) * 0.5, 5.0, 0.6)
def plaster():
    n = spectral(1.2, 20, None, 141); big = spectral(2.4, 1, 10, 142)
    col = np.ones((S, S, 3)) * (0.88 + 0.06 * norm01(n) + 0.05 * norm01(big))[..., None]
    save('plaster', col, norm01(n) * 0.3, 2.0, 0.9)
def stone():
    d1, d2, ids = voronoi(70, 151)
    edge = np.clip((d2 - d1) * S / 5, 0, 1)
    col = blend(srgb('#4c4a46'), blend(srgb('#7a766f'), srgb('#a29d94'), (ids % 13) / 13), edge)
    save('stone', col, np.sqrt(edge) * 0.8 + spectral(1, 40, None, 152) * 0.05, 5.0, 0.85)
# --------------------------------------------------------------------- bark and leaves (for the trees)
def bark(name, base, dark, seed, stretch=5.0, plates=False):
    n = spectral(1.4, 6, None, seed, aniso=(0.0, stretch)); big = spectral(2, 2, 20, seed + 1)
    col = blend(srgb(dark), srgb(base), norm01(n) * 0.8 + norm01(big) * 0.2)
    h = norm01(n)
    if plates:
        d1, d2, _ = voronoi(60, seed + 2); e = np.clip((d2 - d1) * S / 4, 0, 1); col *= (0.55 + 0.45 * e)[..., None]; h = h * 0.4 + e * 0.6
    save(name, col, h, 5.0, 0.92)
def birchbark():
    n = spectral(1.2, 8, None, 171, aniso=(1.57, 6)); lent = spectral(0.8, 30, None, 172, aniso=(1.57, 12)) > 1.8
    col = blend(srgb('#d9d4c8'), srgb('#f2efe6'), norm01(n)); col[lent] = srgb('#2a2622')
    save('bark_birch', col, norm01(n) * 0.3 - lent * 0.3, 3.0, 0.7)

if __name__ == '__main__':
    grass(); forest(); rock(); dirt(); gravel(); sand(); snow(); field(); mud(); asphalt(); ash()
    grass('drygrass', base=('#8a7a3a', '#c2a85a'), dry=('#a08a4a', '#d2bc78'), seed=201)
    dirt('redearth', a='#6b3420', b='#9a5a32', seed=211)
    sand('blacksand', a='#2a2624', b='#4a4440', seed=221)
    boards('boards'); rooftiles(); plaster(); stone()
    bark('bark_pine', '#8a5a3a', '#3a2418', 161, plates=True); bark('bark_spruce', '#5a4a3a', '#2a221a', 162, stretch=3)
    bark('bark_oak', '#5e5548', '#2a2620', 163, stretch=4); birchbark()
