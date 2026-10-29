"""Henter høydedata (AWS Terrain Tiles, «terrarium»-PNG; i Norge fra Kartverket via Mapzen, CC BY 4.0) for et område og
setter dem sammen til ett rutenett i grader. Brukes av tools/geo/build_tromoya.py.
Bruk: python3 tools/geo/dem.py <cache-mappe> <zoom> <lon0> <lat0> <lon1> <lat1>  → skriver dem_z<zoom>.npz i cache-mappa"""
import sys,os,math,io,concurrent.futures as cf,requests,numpy as np
from PIL import Image
URL='https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
def tile_xy(lon,lat,z):
    n=2**z;la=math.radians(lat);return (lon+180)/360*n,(1-math.log(math.tan(la)+1/math.cos(la))/math.pi)/2*n
def fetch(cache,z,x,y):
    p=os.path.join(cache,f'{z}_{x}_{y}.png')
    if not os.path.exists(p):
        for k in range(4):
            try:
                r=requests.get(URL.format(z=z,x=x,y=y),timeout=60);r.raise_for_status();open(p,'wb').write(r.content);break
            except Exception as e:
                if k==3:raise
    a=np.asarray(Image.open(p).convert('RGB')).astype(np.float64)
    return a[...,0]*256+a[...,1]+a[...,2]/256-32768
def mosaic(cache,z,lon0,lat0,lon1,lat1):
    x0,y0=tile_xy(lon0,lat1,z);x1,y1=tile_xy(lon1,lat0,z)
    xs=list(range(int(x0),int(x1)+1));ys=list(range(int(y0),int(y1)+1))
    big=np.zeros((len(ys)*256,len(xs)*256),np.float32)
    with cf.ThreadPoolExecutor(16) as ex:
        futs={ex.submit(fetch,cache,z,x,y):(i,j) for j,y in enumerate(ys) for i,x in enumerate(xs)}
        for f in cf.as_completed(futs):
            i,j=futs[f];big[j*256:(j+1)*256,i*256:(i+1)*256]=f.result()
    return big,xs[0],ys[0]
def lonlat_of_pixel(z,tx0,ty0,px,py):
    n=2**z;X=tx0+px/256;Y=ty0+py/256
    lon=X/n*360-180;lat=np.degrees(np.arctan(np.sinh(np.pi*(1-2*Y/n))));return lon,lat
if __name__=='__main__':
    cache,z=sys.argv[1],int(sys.argv[2]);box=list(map(float,sys.argv[3:7]));os.makedirs(cache,exist_ok=True)
    big,tx0,ty0=mosaic(cache,z,*box);np.savez_compressed(os.path.join(cache,f'dem_z{z}.npz'),h=big,z=z,tx0=tx0,ty0=ty0)
    print('mosaikk',big.shape,'min',big.min(),'maks',big.max())
