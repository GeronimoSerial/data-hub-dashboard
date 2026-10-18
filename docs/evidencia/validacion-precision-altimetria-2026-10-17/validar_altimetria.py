"""Diagnóstico reproducible IGN/GLO-30; las diferencias no son errores verdaderos.

Dependencias: numpy, rasterio, shapely, pyproj. Ejecución desde raíz del repositorio:
PYTHONPATH=/tmp/viabilidad-altimetria-parana/python-libs python3 \
  docs/evidencia/validacion-precision-altimetria-2026-10-17/validar_altimetria.py

COG remoto: sólo ventanas de 7x7 píxeles; caché de esas ventanas permite repetir
sin red. No importa datos ni cambia el motor. Cada producto conserva su datum.
"""
from __future__ import annotations
import csv, json, math, hashlib, time, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
import rasterio
from rasterio.windows import Window
from shapely.geometry import shape, Point

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
CACHE=ROOT/'services/geo-static/.data/validacion-precision-altimetria-2026-10-17'
CACHE.mkdir(parents=True,exist_ok=True)
CSV=ROOT/'docs/evidencia/altimetria-2026-10-17/provincial/cobertura-y-muestras.csv'
rows=list(csv.DictReader(CSV.open()))
points=sorted({(float(x['lon']),float(x['lat'])) for x in rows if x['lon']})
R=6371000.0

def distances(lon,lat,xs,ys):
    p1=np.radians(lat);p2=np.radians(ys);dlat=p2-p1;dlon=np.radians(xs-lon)
    return 2*R*np.arcsin(np.sqrt(np.sin(dlat/2)**2+np.cos(p1)*np.cos(p2)*np.sin(dlon/2)**2))

def tile_name(lat,lon):
    return f'Copernicus_DSM_COG_10_S{abs(lat):02d}_00_W{abs(lon):03d}_00_DEM'

def patch(src,lon,lat):
    r,c=src.index(lon,lat)
    # Radius >50 m even at the eastern/western edges of the provincial AOI.
    w=Window(max(0,c-3),max(0,r-3),min(src.width,c+4)-max(0,c-3),min(src.height,r+4)-max(0,r-3))
    if w.width<=0 or w.height<=0:return []
    a=src.read(1,window=w,masked=True).astype(float).filled(np.nan)
    rr,cc=np.indices(a.shape);tr=src.window_transform(w)
    xs=tr.c+(cc+.5)*tr.a;ys=tr.f+(rr+.5)*tr.e
    valid=(distances(lon,lat,xs,ys)<=50)&np.isfinite(a)
    return np.column_stack([xs[valid],ys[valid],a[valid]]).tolist()

# Adjacent tiles are included where the 50 m disk crosses a degree boundary.
cop_groups={}
for lon,lat in points:
    dlat=51/111000;dlon=dlat/math.cos(math.radians(lat))
    for la in range(math.floor(lat-dlat),math.floor(lat+dlat)+1):
      for lo in range(math.floor(lon-dlon),math.floor(lon+dlon)+1):
        cop_groups.setdefault((la,lo),[]).append((lon,lat))

