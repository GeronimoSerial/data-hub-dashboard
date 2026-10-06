import json
from pathlib import Path

import pytest

from geo_static.localidades import cargar_localidades_urbanas


def test_filtra_localidades_con_menos_de_2000_habitantes(tmp_path: Path) -> None:
    archivo = tmp_path / "localidades.json"
    archivo.write_text(
        json.dumps(
            {
                "localidades": [
                    {"nombre": "Pequeña", "lat": -28.0, "lon": -58.0, "poblacion": 1999},
                    {"nombre": "Grande", "lat": -28.1, "lon": -58.1, "poblacion": 2001},
                ]
            }
        ),
        encoding="utf-8",
    )

    localidades = cargar_localidades_urbanas(archivo)

    assert [localidad["nombre"] for localidad in localidades] == ["Grande"]


def test_el_umbral_de_2000_habitantes_es_inclusivo(tmp_path: Path) -> None:
    archivo = tmp_path / "localidades.json"
    archivo.write_text(
        json.dumps(
            {"localidades": [{"nombre": "Umbral", "lat": -28.0, "lon": -58.0, "poblacion": 2000}]}
        ),
        encoding="utf-8",
    )

    assert len(cargar_localidades_urbanas(archivo)) == 1


def test_archivo_inexistente_falla_con_mensaje_claro(tmp_path: Path) -> None:
    archivo = tmp_path / "no-existe.json"

    with pytest.raises(FileNotFoundError, match="localidades"):
        cargar_localidades_urbanas(archivo)


def test_json_versionado_tiene_localidades_validas_de_corrientes() -> None:
    ruta = Path(__file__).parents[1] / "data" / "localidades_urbanas.json"
    localidades = cargar_localidades_urbanas(ruta)

    assert len(localidades) == 51
    for localidad in localidades:
        assert localidad["nombre"]
        assert localidad["poblacion"] >= 2000
        assert -30.8 <= localidad["lat"] <= -26.8
        assert -59.7 <= localidad["lon"] <= -55.6
