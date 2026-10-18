import csv
from pathlib import Path
from geo_static.datasets import exportar_archivos, guardar_resultados, tipo_desde_nombre


def escribir_csv(path: Path, columnas: list[str], filas) -> str | Path:
    filas = list(filas)
    if not exportar_archivos():
        tipo = tipo_desde_nombre(path.name)
        return guardar_resultados(tipo, filas, str(filas[0].get("fuente", "geo-static")), path.stem)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as archivo:
        writer = csv.DictWriter(archivo, fieldnames=columnas)
        writer.writeheader()
        writer.writerows(filas)

    return path
