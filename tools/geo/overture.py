"""Henter kartdata fra Overture Maps (OpenStreetMap m.fl., ODbL) for et område, uten innlogging.
Leser bare radgruppene i Parquet-filene som overlapper området (HTTP range-forespørsler).
Bruk: python3 tools/geo/overture.py <ut-mappe> <lon0> <lat0> <lon1> <lat1>"""
import sys,os,json,re,requests,fsspec,pyarrow.parquet as pq,pyarrow as pa
REL='2026-10-21.0';BUCKET='https://overturemaps-us-west-2.s3.amazonaws.com'
TYPES={'land':'base/land','land_cover':'base/land_cover','land_use':'base/land_use','water':'base/water','infra':'base/infrastructure',
       'segment':'transportation/segment','building':'buildings/building','place':'places/place'}
def keys(prefix):
    out=[];tok=None
    while True:
        u=f'{BUCKET}/?list-type=2&prefix={prefix}'+(f'&continuation-token={requests.utils.quote(tok)}' if tok else '')
        x=requests.get(u,timeout=60).text;out+=re.findall(r'<Key>([^<]+\.parquet)</Key>',x)
        m=re.search(r'<NextContinuationToken>([^<]+)</NextContinuationToken>',x)
        if not m:return out
        tok=m.group(1)
def stat(md,rg,name):
    r=md.row_group(rg)
    for c in range(r.num_columns):
        col=r.column(c)
        if col.path_in_schema==name and col.statistics is not None and col.statistics.has_min_max:return col.statistics.min,col.statistics.max
    return None
def fetch(kind,box,outdir):
    t,ty=TYPES[kind].split('/');ks=keys(f'release/{REL}/theme={t}/type={ty}/')
    fs=fsspec.filesystem('http',client_kwargs={'trust_env':True})
    lon0,lat0,lon1,lat1=box;rows=[]
    for k in ks:
        with fs.open(f'{BUCKET}/{k}',block_size=1<<20) as f:
            pf=pq.ParquetFile(f);md=pf.metadata;want=[]
            for rg in range(md.num_row_groups):
                a=stat(md,rg,'bbox.xmin');b=stat(md,rg,'bbox.xmax');c=stat(md,rg,'bbox.ymin');d=stat(md,rg,'bbox.ymax')
                if a and b and c and d and (a[0]>lon1 or b[1]<lon0 or c[0]>lat1 or d[1]<lat0):continue
                want.append(rg)
            if not want:continue
            cols=[n for n in pf.schema_arrow.names if n in('id','geometry','bbox','subtype','class','names','height','num_floors','roof_shape','roof_height','level','road_surface','road_flags','speed_limits','width','is_bridge','is_tunnel','surface','level_rules','facade_material','roof_material','categories','min_height','is_underground','connectors','routes','sources')]
            tb=pf.read_row_groups(want,columns=cols).to_pylist()
            for r in tb:
                bb=r['bbox']
                if bb['xmin']>lon1 or bb['xmax']<lon0 or bb['ymin']>lat1 or bb['ymax']<lat0:continue
                r.pop('bbox');r['geometry']=r['geometry'].hex() if isinstance(r['geometry'],(bytes,bytearray)) else r['geometry'];rows.append(r)
        print(kind,k.split('/')[-1][:40],'grupper',len(want),'rader',len(rows),flush=True)
    json.dump(rows,open(os.path.join(outdir,kind+'.json'),'w'),default=str)
if __name__=='__main__':
    out=sys.argv[1];os.makedirs(out,exist_ok=True);box=tuple(map(float,sys.argv[2:6]))
    for kind in (sys.argv[6].split(',') if len(sys.argv)>6 else TYPES):fetch(kind,box,out)
