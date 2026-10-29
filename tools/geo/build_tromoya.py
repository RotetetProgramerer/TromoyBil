"""Bygger den ekte Tromøya for bilsimulatoren fra åpne data:
  høyder   AWS Terrain Tiles (i Norge: Kartverkets terrengmodell, CC BY 4.0), se tools/geo/dem.py
  kart     Overture Maps (OpenStreetMap-bidragsytere, ODbL), se tools/geo/overture.py
Skriver world/tromoya/: terrain.bin.gz (høyder hver 5. meter), cover.bin.gz (arealtype hver 5. meter) og features.json.gz
(veier med høydeprofil, bygninger, vann, stedsnavn). Lokale koordinater i meter: x mot øst, z mot sør, origo midt på øya.

Bruk: python3 tools/geo/build_tromoya.py <geo-mappe med tiles/ og ov/> <repo>/world
"""
import sys, os, json, gzip, math, struct
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from pyproj import Transformer
import shapely.wkb as WKB
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import transform as shp_transform

GEO, OUT = sys.argv[1], sys.argv[2]
LON0, LAT0 = 8.8648, 58.4720                 # origo: midt på Tromøya
CELL, HALF = 5.0, 6000.0                      # 12 × 12 km, ett punkt hver 5. meter
N = int(2 * HALF / CELL) + 1
fwd = Transformer.from_crs('EPSG:4326', 'EPSG:25832', always_xy=True)
inv = Transformer.from_crs('EPSG:25832', 'EPSG:4326', always_xy=True)
E0, N0 = fwd.transform(LON0, LAT0)
def to_local(lon, lat):
    e, n = fwd.transform(lon, lat)
    return np.asarray(e) - E0, -(np.asarray(n) - N0)
def geom_local(g):
    return shp_transform(lambda x, y, z=None: tuple(np.array(v) for v in to_local(np.array(x), np.array(y))), g)
# grid index ↔ local metres: column i ↔ x = -HALF + i*CELL, row j ↔ z = -HALF + j*CELL
def px(x): return (np.asarray(x) + HALF) / CELL
os.makedirs(os.path.join(OUT, 'tromoya'), exist_ok=True)

# ---------------------------------------------------------------- heights
def load_dem(z):
    d = np.load(os.path.join(GEO, 'tiles', f'dem_z{z}.npz'))
    h = d['h'].astype(np.float64)
    bad = (h < -500) | (h > 3000)
    if bad.any():                                   # a few broken pixels: fill from the neighbours
        idx = ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True)
        h = h[tuple(idx)]
    return h, int(d['z']), int(d['tx0']), int(d['ty0'])
def sample_dem(dem, lon, lat):
    h, z, tx0, ty0 = dem; n = 2 ** z
    X = (lon + 180) / 360 * n; la = np.radians(lat); Y = (1 - np.log(np.tan(la) + 1 / np.cos(la)) / np.pi) / 2 * n
    pxx = (X - tx0) * 256 - 0.5; pyy = (Y - ty0) * 256 - 0.5
    ok = (pxx >= 1) & (pyy >= 1) & (pxx < h.shape[1] - 2) & (pyy < h.shape[0] - 2)
    v = ndimage.map_coordinates(h, [pyy.ravel(), pxx.ravel()], order=3, mode='nearest').reshape(np.shape(lon))
    return v, ok
gi = np.arange(N) * CELL - HALF
GX, GZ = np.meshgrid(gi, gi)                       # GX[j,i] = x, GZ[j,i] = z
glon, glat = inv.transform(GX + E0, -GZ + N0)
d15, d12 = load_dem(15), load_dem(12)
h15, ok15 = sample_dem(d15, glon, glat)
h12, _ = sample_dem(d12, glon, glat)
H = np.where(ok15, h15, h12)
print('høyder', H.shape, round(H.min(), 1), round(H.max(), 1))

# ---------------------------------------------------------------- map data
def rows(kind):
    for r in json.load(open(os.path.join(GEO, 'ov', kind + '.json'))):
        g = WKB.loads(bytes.fromhex(r['geometry']))
        yield r, g
bbox_ll = box(*inv.transform(E0 - HALF, N0 - HALF), *inv.transform(E0 + HALF, N0 + HALF))
def polys(g):
    if isinstance(g, Polygon): return [g]
    if isinstance(g, MultiPolygon): return list(g.geoms)
    return []
