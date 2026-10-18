# Evaluación U8: candidato Motor v0.4 frente al operativo v0.3

Fecha: 2026-10-17 (hora local; el `asOf` en UTC ya es 2026-10-18). Estado: **evaluación sin promoción**. `MOTOR_VERSION` sigue en `motor-v0.3`.

## Cómo se hizo la reproducción con datos reales

- **Run de referencia**: el run vigente de prod `75273aab-…` (`motor-v0.3`), `asOf = 2026-10-18T02:15:04.970Z`, publicado 02:16:55Z. Tiene 6.003 snapshots (2.001 escuelas con coordenadas × 24/72/240 h).
- **Harness local**, fuera del repositorio. Corre el código de esta rama (`calcularRiesgoEscuela`, los puertos reales de `compartido-riesgo.ts` con caché, `estimarSuperacionTerreno`, `ensambleConjuntoV2`) al mismo `asOf`, con estas fuentes:
  - **Insumos v0.3, padrón, tramos aprobados y última lectura de Prefectura**: se leen de prod en sesiones `default_transaction_read_only = on` con `statement_timeout = 60 s`, y sólo con SELECT. El harness verifica el modo de sólo lectura antes de empezar. El DDL idempotente `ensureGeSchema` se anula en el harness porque `ge.*` ya existe en prod y fallaría en modo de sólo lectura.
  - **Altimetría**: `Motor v0.4/datos/elevacion-conservadora-candidata.csv`, evaluado con la misma función del importador de T2 (`evaluarFilaCsvAltimetria`).
  - **Series A5**: las descargas diarias de T5 (hasta 2026-10-16), normalizadas con el parser de T3 y recortadas a ≤ `asOf`. Se fusionan con la lectura de Prefectura del 2026-10-17: Corrientes 6,77 m, Empedrado 5,67, Bella Vista 5,75, Goya 5,22, Esquina 4,33. Esta corrida no hizo solicitudes nuevas a A5.
- **Desvío respecto del plan**: el plan pedía copiar las filas a una PGlite local. Se leyó prod directamente en modo de sólo lectura porque el universo depende del esquema `ge.*`, que está fuera de drizzle, y de unas 15 tablas de insumos. Las consultas son las mismas que haría el job y no se generó ninguna copia de datos.
- **Fidelidad**: el v0.3 recalculado coincide con el snapshot vigente de prod en las **6.003/6.003 filas**, tanto en nivel como en score (0 diferencias). La reproducción es fiel, así que toda diferencia de v0.4 se debe al factor río probabilístico.
- **Consistencia de la sensibilidad**: el mapeo puro (`motor-v04/sensibilidad.ts`) con los umbrales vigentes (0,5/0,2) reproduce el nivel v0.4 del motor en 6.003/6.003 filas.

## Cobertura de `superacionTerreno` (cota principal)

Universo: 2.005 CUE. La cobertura es igual en los tres horizontes.

| Estado | Escuelas |
|---|---|
| `modelada` | **456** (Corrientes 313, Goya 67, Bella Vista 30, Esquina 17, Empedrado 14, Riachuelo 10, Puerto Boca 5) |
| `sin_tramo_aprobado` | 1.273 (+4 con `revisar_georreferencia`) |
| `rio_sin_transferencia` | 162 (+2) |
| `sin_cero_escala` | 55 |
| `sin_km_rio` | 30 (+1) |
| `fuera_de_tramo_interpolable` | 18 |
| `sin_coordenadas` | 4 (sin fila v0.3; nivel null) |

En las 456 escuelas modeladas la cota conservadora también queda `modelada`.

## Niveles v0.3 frente a v0.4

| h | v0.3 bajo/mod/alto/muy alto | v0.4 bajo/mod/alto/muy alto | sube | baja | igual |
|---|---|---|---|---|---|
| 24 | 1.852 / 121 / 28 / 0 | 1.852 / 121 / 28 / 0 | 0 | 0 | 2.001 |
| 72 | 1.852 / 121 / 28 / 0 | 1.851 / 121 / 29 / 0 | 1 | 0 | 2.000 |
| 240 | 1.852 / 121 / 28 / 0 | 1.851 / 121 / 29 / 0 | 1 | 0 | 2.000 |

