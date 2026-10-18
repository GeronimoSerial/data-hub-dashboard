# Motor integral v0.4 en producción, staging y dev

## Alcance de v0.4

Se revisaron `motor/calculo.ts`, `jobs/calcular-riesgo.ts`,
`jobs/compartido-riesgo.ts` y `jobs/insumos-operativo-v04.ts` antes de modificar
las bases. v0.4 es el motor completo, no un resultado exclusivo del río que
deba sustituir la evaluación integral.

| Componente | Tratamiento en v0.4 |
|---|---|
| Peligro meteorológico | Se conserva por celda y horizonte |
| Caudal | Se conserva, ajustando la ventana al horizonte |
| Lluvia observada | Se conserva, con referencia climatológica cuando existe |
| Historial de afectaciones | Se conserva; una fuente ausente no se trata como cero antecedentes |
| Susceptibilidad | Se calcula con profundidad fluvial JRC RP100, corrigiendo la mezcla anterior de unidades |
| Riesgo de acceso | Se conserva como dimensión separada |
| Matrícula y secciones | Se conservan como exposición educativa |
| Río | Agrega probabilidad de superación del terreno; cuando es estimable reemplaza al factor anterior del río para no duplicarlo |
| Score integral | Se sigue calculando y persistiendo, con reglas v0.4 de vulnerabilidad y alcance del agua |

`resultado_v04` es detalle adicional por escuela y horizonte. Las columnas
`score_*`, `nivel_*`, confianza, exposición y la tabla completa de factores
siguen formando parte de la evaluación. Una abstención fluvial no elimina la
evaluación meteorológica ni convierte automáticamente toda la escuela en «sin datos».
Las reglas históricas del núcleo puro y sus pruebas de comparación se conservan.

## Operación realizada

Producción ya tenía publicada la corrida operativa v0.4
`35d77e75-2018-45fa-8d82-c1e986328d81`, calculada el 18/10/2026 a las
14:15 UTC. Staging y dev seguían con la corrida v0.3 del 16/10/2026.

Se validaron los 6.003 resultados de producción contra el contrato Zod v0.4,
los tres horizontes por escuela y la compatibilidad de los esquemas. Se respaldó
el alcance completo de las tablas de riesgo de staging y dev, y la corrida
vigente de producción, antes de escribir:

`/home/gero/backups/data-hub-v04-2026-10-18T16-15-40-554Z/`

Después se copió a staging y dev la corrida integral publicada en producción:
run, snapshots completos y todos los factores, dentro de una transacción por
destino. Se conservaron IDs, fechas, scores, metadatos y procedencia de producción.
No se recalculó con insumos incompletos ni se renombraron resultados v0.3 como v0.4.

| Base | Vigente | Resultados actuales | Factores actuales | Históricos |
|---|---|---:|---:|---|
| hub_prod | motor-v0.4 | 6.003 | 45.417 | Sin cambios |
| hub_staging | motor-v0.4 | 6.003 | 45.417 | 12.006 resultados y 81.946 factores anteriores conservados |
| hub_dev | motor-v0.4 | 6.003 | 45.417 | 12.006 resultados y 81.946 factores anteriores conservados |

Los hashes de todos los snapshots y factores anteriores de staging y dev
coinciden antes y después. Los hashes del contenido vigente coinciden entre
las tres bases. La evidencia agregada está en
[`verificacion.json`](../evidencia/motor-v04-unico-2026-10-18/verificacion.json).

Se aplicó y registró la migración `0029_riesgo_operativo_solo_v04` con Drizzle
en las tres bases y se validó su restricción. Una corrida v0.3 ya no puede
convertirse en vigente, aunque lo intente código desplegado que todavía admita
el selector antiguo. Esta restricción conserva los históricos. Los cambios
del selector y del publicador del código están en el workspace; no se hizo
un despliegue de aplicaciones ni se modificaron los túneles.

## Escuela 1800818-00

En la corrida v0.4 publicada, `superacionTerreno` tiene estado `no_estimable`
y motivo `sin_cero_escala` en 24, 72 y 240 horas. La altura histórica del estudio
y su distancia al agua no resuelven por sí solas esa referencia vertical ni
constituyen una distribución probabilística. Por tanto, actualizar la versión
de los datos no produce un porcentaje válido para esta escuela. Ese porcentaje
debe seguir ausente hasta resolver y validar el insumo del modelo fluvial.

## Verificación

- Pruebas del núcleo completo, publicación, selector, jobs y réplica: 382 aprobadas
  (373 en la ejecución ampliada y 9 al actualizar la fixture del candidato a un
  vigente v0.4 compatible con la nueva restricción).
- Réplica: igualdad de snapshots completos y factores, idempotencia, rechazo de
  origen v0.3, cobertura incompleta y reversión íntegra ante un factor inválido.
- Verificación real: tres bases con la misma corrida, hashes iguales y restricción validada.
- TypeScript, ESLint de los archivos modificados (incluidos los scripts con
  `--no-ignore`) y revisión de diferencias sin errores.