def raster(mask_polys, img_val=1):
    """polygons in local metres → boolean grid (holes respected)"""
    im = Image.new('L', (N, N), 0); dr = ImageDraw.Draw(im)
    for p in mask_polys:
        ext = [(px(x), px(z)) for x, z in p.exterior.coords]
        if len(ext) >= 3: dr.polygon(ext, fill=img_val)
        for hole in p.interiors:
            ii = [(px(x), px(z)) for x, z in hole.coords]
            if len(ii) >= 3: dr.polygon(ii, fill=0)
    return np.asarray(im) > 0

# land: the coast polygons (islands, islets and the mainland)
land_polys, named = [], {}
for r, g in rows('land'):
    if r.get('subtype') == 'land' and g.intersects(bbox_ll):
        for p in polys(g):
            lp = geom_local(p); land_polys.append(lp)
            n = (r.get('names') or {}).get('primary')
            if n and r.get('class') in ('island', 'islet'): named[n] = lp
LAND = raster(land_polys)
# the mainland is usually not a polygon here: what the height data says is clearly land, and not in a polygon, is land too
LAND |= (H > 2.0) & ~ndimage.binary_dilation(LAND, iterations=2) & (np.abs(GX) > 200)
LAND = ndimage.binary_opening(LAND, iterations=1) | raster([p for p in land_polys if p.area > 2000])
tromoya = named.get('Tromøya')
TRO = raster([tromoya]) if tromoya else LAND
print('land', LAND.mean().round(3), 'tromøya km²', round(TRO.sum() * CELL * CELL / 1e6, 2))
# heights at the coast: land at least a little above the sea, the sea bottom slopes away from the shore
dist_sea = ndimage.distance_transform_edt(LAND) * CELL          # metres from the sea (on land)
dist_land = ndimage.distance_transform_edt(~LAND) * CELL        # metres from land (at sea)
H = np.where(LAND, np.maximum(H, 0.35 + np.minimum(dist_sea, 12) * 0.06), np.minimum(H, -0.4 - np.minimum(dist_land, 400) * 0.07))
H = np.where(~LAND, np.maximum(H, -45), H)

# ---------------------------------------------------------------- land cover
C = {'SEA': 0, 'BEACH': 1, 'ROCK': 2, 'FOREST': 3, 'MIXED': 4, 'DECID': 5, 'HEATH': 6, 'GRASS': 7, 'FARM': 8, 'GARDEN': 9,
     'URBAN': 10, 'BOG': 11, 'LAKE': 12, 'GRAVEL': 13, 'STREAM': 14}
cover = np.where(LAND, C['MIXED'], C['SEA']).astype(np.uint8)
def paint(kind_rows, mapping):
    for cls_name, pl in mapping:
        if pl: m = raster(pl) & LAND; cover[m] = C[cls_name]
# ESA land cover (coarse), then OSM nature, then OSM land use, then water
lc = {}
for r, g in rows('land_cover'):
    if not g.intersects(bbox_ll): continue
    k = {'forest': 'FOREST', 'shrub': 'HEATH', 'barren': 'ROCK', 'urban': 'GARDEN', 'crop': 'FARM', 'grass': 'GRASS', 'wetland': 'BOG'}.get(r.get('subtype'))
    if k: lc.setdefault(k, []).extend(geom_local(p) for p in polys(g))
for k in ('HEATH', 'FOREST', 'GRASS', 'FARM', 'GARDEN', 'ROCK', 'BOG'): paint(None, [(k, lc.get(k))])
nat = {}
for r, g in rows('land'):
    if not g.intersects(bbox_ll): continue
    k = {('forest', 'wood'): 'FOREST', ('forest', 'forest'): 'FOREST', ('sand', 'beach'): 'BEACH', ('rock', 'bare_rock'): 'ROCK', ('rock', 'stone'): 'ROCK',
         ('wetland', 'wetland'): 'BOG', ('wetland', 'marsh'): 'BOG', ('wetland', 'bog'): 'BOG', ('grass', 'grassland'): 'GRASS', ('grass', 'meadow'): 'GRASS',
         ('shrub', 'shrub'): 'HEATH', ('shrub', 'heath'): 'HEATH', ('sand', 'sand'): 'BEACH'}.get((r.get('subtype'), r.get('class')))
    if k: nat.setdefault(k, []).extend(geom_local(p) for p in polys(g))
