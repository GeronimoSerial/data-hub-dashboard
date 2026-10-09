"""Job offline: descarga y recorte a Corrientes de las capas fuente de inundacion v2 (T1).

Uso reproducible (desde services/geo-static/; PYTHONPATH=src es necesario porque el
paquete no se instala editable, ver pyproject.toml [tool.uv] package = false):
    PYTHONPATH=src uv run python -m geo_static.jobs.descargar_fuentes_inundacion
    PYTHONPATH=src uv run python -m geo_static.jobs.descargar_fuentes_inundacion --force

Escribe en services/geo-static/.data/ (gitignored):
- jrc_flood/rp{N}_depth.tif para N en 10, 20, 50, 75, 100, 200, 500
- gsw/occurrence.tif
- dem/glo30.tif
- manifest.json (URLs, sha256, fecha de descarga y licencia por salida)

Idempotente: una capa cuya salida y entrada de manifest existen se omite. --force
la vuelve a descargar.
"""

from __future__ import annotations

import argparse
import time

from geo_static.fuentes_inundacion import DATA_DIR, descargar_fuentes


def _progreso(mensaje: str) -> None:
    print(f"[descargar_fuentes_inundacion] {mensaje}", flush=True)


def correr(force: bool = False) -> None:
    t0 = time.monotonic()
    _progreso(f"destino: {DATA_DIR} (force={force})")
    manifest = descargar_fuentes(force=force, progreso=_progreso)
    _progreso(
        f"listo: {len(manifest['entradas'])} entradas en manifest, "
        f"tiempo total: {time.monotonic() - t0:.1f}s"
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--force",
        action="store_true",
        help="vuelve a descargar y recortar aunque la salida y su entrada de manifest existan",
    )
    args = parser.parse_args(argv)
    correr(force=args.force)


if __name__ == "__main__":
    main()
