import json
import pytest
from geo_static import datasets


def test_lecturas_se_fijan_a_la_primera_version(monkeypatch):
    datasets._ENTRADAS.clear()
    llamadas = []
    def ejecutar(script, args, entrada=None):
        llamadas.append(args)
        return {"version": {"id": "version-original"}, "documento": [{"cueAnexo": "escuela"}]}
    monkeypatch.setattr(datasets, "_node", ejecutar)
    assert datasets.leer_dataset("localizaciones") == datasets.leer_dataset("localizaciones")
    assert len(llamadas) == 1
    assert datasets.versiones_entrada() == ["version-original"]


def test_publica_salidas_juntas_con_sus_entradas(monkeypatch):
    capturas = []
    monkeypatch.setattr(datasets, "_node", lambda script, args, entrada: capturas.append(json.loads(json.dumps(entrada))) or [{"versionId": "nueva"}])
    datasets.guardar_resultados("aislamiento", [{"cue_anexo": "escuela"}], "OSM", "v1")
    datasets.guardar_resultados("geometria", [{"cue_anexo": "escuela"}], "OSM", "v1")
    assert capturas == []
    datasets.finalizar_corrida()
    assert len(capturas) == 1
    assert [salida["tipo"] for salida in capturas[0]] == ["aislamiento", "geometria"]
    assert capturas[0][0]["entradas"]
    assert datasets._PENDIENTES == []


def test_error_de_ingesta_no_descarta_pendientes(monkeypatch):
    datasets.guardar_resultados("geometria", [{"cue_anexo": "escuela"}], "OSM", "v1")
    def fallar(*args):
        raise RuntimeError("transporte fallido")
    monkeypatch.setattr(datasets, "_node", fallar)
    with pytest.raises(RuntimeError, match="transporte fallido"):
        datasets.finalizar_corrida()
    assert len(datasets._PENDIENTES) == 1


def test_sin_db_no_hay_fallback_silencioso_a_archivos(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="Falta DATABASE_URL"):
        datasets._node("datasets-infraestructura.mjs", ["leer", "localizaciones"])