for k in ('FOREST', 'HEATH', 'GRASS', 'BOG', 'ROCK', 'BEACH'): paint(None, [(k, nat.get(k))])
lu = {}
for r, g in rows('land_use'):
    if not g.intersects(bbox_ll): continue
    s, c = r.get('subtype'), r.get('class')
    k = ('FARM' if s == 'agriculture' else 'GARDEN' if s == 'residential' else 'GRASS' if s in ('recreation', 'park', 'cemetery', 'managed', 'golf', 'winter_sports')
         else 'GRAVEL' if s == 'resource_extraction' else 'URBAN' if s in ('developed', 'transportation', 'education', 'medical') else None)
    if c in ('pitch', 'track', 'playground'): k = 'GRASS'
    if k: lu.setdefault(k, []).extend(geom_local(p) for p in polys(g))
for k in ('GARDEN', 'FARM', 'GRASS', 'GRAVEL', 'URBAN'): paint(None, [(k, lu.get(k))])
paint(None, [('BEACH', nat.get('BEACH'))])
lakes, streams = [], []
for r, g in rows('water'):
    if not g.intersects(bbox_ll): continue
    s = r.get('subtype')
    if s in ('lake', 'pond', 'reservoir', 'water') and polys(g):
        for p in polys(g):
            lp = geom_local(p)
            if lp.area > 60: lakes.append((lp, (r.get('names') or {}).get('primary')))
    elif s in ('stream', 'river', 'canal', 'drain', 'ditch') and isinstance(g, LineString):
        streams.append(geom_local(g))
# lakes: flat water surface at the lowest shore height, the bottom dug below it
lake_out = []
for lp, name in lakes:
    m = raster([lp])
    if not m.any() or (m & ~LAND).sum() > m.sum() * 0.5: continue
    ring = ndimage.binary_dilation(m, iterations=2) & ~m
    lvl = float(np.percentile(H[ring], 15)) if ring.any() else float(H[m].min())
    d_in = ndimage.distance_transform_edt(m) * CELL
    H[m] = np.minimum(H[m], lvl - 0.3 - np.minimum(d_in[m], 60) * 0.05)
    cover[m] = C['LAKE']
    b = lp.exterior.coords
    lake_out.append({'n': name, 'y': round(lvl, 2), 'p': [round(v, 1) for xy in lp.simplify(1.5).exterior.coords for v in xy]})
for ls in streams:
    m = raster([ls.buffer(1.6)]) & LAND & (cover != C['LAKE'])
    H[m] -= 0.5; cover[m] = C['STREAM']
# the shore: bare rock (svaberg) where it is steep or where nothing else is known, beaches where the map says so
slope = np.hypot(*np.gradient(H, CELL))
shore = LAND & (dist_sea < 14) & (cover != C['BEACH'])
cover[shore & ((slope > 0.12) | (dist_sea < 7))] = C['ROCK']
cover[LAND & (slope > 0.7) & np.isin(cover, [C['FOREST'], C['MIXED'], C['HEATH'], C['GRASS']])] = C['ROCK']
print('arealtyper', {k: int((cover == v).sum()) for k, v in C.items()})

# ---------------------------------------------------------------- roads
def bilinear(A, x, z):
    fx, fz = px(x), px(z); i = np.clip(np.floor(fx).astype(int), 0, N - 2); j = np.clip(np.floor(fz).astype(int), 0, N - 2)
    u, v = fx - i, fz - j
    return A[j, i] * (1 - u) * (1 - v) + A[j, i + 1] * u * (1 - v) + A[j + 1, i] * (1 - u) * v + A[j + 1, i + 1] * u * v
CLS = {'motorway': 0, 'trunk': 0, 'primary': 1, 'secondary': 2, 'tertiary': 3, 'residential': 4, 'unclassified': 4, 'living_street': 4,
       'service': 5, 'track': 6, 'path': 7, 'footway': 7, 'cycleway': 7, 'bridleway': 7, 'pedestrian': 7, 'unknown': 5}