Ninguna escuela baja de nivel. De las 456 modeladas, 455 tienen P = 0 en los tres horizontes: con Corrientes en 6,77 m, por encima de la alerta (6,5 m), ninguna de esas escuelas tiene la cota del terreno al alcance de los análogos.

Escuelas que cambian de nivel:

| CUE | Localidad | h | v0.3 → v0.4 | P principal / conservadora | Causa |
|---|---|---|---|---|---|
| 1800185-00 | Esquina | 72 | bajo → alto | 0,65 / 0,65 | piso probabilístico (P ≥ 0,5) |
| 1800185-00 | Esquina | 240 | bajo → alto | 0,70 / 0,70 | piso probabilístico |

La misma escuela, a 24 h, tiene P = 0,15 y queda en bajo. Datos de la escuela: cota 26,45 m, a 57 m del eje del río, junto al hidrómetro de Esquina (cero 22,03 m). Por lo tanto el terreno se supera con 4,42 m de escala, y la lectura actual es 4,33 m. El score sin piso es 6–7: el componente 100×P casi no pesa porque la amenaza se multiplica por la vulnerabilidad. **El cambio de nivel lo produce el piso.**

## Sensibilidad a los umbrales provisorios

Número de filas escuela×horizonte que cambian de nivel frente a v0.3, calculado sin volver a correr el motor (`sensibilidadUmbrales`):

| P_alto \ P_moderado | 0,1 | 0,2 | 0,3 |
|---|---|---|---|
| 0,3 | 3 | 2 | 2 |
| 0,5 | 3 | **2** (vigente) | 2 |
| 0,7 | 3 | 2 | 2 |

Con P_moderado 0,1 se suma la fila de 24 h de la misma escuela (bajo → moderado). En este `asOf` el resultado casi no depende de los umbrales, porque sólo una escuela tiene P > 0. Esto describe un día y no calibra los umbrales: hace falta repetir la evaluación sobre crecidas pasadas (ver condiciones de promoción).

## Desempeño hidrológico (T5b)

El detalle está en `docs/motor-v0.4/modelo-temporal.md`, sección `analogos-v2`. En el período retenido 1990–2026, promediando las estaciones, el BSS frente a climatología (sin descontar abstenciones) es 0,91 / 0,81 / 0,63 para la alerta a 24/72/240 h y 0,90 / 0,74 / 0,53 para la evacuación. La ventaja frente a persistencia es chica (alerta a 240 h: 0,20). En Corrientes, alerta a 240 h: BSS 0,72 [0,60; 0,78]. Ese desempeño corresponde a los umbrales de las estaciones; **no hay ninguna verificación a nivel escuela**.

## Brechas conocidas

- **Sin calibración escolar** (`estadoCalibracionEscolar: pendiente`): no existen observaciones de agua en el terreno de las escuelas.
- **Defensas no modeladas** (`defensasNoModeladas: true`): la conexión hidráulica se supone. En Corrientes ciudad y en Goya hay defensas que pueden hacer que P sobrestime.
- **Datum supuesto**: los ceros INA se toman como SRVN71 y la cota de las escuelas como SRVN16 con conversión aproximada de Copernicus. La incertidumbre es de decímetros y es justo del orden del margen de la escuela de Esquina (0,09 m).
- **Cobertura sólo Corrientes–Esquina** sobre el Paraná: 456 de 2.005 escuelas. Quedan fuera Ituzaingó, Paso de la Patria (sin cero), todo el Uruguay y las escuelas sin tramo aprobado.
- **Empedrado**: alerta 6,5 m y evacuación 6,7 m (catálogo A5). En la serie A5 hay un hueco de 1964 a 1993. Desde 1994 la alerta sólo se alcanzó en 1997–98 (máximo 6,76 m en 1998). En la crecida de 2016 Corrientes llegó a 7,45 m y Empedrado a 6,24 m. Después de 1999, Empedrado lee en promedio 0,25 m menos que Corrientes, pero comparte con Corrientes el umbral de alerta de 6,5 m. Por eso el umbral es alto para la escala de Empedrado y casi no se supera: la evaluación T5 no tuvo excedencias puntuables. El máximo aparente de la serie (12,89 m el 2026-10-02) es **dato espurio**: entre el 2026-09-28 y el 2026-10-02 la serie oscila 12,44 / 0,58 / 5,74 / 0,14 / 12,89 m mientras Corrientes marca unos 4,1–4,3 m. Hay que confirmar el umbral con Prefectura y agregar un filtro de picos aislados en la serie diaria antes de promover. La superación del terreno no usa el umbral de alerta, pero sí usa la serie, que entra en los análogos y en la transferencia por km.
- **Contexto de acceso diferido** (T7): `interrupcionEducativa` sigue `no_estimable`.

