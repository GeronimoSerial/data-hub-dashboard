# Metodología del mapa y motor operativo

La pestaña Metodología de `/mapas/infraestructura` describe el cálculo operativo
publicado por `jobs/calcular-riesgo.ts`. La implementación es la referencia cuando
un documento histórico describe una etapa anterior.

## Criterios de la página

- Versión, reglas, pesos, umbrales, topes y pisos se importan de `motor/config.ts`.
  Los horizontes se derivan de `DIAS_POR_HORIZONTE_V04`; las cadencias, de
  `riesgo/cadencias.ts`; la lluvia provisoria, de `peligro/umbrales-provisorios.ts`.
- Las fórmulas de combinación, historial, susceptibilidad y acceso se construyen
  con esas constantes. La lluvia observada reutiliza `valorLluviaObservada` y el
  respaldo de Prefectura, `valorAmenazaRio`.
- `calculo-simulador.test.ts` compara scores, pesos efectivos y confianza con
  `calcularRiesgoEscuela({ reglas: 'v0.4' })`: tres horizontes, combinaciones de
  faltantes, redondeos, pisos y bordes de probabilidad. También contrasta la
  fórmula publicada y el cálculo de la superficie con el núcleo.
- El simulador numérico recibe el alcance observado ya resuelto. No genera
  trayectorias INA, altimetría, altura crítica ni polígonos de defensas. Permite
  elegir alcance completo, reducido o ninguno para explicar sus consecuencias.
  Supone perfil territorial válido y aislamiento disponible. Los tests de la
  página verifican el cableado de controles y la regla de acceso separada.

## Diferencias entre documentos y código

| Referencia | Diferencia encontrada | Criterio aplicado en la metodología |
| --- | --- | --- |
| `integracion-v03.md`, “Decisión”, “Una sola ruta de código” y cierre de “Promoción y retiro” | Afirma que sólo cambia el factor río y que, sin P principal, el resultado es idéntico al anterior. El núcleo operativo aplica además las reglas actuales de susceptibilidad JRC, historial ausente, combinación de vulnerabilidad, precipitación por ventana y caudal por horizonte. | La ausencia de P vuelve al río observado con reglas actuales de alcance; no vuelve a las reglas anteriores del score. |
| `integracion-v03.md`, `superacion-terreno.md`, encabezados de `auditoria-v03.md` y `validacion-historica.md` | Presentan v0.4 como candidato y el motor anterior como operativo. Esas etapas fueron superadas por `promocion.md`, `MOTOR_VERSION`, `flags.ts` y el job operativo. | Se muestra la versión operativa importada y su versión de reglas; las etapas históricas no aparecen como método vigente. |
| Comentarios de `motor/calculo.ts`, `motor/config.ts`, `motor/tipos.ts` e `insumos-operativo-v04.ts` | Algunos todavía dicen “job operativo no cambia”, “sólo candidato” o “río anterior sin cambios”. El comportamiento depende de `reglas`; el job operativo pasa siempre las actuales. | Se sigue el flujo ejecutable, sin modificar el motor ni sus comentarios históricos en este cambio. |
| `integracion-v03.md`, “Pisos observados” | Describe los pisos de Prefectura sin la compuerta actual de alcance. `calculo.ts`, `exposicion-v04.ts` y `altura-critica.ts` distinguen alcance completo, reducido y ninguno, con evidencia seca S2 y ajuste por defensa. | Se explican esos tres alcances y se distinguen los pisos observados de los probabilísticos. `defensas-costeras.md` sí describe el ajuste actual. |
| `superacion-terreno.md`, “Qué no es” | Dice que no se modelan defensas. Sigue siendo cierto para la P de superación, pero no describe por sí solo el score completo. | Se aclara que las defensas modifican el alcance para pisos observados; no corrigen la P ni los pisos probabilísticos. No se presenta la P como ingreso al edificio o interrupción educativa. |
| `auditoria-v03.md`, F9 | Registra la posible mezcla de períodos incompletos en los percentiles del pronóstico. `peligro/nivel.ts` y `fuente-climatologia.ts` siguen eligiendo por percentil dentro de cada fuente; no garantizan un único período. La lluvia observada sí agrupa por período en las reglas actuales. | Se mantiene la afirmación acotada de que no se mezclan percentiles IMERG con ERA5. No se promete un período único para el pronóstico ni se cambia esa selección. |
| `motor-v04/config.ts` | `CONFIG_V04.modoInicial` conserva `candidato`, pero `calcular-riesgo.ts` publica metadatos `modo: 'operativo'` y la versión operativa. | La etiqueta de la página sigue al job publicado, no al valor histórico de configuración usado en el hash. |

La metodología anterior del frontend también estaba desactualizada: mostraba
pesos de amenaza sin río, lluvia proporcional a una saturación fija, mezcla de
indicadores físicos, el producto que podía borrar la amenaza y una versión de
motor anterior. Esos contenidos se reemplazaron por las reglas ejecutadas.

## Validación y reversión

Las pruebas usan fixtures y entornos temporales locales. La inspección visual usa
un montaje aislado del componente con sus estilos, sin levantar servicios de
aplicación ni consultar fuentes operativas.

El cambio se revierte como una unidad: componentes y pruebas de metodología,
prueba de montaje en `map-client.test.tsx`, ajuste de ancho para los porcentajes
en sus estilos y esta nota. La vigencia máxima de series INA se comparte desde `motor/config.ts` y se
reexporta en su módulo original, sin cambiar su valor ni la lógica del motor.