WIDTH = [8.5, 7.5, 6.5, 6.0, 4.8, 3.4, 2.8, 2.0]
SURF = {'paved': 0, 'asphalt': 0, 'concrete': 0, 'paving_stones': 2, 'sett': 2, 'cobblestone': 2, 'gravel': 1, 'unpaved': 1, 'compacted': 1, 'fine_gravel': 1, 'dirt': 3, 'ground': 3, 'grass': 3}
roads = []; conn = {}
for r, g in rows('segment'):
    if r.get('subtype') != 'road' or not isinstance(g, LineString) or not g.intersects(bbox_ll): continue
    cl = CLS.get(r.get('class'))
    if cl is None: continue
    flags = r.get('road_flags') or []
    if any('is_tunnel' in f.get('values', []) or 'is_under_construction' in f.get('values', []) for f in flags): continue
    lg = geom_local(g)
    if lg.length < 3: continue
    n = max(2, int(math.ceil(lg.length / 3.0)) + 1)
    pts = np.array([lg.interpolate(t, normalized=True).coords[0] for t in np.linspace(0, 1, n)])
    x, z = pts[:, 0], pts[:, 1]
    if np.all(np.abs(x) > HALF - 20) or np.all(np.abs(z) > HALF - 20): continue
    srf = [s.get('value') for s in (r.get('road_surface') or []) if s.get('between') is None]
    su = SURF.get(srf[0], 0 if cl <= 5 else 3) if srf else (0 if cl <= 5 else 3 if cl == 7 else 1)
    if cl == 6 and not srf: su = 1
    t = np.linspace(0, 1, n); bridge = np.zeros(n, bool)
    for f in flags:
        if 'is_bridge' in f.get('values', []):
            a, b = f.get('between') or [0, 1]; bridge |= (t >= a - 1e-6) & (t <= b + 1e-6)
    y = bilinear(H, x, z)
    groups = []
    if bridge.any():
        idx = np.where(bridge)[0]
        groups = [g for g in np.split(idx, np.where(np.diff(idx) != 1)[0] + 1) if len(g)]
        for grp in groups:      # under a bridge the height data is the water: bridge it straight across before smoothing
            a, b = max(0, grp[0] - 1), min(n - 1, grp[-1] + 1)
            y[a:b + 1] = np.linspace(y[a], y[b], b - a + 1)
    # smooth the profile along the road, so the road is a gentle surface over the bumpy terrain
    sig = {0: 6, 1: 6, 2: 5, 3: 5, 4: 4, 5: 3, 6: 2.5, 7: 2}[cl]
    if n > 3: y = ndimage.gaussian_filter1d(y, sig, mode='nearest')
    rd = {'c': cl, 'w': WIDTH[cl], 's': su, 'x': x, 'z': z, 'y': y, 'b': bridge, 'g': groups, 'n': (r.get('names') or {}).get('primary'), 'id': r['id'], 'cn': []}
    for cn in r.get('connectors') or []:
        i = int(round(cn['at'] * (n - 1)))
        conn.setdefault(cn['connector_id'], []).append((len(roads), i)); rd['cn'].append((cn['connector_id'], i))
    roads.append(rd)
# where roads meet they share one height (only roads on the ground; a bridge over another road is left alone)
jh = {}
for cid, lst in conn.items():
    vals = [roads[k]['y'][i] for k, i in lst if not roads[k]['b'][i]]
    if not vals: continue
    if max(vals) - min(vals) > 2.5: jh[cid] = None; continue
    jh[cid] = float(np.mean(vals))
for rd in roads:
    y, n = rd['y'], len(rd['y'])
    for cid, i in rd['cn']:
        ym = jh.get(cid)
        if ym is None or rd['b'][i]: continue
        d = ym - y[i]
        for k in range(max(0, i - 8), min(n, i + 9)):
            y[k] += d * (1 - abs(k - i) / 9) ** 2
# bridges: a straight deck between the ends on the ground, with a small arch on the longer ones
for rd in roads:
    y, n = rd['y'], len(rd['y'])
    ends = {i: jh.get(c) for c, i in rd['cn']}
    for grp in rd['g']:
        a, b = max(0, grp[0] - 1), min(n - 1, grp[-1] + 1)
        ya = ends.get(a) if a == 0 and ends.get(a) is not None else y[a]
        yb = ends.get(b) if b == n - 1 and ends.get(b) is not None else y[b]
        tt = np.linspace(0, 1, b - a + 1)
        y[a:b + 1] = ya + (yb - ya) * tt + 1.2 * np.sin(np.pi * tt) * min(1, (b - a) * 3 / 60)
near = ndimage.distance_transform_edt(~TRO) * CELL if tromoya is not None else np.zeros((N, N))
def near_tro(x, z, m):
    i = np.clip(np.round(px(x)).astype(int), 0, N - 1); j = np.clip(np.round(px(z)).astype(int), 0, N - 1); return near[j, i] < m
