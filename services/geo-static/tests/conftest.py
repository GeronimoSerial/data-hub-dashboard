"""Referencias aisladas para pruebas; nunca son un fallback de producción."""
import json
from pathlib import Path
import pytest
from geo_static import datasets

ROOT = Path(__file__).resolve().parents[3]

@pytest.fixture(autouse=True)
def referencias_de_prueba(monkeypatch):
    monkeypatch.setenv("GEO_STATIC_EXPORT_FILES", "1")
    referencias = {
        "departamentos": ROOT / "public/data/departamentos-corrientes-georef-2026-09-27.geojson",
        "localizaciones": ROOT / "public/data/localizaciones.json",
        "cabeceras-departamentales": Path(__file__).parent / "fixtures/cabeceras_departamentales.json",
        "localidades-urbanas": Path(__file__).parent / "fixtures/localidades_urbanas.json",
    }
    monkeypatch.setattr(datasets, "_ENTRADAS", {id: {"version": {"id": "fixture-" + id}, "documento": json.loads(p.read_text())} for id, p in referencias.items()})
    monkeypatch.setattr(datasets, "_PENDIENTES", [])