def read_cop(item):
    (la,lo),xy=item;name=tile_name(la,lo)
    dest=CACHE/(name+'.json')
    if dest.exists():return json.loads(dest.read_text())
    url=f'https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif'
    result={'url':url,'tile':name,'sampling':'native pixel centers, 50 m Haversine disk','samples':{},'main_pixels':{}}
    with rasterio.Env(GDAL_HTTP_TIMEOUT='45',GDAL_HTTP_MAX_RETRY='2',GDAL_HTTP_RETRY_DELAY='1',GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif',GDAL_CACHEMAX=256*1024*1024):
      with rasterio.open(url) as src:
        result['metadata']={'crs':str(src.crs),'transform':list(src.transform),'shape':[src.height,src.width],'nodata':src.nodata,'tags':src.tags(),'dtype':str(src.dtypes[0])}
        for lon,lat in xy:
          k=f'{lon},{lat}';result['samples'][k]=patch(src,lon,lat)
          r,c=src.index(lon,lat)
          if 0<=r<src.height and 0<=c<src.width:
            result['main_pixels'][k]=float(src.read(1,window=Window(c,r,1,1))[0,0])
    dest.write_text(json.dumps(result,allow_nan=False))
    print('Copernicus',name,len(xy),'points',flush=True)
    return result

cop={};cop_main={};manifest=[]
with ThreadPoolExecutor(max_workers=4) as ex:
  futures=[ex.submit(read_cop,item) for item in cop_groups.items()]
  for f in as_completed(futures):
    result=f.result();cp=CACHE/(result['tile']+'.json')
    manifest.append({k:v for k,v in result.items() if k not in ('samples','main_pixels')}|{'cache_file':str(cp.relative_to(ROOT)),'cache_sha256':hashlib.sha256(cp.read_bytes()).hexdigest()})
    for k,values in result['samples'].items():cop.setdefault(k,[]).extend(values)
    for k,v in result['main_pixels'].items():cop_main.setdefault(k,v)

sources=[rasterio.open(p) for p in sorted((ROOT/'services/geo-static/.data/viabilidad-altimetria-2026-10-17/ign-mdear').glob('*.img'))]
ign={}
for lon,lat in points:
    vals=[];dlat=51/111000;dlon=dlat/math.cos(math.radians(lat))
    for src in sources:
      b=src.bounds
      if lon+dlon>=b.left and lon-dlon<=b.right and lat+dlat>=b.bottom and lat-dlat<=b.top:vals.extend(patch(src,lon,lat))
    ign[f'{lon},{lat}']=vals
for src in sources:src.close()

# Modelos geoidales: se conserva el manifiesto público y se verifican sus hashes.
grids=json.loads((OUT/'grillas-proj.geojson').read_text())['features']
for feature in grids:
    p=feature['properties'];dest=CACHE/p['name']
    if not dest.exists():
        with urllib.request.urlopen(p['url'],timeout=120) as response:dest.write_bytes(response.read())
    assert hashlib.sha256(dest.read_bytes()).hexdigest()==p['sha256sum'],p['name']

def load_grid(name):
    with rasterio.open(CACHE/name) as src:return src.read(1),src.transform

def interpolate_grid(grid,xs,ys):
    a,tr=grid
    cf=(np.asarray(xs)-tr.c)/tr.a-.5;rf=(np.asarray(ys)-tr.f)/tr.e-.5
    c=np.floor(cf).astype(int);r=np.floor(rf).astype(int)
    assert ((c>=0)&(c+1<a.shape[1])&(r>=0)&(r+1<a.shape[0])).all()
    dx=cf-c;dy=rf-r
    return (a[r,c]*(1-dx)*(1-dy)+a[r,c+1]*dx*(1-dy)+a[r+1,c]*(1-dx)*dy+a[r+1,c+1]*dx*dy)

arg_grid=load_grid('ar_ign_GEOIDE-Ar16.tif');egm_grid=load_grid('us_nga_egm08_25.tif')
def datum_offset(xs,ys):
    # h = H_EGM + N_EGM; H_SRVN16 = h - N_ARG.
    return interpolate_grid(egm_grid,xs,ys)-interpolate_grid(arg_grid,xs,ys)

from pyproj import Transformer
pipeline=f'+proj=pipeline +step +proj=unitconvert +xy_in=deg +xy_out=rad +step +proj=vgridshift +grids={CACHE / "us_nga_egm08_25.tif"} +multiplier=1 +step +proj=vgridshift +grids={CACHE / "ar_ign_GEOIDE-Ar16.tif"} +multiplier=-1 +step +proj=unitconvert +xy_in=rad +xy_out=deg'
control_xy=(-58.833112,-27.489013)
manual=100+float(datum_offset(*control_xy))
proj_z=Transformer.from_pipeline(pipeline).transform(*control_xy,100)[2]
assert abs(manual-proj_z)<1e-6
control_datum={'lon':control_xy[0],'lat':control_xy[1],'H_EGM2008_prueba_m':100,'N_EGM2008_m':float(interpolate_grid(egm_grid,*control_xy)),'N_GEOIDE_Ar16_m':float(interpolate_grid(arg_grid,*control_xy)),'H_SRVN16_manual_m':manual,'H_SRVN16_PROJ_m':proj_z,'diferencia_manual_PROJ_m':manual-proj_z,'pipeline_PROJ':pipeline,'nota':'Control de implementación/signo, no control geodésico independiente. No transforma época/marco horizontal WGS84-G1150 a POSGAR07.'}

def stats_native(values):
    # Overlapping IGN sheets share grid cells: don't count that cell twice.
    vv={ (round(x,10),round(y,10)):z for x,y,z in values }
    a=np.array(list(vv.values()))
    return {'p10':float(np.percentile(a,10)),'p50':float(np.percentile(a,50)),'p90':float(np.percentile(a,90)),'min':float(a.min()),'max':float(a.max()),'n':len(a)} if len(a) else {}

result=[]
for row in rows:
    r=dict(row)
    if row['lon']:
      k=f"{float(row['lon'])},{float(row['lat'])}"
      for prefix,data in [('ign',ign),('cop',cop)]:
        s=stats_native(data.get(k,[]))
        r.update({f'{prefix}_{key}_50m':v for key,v in s.items()})
      r['cop_pixel_m']=cop_main.get(k)
      if r.get('cop_pixel_m') is not None:r['delta_pixel_ign_menos_cop_m']=float(row['valor_pixel_m'])-r['cop_pixel_m']
      if 'ign_p10_50m' in r and 'cop_p10_50m' in r:r['delta_p10_ign_menos_cop_m']=r['ign_p10_50m']-r['cop_p10_50m']
      cp=np.array(cop[k]);corrected=cp.copy();corrected[:,2]+=datum_offset(cp[:,0],cp[:,1])
      r['cop_p10_srvn16_aprox_50m']=stats_native(corrected.tolist())['p10']
      r['delta_p10_ign_menos_cop_armonizado_m']=r['ign_p10_50m']-r['cop_p10_srvn16_aprox_50m']
      r['offset_datum_en_escuela_m']=float(datum_offset(float(row['lon']),float(row['lat'])))
    result.append(r)

keys=list(dict.fromkeys(k for r in result for k in r))
with (OUT/'comparacion-escolar.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows(result)

def summary(rs,key):
 a=np.array([float(r[key]) for r in rs if r.get(key) is not None])
 return {'n':len(a),'media':float(a.mean()),'desvio_poblacional':float(a.std()),'mediana':float(np.median(a)),'mad_diferencias':float(np.median(np.abs(a-np.median(a)))),'media_absoluta_diferencia':float(np.mean(np.abs(a))),'raiz_media_cuadrados_diferencias':float(np.sqrt(np.mean(a*a))),'p05':float(np.percentile(a,5)),'p95':float(np.percentile(a,95)),'p90_abs':float(np.percentile(np.abs(a),90)),'max_abs':float(np.abs(a).max()),'abs_gt_1m':int((np.abs(a)>1).sum()),'abs_gt_2m':int((np.abs(a)>2).sum()),'abs_gt_5m':int((np.abs(a)>5).sum())}

pilot={'ITUZAINGO','APIPE GRANDE','ITA IBATE','ITATI','RAMADA PASO','PASO DE LA PATRIA','ENSENADITA'}
groups={'provincial':result,'corredor_por_localidad_actual':[r for r in result if r['localidad'] in pilot],'provincia_sin_alertas_coordenadas':[r for r in result if not r['control_departamento'].startswith('revisar')]}
# Explicit exclusion rather than relying on the internal spelling of the flag.
groups['provincia_sin_alertas_coordenadas']=[r for r in result if r['control_departamento']=='sin_alerta_por_este_control']
unique=[];seen=set()
for r in result:
 k=(r['lon'],r['lat'])
 if r['lon'] and k not in seen:unique.append(r);seen.add(k)
groups['ubicaciones_unicas']=unique
summaries={group:{key:summary(rs,key) for key in ['delta_pixel_ign_menos_cop_m','delta_p10_ign_menos_cop_m','delta_p10_ign_menos_cop_armonizado_m']} for group,rs in groups.items()}
variation={}
for prefix in ['ign','cop']:
 a=np.array([r[f'{prefix}_p90_50m']-r[f'{prefix}_p10_50m'] for r in result if f'{prefix}_p10_50m' in r])
 variation[prefix]={'n':len(a),'mediana_p90_menos_p10_50m':float(np.median(a)),'p90_p90_menos_p10_50m':float(np.percentile(a,90)),'rango_gt_2m':int((a>2).sum()),'rango_gt_5m':int((a>5).sum())}
output={'fecha_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'padron_csv':str(CSV.relative_to(ROOT)),'padron_csv_sha256':hashlib.sha256(CSV.read_bytes()).hexdigest(),'denominadores':{'padron':len(rows),'con_coordenadas':sum(bool(r['lon']) for r in rows),'ubicaciones_unicas':len(points)},'advertencia':'Se separan diferencias crudas SRVN16 menos EGM2008 y armonizadas aproximadamente mediante grillas. Ninguna es error verdadero ni cota de piso.','metricas_diferencias':summaries,'variacion_espacial_50m':variation,'armonizacion_vertical':{'formula':'H_SRVN16_aprox = H_EGM2008 + N_EGM2008 - N_GEOIDE-Ar16','grillas':'grillas-proj.geojson','control_implementacion':control_datum,'offsets_m':summary(result,'offset_datum_en_escuela_m')},'copernicus_sources':manifest}
(OUT/'metricas.json').write_text(json.dumps(output,indent=2,ensure_ascii=False,allow_nan=False)+'\n')
print(json.dumps({'metricas':summaries,'variacion':variation},ensure_ascii=False),flush=True)
