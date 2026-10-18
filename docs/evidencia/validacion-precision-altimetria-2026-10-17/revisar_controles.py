"""Disponibilidad RN-Ar: proximidad a escuelas, sin equiparar chapa y suelo.

Ejecutar desde raíz con el mismo PYTHONPATH del script validar_altimetria.py.
No calcula error DEM contra marcas cuyo soporte físico/planimétrico falta.
"""
import csv
import hashlib
import json
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

import numpy as np
from shapely.geometry import Point, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
CACHE = ROOT / 'services/geo-static/.data/validacion-precision-altimetria-2026-10-17'
departamentos = ROOT / 'public/data/departamentos-corrientes-georef-2026-09-27.geojson'
province = unary_union([shape(f['geometry']) for f in json.loads(departamentos.read_text())['features']])
features, queries = [], []
for name in ['nivelacion_alta_precision', 'nivelacion_precision', 'nivelacion_topografica']:
    params = dict(service='WFS', version='1.0.0', request='GetFeature', typeName='ign:' + name,
                  outputFormat='application/json', srsName='EPSG:4326',
                  bbox='-60,-31,-55.3,-26.5,EPSG:4326', maxFeatures=10000)
    url = 'https://wms.ign.gob.ar/geoserver/wfs?' + urllib.parse.urlencode(params)
    path = CACHE / (name + '.geojson')
    if not path.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            path.write_bytes(response.read())
    data = json.loads(path.read_text())
    queries.append({'url': url, 'features_bbox': len(data['features']),
                    'cache_sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    features.extend(f for f in data['features'] if province.covers(Point(f['geometry']['coordinates'])))

(OUT / 'marcas-rn-ar-provincia.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False))
marks = np.array([f['geometry']['coordinates'] for f in features])
lon, lat = marks[:, 0], marks[:, 1]
rows = []
with (ROOT / 'docs/evidencia/altimetria-2026-10-17/provincial/cobertura-y-muestras.csv').open() as source:
    for school in csv.DictReader(source):
        if not school['lat']:
            continue
        phi = np.radians(float(school['lat']))
        dlat = np.radians(lat) - phi
        dlon = np.radians(lon - float(school['lon']))
        a = np.sin(dlat / 2)**2 + np.cos(np.radians(lat)) * np.cos(phi) * np.sin(dlon / 2)**2
        distances = 2 * 6371000 * np.arcsin(np.sqrt(a))
        i = distances.argmin()
        mark = features[i]['properties']
        rows.append({'cue_anexo': school['cue_anexo'], 'marca_mas_cercana': mark['nomenclatura'],
                     'distancia_m': round(float(distances[i]), 3), 'tipo_marca': mark['marca'],
                     'estado': mark['estado'], 'cota_marca_m': mark['cota']})
with (OUT / 'proximidad-marcas-no-validacion.csv').open('w') as destination:
    writer = csv.DictWriter(destination, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
summary = {'consultas': queries, 'marcas_dentro_departamentos': len(features),
           'limite_departamentos_sha256': hashlib.sha256(departamentos.read_bytes()).hexdigest(),
           'tipo_marca': dict(Counter(f['properties']['marca'] for f in features)),
           'estado': dict(Counter(f['properties']['estado'] for f in features)),
           'escuelas_con_marca_a_menos_de_50m': sum(r['distancia_m'] < 50 for r in rows),
           'escuelas_con_marca_a_menos_de_100m': sum(r['distancia_m'] < 100 for r in rows),
           'escuelas_con_marca_a_menos_de_1000m': sum(r['distancia_m'] < 1000 for r in rows),
           'nota': 'Proximidad a marca no mide piso ni error DEM: faltan reducción marca-suelo, calidad planimétrica por punto, control de estado y fecha; independencia del ajuste del DEM no acreditada.'}
(OUT / 'controles-rn-ar.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({k: v for k, v in summary.items() if k != 'consultas'}, ensure_ascii=False))
