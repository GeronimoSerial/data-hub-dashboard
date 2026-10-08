"""Clase de riesgo de inundacion fluvial por rio (modelo v2).

Funciones puras: reciben profundidades ya leidas (metros) por periodo de
retorno y devuelven la clase. No hacen I/O raster. El lector debe convertir
nodata de JRC a 0.0 (seco) antes de llamar; None significa fuera de cobertura
o error de lectura.
"""

from __future__ import annotations

# Profundidad minima (metros) para considerar que un periodo de retorno
# "alcanza" el rio. Por debajo de este valor el punto cuenta como no alcanzado.
UMBRAL_PROFUNDIDAD_M = 0.15

# Periodos de retorno (anios) que determinan la clase.
RP_ALTO = 10
RP_MEDIO = 100
RP_BAJO = 500

CLASE_ALTO = "alto"
CLASE_MEDIO = "medio"
CLASE_BAJO = "bajo"
CLASE_SIN_RIESGO = "sin_riesgo"
CLASE_SIN_DATO = "sin_dato"


def clasificar_rio(
    profundidades: dict[int, float | None],
    margenes: dict[int, float | None] | None = None,
) -> str:
    """Clasifica un rio segun la profundidad alcanzada en RP10, RP100 y RP500.

    Reglas, en orden:
    - Si falta alguno de los tres periodos o es None: "sin_dato".
    - Alcanza RP10: "alto".
    - Alcanza RP100: "medio".
    - Alcanza RP500: "bajo".
    - Ninguno: "sin_riesgo".

    Un periodo "alcanza" el rio si su profundidad es >= UMBRAL_PROFUNDIDAD_M y,
    cuando se pasan `margenes`, su margen de terreno es negativo (el suelo queda
    por debajo del nivel del rio mas la subida). Margen None (sin evidencia) no
    bloquea: el periodo cuenta solo por profundidad.

    No se exige monotonia entre periodos: la primera condicion que se cumple
    gana.
    """
    periodos = (RP_ALTO, RP_MEDIO, RP_BAJO)
    if any(profundidades.get(rp) is None for rp in periodos):
        return CLASE_SIN_DATO

    if _alcanza(profundidades, margenes, RP_ALTO):
        return CLASE_ALTO
    if _alcanza(profundidades, margenes, RP_MEDIO):
        return CLASE_MEDIO
    if _alcanza(profundidades, margenes, RP_BAJO):
        return CLASE_BAJO
    return CLASE_SIN_RIESGO


def _alcanza(
    profundidades: dict[int, float | None],
    margenes: dict[int, float | None] | None,
    rp: int,
) -> bool:
    if profundidades[rp] < UMBRAL_PROFUNDIDAD_M:
        return False
    if margenes is None:
        return True
    margen = margenes.get(rp)
    return margen is None or margen < 0
