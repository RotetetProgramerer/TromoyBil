"""Bakteppet rundt Tromøya: fastlandet, Hisøy og holmene i 48 × 48 km, ett punkt hver 40. meter (fra zoom 12-flisene, se dem.py).
Skriver world/backdrop/terrain.bin.gz og cover.bin.gz i samme format som øyene (origo midt på Tromøya).
Bruk: python3 tools/geo/build_backdrop.py <geo-mappe med tiles/dem_z12.npz> <repo>/world"""
import sys, os, json, gzip, struct
import numpy as np
from scipy import ndimage
from pyproj import Transformer
GEO, OUT = sys.argv[1], sys.argv[2]
LON0, LAT0, CELL, HALF = 8.8648, 58.4720, 40.0, 24000.0
N = int(2 * HALF / CELL) + 1
fwd = Transformer.from_crs('EPSG:4326', 'EPSG:25832', always_xy=True); inv = Transformer.from_crs('EPSG:25832', 'EPSG:4326', always_xy=True)
E0, N0 = fwd.transform(LON0, LAT0)
d = np.load(os.path.join(GEO, 'tiles', 'dem_z12.npz')); h = d['h'].astype(np.float64); z, tx0, ty0 = int(d['z']), int(d['tx0']), int(d['ty0'])
bad = (h < -2000) | (h > 3000)
if bad.any(): h = h[tuple(ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True))]
gi = np.arange(N) * CELL - HALF; GX, GZ = np.meshgrid(gi, gi)
lon, lat = inv.transform(GX + E0, -GZ + N0); n = 2 ** z
X = (lon + 180) / 360 * n; la = np.radians(lat); Y = (1 - np.log(np.tan(la) + 1 / np.cos(la)) / np.pi) / 2 * n
H = ndimage.map_coordinates(h, [((Y - ty0) * 256 - 0.5).ravel(), ((X - tx0) * 256 - 0.5).ravel()], order=3, mode='nearest').reshape(N, N)
land = H > 0.6
H = np.where(land, H, np.minimum(H, -1.0))
dist = ndimage.distance_transform_edt(land) * CELL
cover = np.where(land, np.where(dist < 60, 2, 3), 0).astype(np.uint8)        # sea, bare rock at the shore, forest inland
slope = np.hypot(*np.gradient(H, CELL)); cover[land & (slope > 0.45)] = 2
def write(path, arr, kind):
    if kind == 'h':
        q = np.round(arr / 0.1).astype(np.int32); body = np.diff(q, axis=1, prepend=0).astype(np.int16).tobytes()
        hdr = {'nx': N, 'nz': N, 'x0': -HALF, 'z0': -HALF, 'cell': CELL, 'scale': 0.1, 'delta': True}
    else: body = arr.tobytes(); hdr = {'nx': N, 'nz': N, 'x0': -HALF, 'z0': -HALF, 'cell': CELL}
    hj = json.dumps(hdr).encode()
    with gzip.open(path, 'wb', 9) as f: f.write(b'TRMG' + struct.pack('<I', len(hj)) + hj + body)
    print(path, os.path.getsize(path) // 1024, 'kB')
write(os.path.join(OUT, 'backdrop', 'terrain.bin.gz'), H, 'h'); write(os.path.join(OUT, 'backdrop', 'cover.bin.gz'), cover, 'c')
with gzip.open(os.path.join(OUT, 'backdrop', 'features.json.gz'), 'wt') as f:
    json.dump({'credits': 'Høydedata: Kartverket (CC BY 4.0) via AWS Terrain Tiles.', 'roads': [], 'buildings': [], 'lakes': [], 'labels': [
        {'n': 'Arendal', 'x': -5600, 'z': -500, 't': 'town'}, {'n': 'Hisøy', 'x': -6800, 'z': 3800, 't': 'island'}, {'n': 'Skagerrak', 'x': 9000, 'z': 9000, 't': 'sea'}]}, f)
# a land/sea mask for placing the made-up islands in open water (1 = land), at 200 m
m = land[::5, ::5].astype(np.uint8); np.save(os.path.join(GEO, 'backdrop_land_200m.npy'), m)
print('land', round(land.mean(), 3))
