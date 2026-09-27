# Revisión N3 — G1-fix2 (cruces de agua + Dijkstra batched)

Revisor independiente, solo lectura. Rama `feat/enos-g1`.

## 1) Fix del bug de NaN (`_primer_valor`/`_tiene_puente`/`_tiene_ford`)
Correcto. `_primer_valor` normaliza `NaN`→`None` (incluso tras tomar `[0]` de una lista);
un `bridge`/`ford` no tageado deja de clasificarse como puente. `np.float64('nan')` es
subclase de `float`, así que `math.isnan` lo captura (pyrosm entrega float64; verificado).
`TestReproduccionBugTodosLosCrucesSonPuente` reproduce el síntoma exacto. Observación:
`es_ford` (de `_tiene_ford`) no se lee en ninguna rama; solo importa `con_puente`, porque
vado confirmado y cruce desconocido se cuentan juntos. El fix es correcto pero inerte.
## 2) Equivalencia `calcular_metricas_departamento` vs. por-escuela
Equivalente en los 4 casos del contrato. `reverse(copy=False)` preserva `length`; la ruta
cabecera→escuela revertida es una ruta escuela→cabecera de longitud mínima, y la
alcanzabilidad sobre `grafo_seguro_invertido` equivale a `has_path`. Casos:
puente+alternativa (vado=0, idx 1), vado sin alternativa (idx 3), vado con alternativa
(idx 2), sin cruce (idx 0): todos coinciden. `TestCalcularMetricasDepartamentoEquivalencia`
los cubre.
## 3) Riesgos / edge cases / objeciones
- **Empates de camino más corto (principal):** con varias rutas de igual longitud,
  `shortest_path` bidireccional y `single_source_dijkstra` pueden elegir caminos distintos
  → distinto `cruces_agua_count`/`tramos`. El test usa caminos únicos y no lo ejercita; la
  corrida real de CAPITAL (0 diferencias en conteos) lo respalda empíricamente, pero no
  está garantizado por el algoritmo.
- **Falso positivo por solapamiento:** una vía que corre junto/sobre el agua produce
  `intersection` LineString y su `centroid` se cuenta como cruce. Sin test; riesgo real al
  incluir `drain`.
- **Dedup con grados:** `* 111_000` sobreestima distancias en longitud (~99 km/grado a lat
  −27.5) → puede no deduplicar cruces cercanos E-O. El comentario ("111 km en longitud en
  esta region") es incorrecto. Impacto bajo.
- **Unidades de snap (pre-existente, fuera del fix):** grafo sin proyectar;
  `nearest_nodes(..., return_dist=True)` daría grados, comparados contra 5000 m y
  exportados como metros → umbral muerto. Compartido por ambos motores: no rompe la
  equivalencia, pero sí el contrato del campo.
- Menores: `intersection` de MultiLineString usa un único centroide (podría fusionar dos
  cruces de una arista); `assert obtenido == esperado` no contempla ruido float 1e-9 real.
## 4) Veredicto: APROBADO CON OBSERVACIONES
El fix del NaN es correcto y la equivalencia batched se sostiene en los 4 casos. Antes de
cerrar el gate: documentar el riesgo de empates de camino y evaluar el falso positivo por
vía solapada. Ninguno bloquea el merge ni el índice 2.