roads = [r for r in roads if near_tro(r['x'], r['z'], 1800).any()]
print('veier', len(roads), 'km', round(sum(np.sum(np.hypot(np.diff(r['x']), np.diff(r['z']))) for r in roads) / 1000, 1))
# paint road beds into the cover (asphalt shows on the map and keeps trees off the road)
road_mask = np.zeros((N, N), bool)
im = Image.new('L', (N, N), 0); dr = ImageDraw.Draw(im)
for rd in roads:
    w = max(1, int(round((rd['w'] + 2.5) / CELL)))
    dr.line([(px(a), px(b)) for a, b in zip(rd['x'], rd['z'])], fill=1, width=w)
road_mask = np.asarray(im) > 0

# ---------------------------------------------------------------- buildings
BCLS = {'house': 0, 'detached': 0, 'semidetached_house': 0, 'terrace': 1, 'residential': 0, 'apartments': 2, 'cabin': 3, 'garage': 4, 'garages': 4, 'carport': 4,
        'shed': 5, 'hut': 5, 'boathouse': 6, 'barn': 7, 'farm': 7, 'farm_auxiliary': 7, 'stable': 7, 'warehouse': 8, 'industrial': 8, 'commercial': 9, 'retail': 9,
        'office': 9, 'school': 10, 'church': 11, 'civic': 10, 'public': 10, 'greenhouse': 12, 'kindergarten': 10, 'hotel': 9, 'sports_hall': 8}
buildings = []
for r, g in rows('building'):
    if not g.intersects(bbox_ll): continue
    for p in polys(g):
        lp = geom_local(p).simplify(0.35)
        if lp.area < 6 or not lp.is_valid: continue
        cx, cz = lp.centroid.x, lp.centroid.y
        if abs(cx) > HALF - 30 or abs(cz) > HALF - 30: continue
        k = BCLS.get(r.get('class'), -1)
        if k < 0:   # unknown: guess from the size
            k = 5 if lp.area < 18 else 4 if lp.area < 40 else 0 if lp.area < 260 else 8
        ring = list(lp.exterior.coords)[:-1]
        if len(ring) > 24: ring = list(lp.simplify(1.0).exterior.coords)[:-1]
        if len(ring) < 3: continue
        gy = bilinear(H, np.array([q[0] for q in ring]), np.array([q[1] for q in ring]))
        fl = r.get('num_floors') or {0: 2, 1: 2, 2: 4, 3: 1, 4: 1, 5: 1, 6: 1, 7: 2, 8: 2, 9: 3, 10: 2, 11: 2, 12: 1}[k]
        buildings.append({'k': k, 'f': int(fl), 'y0': round(float(gy.min()), 2), 'y1': round(float(gy.max()), 2),
                          'p': [round(v, 1) for q in ring for v in q], 'rs': r.get('roof_shape')})
buildings = [b for b in buildings if near_tro(np.array(b['p'][0::2]), np.array(b['p'][1::2]), 1300).any()]
print('bygninger', len(buildings))

# roads get narrower where a building stands close to them (the map has houses right by narrow old roads)
from shapely import STRtree, points as shp_points
foot = [Polygon(list(zip(b['p'][0::2], b['p'][1::2]))) for b in buildings]
tree = STRtree(foot)
for rd in roads:
    pts = shp_points(np.stack([rd['x'], rd['z']], 1))
    idx, dist = tree.query_nearest(pts, return_distance=True, all_matches=False)
    d = np.full(len(rd['x']), 1e9); d[idx[0]] = dist
    w = np.minimum(rd['w'], np.maximum(2.4, 2 * (d - 0.7)))
    rd['wv'] = ndimage.minimum_filter1d(w, 5) if len(w) > 4 else w
# ---------------------------------------------------------------- names and places
labels = []
for n, lp in named.items():
    if lp.area > 20000 or n == 'Tromøya': labels.append({'n': n, 'x': round(lp.centroid.x), 'z': round(lp.centroid.y), 't': 'island'})
for r, g in rows('land'):
    n = (r.get('names') or {}).get('primary')
    if n and r.get('subtype') in ('sand', 'physical') and g.intersects(bbox_ll):
        c = geom_local(g).centroid; labels.append({'n': n, 'x': round(c.x), 'z': round(c.y), 't': r.get('class')})