## Condiciones de promoción (decisión del usuario)

1. Aprobar los umbrales del piso probabilístico (`UMBRAL_P_ALTO_V04`, `UMBRAL_P_MODERADO_V04`) o reemplazarlos, y fijar una versión de mapeo no provisoria (`RIO_V04_MAPEO_VERSION`).
2. Evaluar con reproducciones retrospectivas en crecidas (por ejemplo 2014–2016 y 2023) que v0.4 no omite escuelas que v0.3 marcaba por observación (los pisos observados se conservan por diseño) y que la cantidad de escuelas que suben es razonable.
3. Filtrar los picos aislados de la serie A5 (caso de Empedrado) y aclarar el umbral de Empedrado.
4. Aceptar de forma explícita las brechas de datum y defensas, o recortar la cobertura (por ejemplo, excluir los barrios con defensa) mientras falte la cota de piso.
5. Correr el candidato en paralelo con el operativo cada 6 h durante al menos dos semanas, sin errores, con fidelidad v0.3 = 100 % fuera de la cobertura v0.4 y con revisión de cada cambio de nivel.

## Procedimiento de promoción y retiro de v0.3 (no ejecutado)

Se hace en un solo PR, con un solo despliegue y con reversión preparada:

1. **Bandera**: agregar `MOTOR_RIO_V04_ACTIVO` (por defecto `false`). El job operativo `calcular-riesgo` pasa la evidencia probabilística a `calcularFilasEscuela` sólo cuando la bandera está activa. Para eso usa el mismo cálculo de superación que hoy usa `calcular-riesgo-v04.ts`, extraído a `compartido-riesgo.ts`.
2. **Versión**: con la bandera activa, el run operativo se escribe con `MOTOR_VERSION = 'motor-v0.4'`, y `publicar-run.ts` acepta `motor-v0.4` operativo. Sigue rechazando `modo = 'candidato'`, y el CHECK de la migración 0024 queda igual.
3. **Retiro de la ruta río v0.3**: donde la superación es `modelada`, el factor `altura_rio` deja de persistirse. Esto ya pasa en el motor único. La ruta río v0.3 se conserva sólo como respaldo donde no hay estimación, porque así lo decidió el usuario.
4. **Publicación transaccional**: el nuevo run se publica con el publicador existente, que en una transacción marca `vencido` el vigente anterior y `vigente` el nuevo. Se registra el id del último run v0.3 como referencia de reversión.
5. **Reversión**: apagar la bandera. El siguiente bloque de 6 h vuelve a publicar `motor-v0.3`. Hoy el publicador sólo publica runs en `preparando`, así que no puede volver a publicar un run `vencido`. Si se quiere una reversión inmediata, hay que agregar una operación explícita y auditada de "restaurar vigente" (`vencido` → `vigente` del run v0.3 registrado) o forzar una corrida v0.3 fuera de bloque.
6. **Candidato**: después de dos semanas estables, el job `calcular-riesgo-v04-candidato` se desactiva y se retira junto con la bandera.
7. **Validación después del despliegue**: comparar el primer run v0.4 operativo con el último v0.3 usando `motor-v04/comparacion.ts`. Fuera de la cobertura v0.4 el resultado debe ser idéntico.

## Reproducibilidad

El harness no se versiona porque lee prod. Para repetirlo hace falta: run vigente de prod, `asOf` = `iniciado_en` del run, puertos reales contra prod en sesión de sólo lectura (anulando `ensureGeSchema`), altimetría del CSV y series A5 ≤ `asOf`. Se compara con `compararNivelesV03V04` y se calcula la sensibilidad con `sensibilidadUmbrales`, usando como `scoreBase` una tercera corrida del motor con los umbrales P inalcanzables.
