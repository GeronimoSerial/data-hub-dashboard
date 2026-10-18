"""Exporta distancias S2 de la misma escena que la evidencia seca de v0.4.

Uso: python scripts/exportar-antecedentes-crecida.py DIRECTORIO_CALIBRACION
Requiere numpy, scipy y rasterio. El directorio debe contener aoi.json, dl/s2/
y alturas_criticas_escuelas.csv del estudio.
"""

import argparse
import csv
import json
import math
import re
from pathlib import Path

import numpy as np
from rasterio.transform import Affine
from rasterio.warp import transform
from scipy import ndimage


def exportar(estudio: Path, salida: Path) -> None:
    raiz = Path(__file__).resolve().parent.parent
    evidencia = (raiz / "lib/infraestructura/riesgo/motor/evidencia-seco-s2.ts").read_text()
    filas = re.findall(r"\['([^']+)', '([^']+)', ([\d.]+), '([\d-]+)'\]", evidencia)
    por_escena = {}
    for cue, estacion, nivel, fecha in filas:
        por_escena.setdefault((estacion, fecha, float(nivel)), set()).add(cue)
    areas = json.loads((estudio / "aoi.json").read_text())
    calibracion = (raiz / "lib/infraestructura/riesgo/motor/altura-critica.ts").read_text()
    utilizables = set(re.findall(r"'([^']+)': o\('[^']+', [\d.-]+, 'usar(?:_con_reservas)?'", calibracion))
    if not utilizables:
        raise ValueError("No se pudo leer la política de calibración de v0.4")
    with (estudio / "alturas_criticas_escuelas.csv").open() as archivo:
        referencias = {fila["cue"]: fila for fila in csv.DictReader(archivo)}
    grupos = []
    for (estacion, fecha, nivel), cues in sorted(por_escena.items()):
        escena = estudio / "dl/s2" / estacion / fecha
        meta = json.loads(escena.with_suffix(".json").read_text())
        if abs(meta["h"] - nivel) > 0.001:
            raise ValueError(f"Nivel incompatible con la evidencia v0.4: {escena}")
        with np.load(escena.with_suffix(".npz")) as imagen:
            invalido = np.isin(imagen["scl"], [0, 3, 8, 9, 10])
            agua = ((imagen["ndwi"] > 0.1) | (imagen["mndwi"] > 0.1)) & ~invalido
        etiquetas, cantidad = ndimage.label(agua, structure=np.ones((3, 3)))
        if cantidad == 0:
            raise ValueError(f"Escena sin cuerpo de agua: {escena}")
        tamanos = ndimage.sum(agua, etiquetas, range(1, cantidad + 1))
        principal = etiquetas == 1 + int(np.argmax(tamanos))
        matriz = Affine(*meta["transform"])
        distancias = ndimage.distance_transform_edt(~principal) * abs(matriz.a)
        escuelas = [e for e in areas[estacion]["escuelas"] if e["cue"] in cues]
        xs, ys = transform("EPSG:4326", meta["crs"], [e["lon"] for e in escuelas], [e["lat"] for e in escuelas])
        validas = {}
        for escuela, x, y in zip(escuelas, xs, ys):
            col, fila = int((x - matriz.c) / matriz.a), int((y - matriz.f) / matriz.e)
            if not (0 <= fila < agua.shape[0] and 0 <= col < agua.shape[1]):
                continue
            distancia = float(distancias[fila, col])
            if not invalido[fila, col] and distancia >= 30:
                validas[escuela["cue"]] = round(distancia)
        alturas = {}
        for cue in sorted(validas):
            referencia = referencias.get(cue)
            if not referencia or referencia["station"] != estacion:
                continue
            if estacion not in utilizables or referencia["verdict"] not in ("usar", "usar con reservas"):
                continue
            if any(flag in referencia["flag"] for flag in ("geocodificacion_dudosa", "fuera_aoi_calibracion")):
                continue
            valor = referencia["h_crit_margin2"]
            if valor and math.isfinite(float(valor)):
                alturas[cue] = max(float(valor), nivel)
        con_defensa = sorted(cue for cue in validas if referencias.get(cue, {}).get("localidad") in ("CORRIENTES", "GOYA", "ESQUINA"))
        grupos.append({"estacionId": estacion, "fecha": fecha, "nivelM": nivel, "escena": meta["id"], "distanciasM": dict(sorted(validas.items())), "alturasEstudioM": alturas, "escuelasConDefensa": con_defensa})
    salida.write_text(json.dumps(grupos, ensure_ascii=False, indent=2) + "\n")
    print(f"{sum(len(g['distanciasM']) for g in grupos)} escuelas, {len(grupos)} escenas: {salida}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("estudio", type=Path)
    parser.add_argument("--salida", type=Path, default=Path("lib/infraestructura/riesgo/antecedentes-crecida-s2.json"))
    args = parser.parse_args()
    exportar(args.estudio, args.salida)