for r, g in rows('water'):
    n = (r.get('names') or {}).get('primary')
    if n and g.intersects(bbox_ll) and r.get('subtype') in ('physical', 'lake', 'water'):
        c = geom_local(g).centroid; labels.append({'n': n, 'x': round(c.x), 'z': round(c.y), 't': r.get('class') or 'water'})
for r, g in rows('land_use'):
    n = (r.get('names') or {}).get('primary')
    if n and g.intersects(bbox_ll) and r.get('subtype') in ('cemetery', 'recreation', 'park', 'protected'):
        c = geom_local(g).centroid; labels.append({'n': n, 'x': round(c.x), 'z': round(c.y), 't': r.get('class')})
piers = []
for r, g in rows('infra'):
    if not g.intersects(bbox_ll): continue
    if r.get('class') in ('ferry_terminal',):
        c = geom_local(g).centroid; labels.append({'n': (r.get('names') or {}).get('primary') or 'Ferjekai', 'x': round(c.x), 'z': round(c.y), 't': 'ferry'})
    if r.get('class') in ('pier', 'quay') and not isinstance(g, Point):
        lg = geom_local(g)
        if isinstance(lg, LineString) and lg.length > 4: piers.append([round(v, 1) for q in lg.coords for v in q])
print('navn', len(labels), 'brygger', len(piers))

# ---------------------------------------------------------------- write
def write_grid(path, arr, kind):
    if kind == 'h':
        q = np.round(arr / 0.05).astype(np.int32)                           # 5 cm steps
        d = np.diff(q, axis=1, prepend=0).astype(np.int16)                  # each row as differences (compresses well)
        hdr = {'nx': N, 'nz': N, 'x0': -HALF, 'z0': -HALF, 'cell': CELL, 'scale': 0.05, 'delta': True}
        body = d.tobytes()
    else:
        hdr = {'nx': N, 'nz': N, 'x0': -HALF, 'z0': -HALF, 'cell': CELL}
        body = arr.astype(np.uint8).tobytes()
    hj = json.dumps(hdr).encode()
    with gzip.open(path, 'wb', compresslevel=9) as f:
        f.write(b'TRMG' + struct.pack('<I', len(hj)) + hj + body)
    print(path, os.path.getsize(path) // 1024, 'kB')
write_grid(os.path.join(OUT, 'tromoya', 'terrain.bin.gz'), H, 'h')
write_grid(os.path.join(OUT, 'tromoya', 'cover.bin.gz'), cover, 'c')
feat = {
    'origin': {'lon': LON0, 'lat': LAT0, 'crs': 'EPSG:25832', 'E0': E0, 'N0': N0},
    'credits': 'Høydedata: Kartverket (CC BY 4.0) via AWS Terrain Tiles. Kart: © OpenStreetMap-bidragsytere (ODbL) via Overture Maps.',
    'cover': list(C.keys()),
    'roads': [{'c': r['c'], 'w': r['w'], 's': r['s'], 'n': r['n'], 'b': [int(i) for i in np.where(r['b'])[0]] if r['b'].any() else None,
               'wv': [round(float(v), 1) for v in r['wv']] if np.any(r['wv'] < r['w'] - 0.05) else None,
               'p': [round(float(v), 1) for t in zip(r['x'], r['z'], r['y']) for v in t]} for r in roads],
    'buildings': buildings, 'lakes': lake_out, 'labels': labels, 'piers': piers,
}
with gzip.open(os.path.join(OUT, 'tromoya', 'features.json.gz'), 'wt', compresslevel=9) as f: json.dump(feat, f, separators=(',', ':'))
print('features', os.path.getsize(os.path.join(OUT, 'tromoya', 'features.json.gz')) // 1024, 'kB')
# a preview for checking by eye
pal = np.array([[38, 78, 120], [214, 196, 150], [140, 134, 124], [46, 82, 44], [64, 98, 52], [92, 122, 62], [110, 112, 70], [120, 160, 80], [170, 160, 90],
                [130, 150, 100], [150, 150, 150], [90, 86, 60], [60, 110, 160], [170, 160, 140], [70, 120, 170]], np.uint8)
img = pal[cover]; gy, gx = np.gradient(H, CELL); shade = np.clip(1 + (-gx * 0.7 - gy * 0.7) * 1.5, 0.6, 1.3)[..., None]
img = np.clip(img * shade, 0, 255).astype(np.uint8); img[road_mask] = [235, 230, 220]
Image.fromarray(img).resize((1200, 1200)).save(os.path.join(GEO, 'tromoya_preview.png'))
