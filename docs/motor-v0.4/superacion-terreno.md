# Superación del terreno por crecida del Paraná (Motor v0.4, T6/U5)

Código: `lib/infraestructura/riesgo/motor-v04/transferencia-nivel.ts`, `superacion-terreno.ts`, `terreno-adaptador.ts`; integración en `jobs/calcular-riesgo-v04.ts` (sólo corrida candidata).

## Qué se calcula

Para cada escuela y horizonte de 24, 72 y 240 h:

```
P(máximo de la cota del agua en el sitio durante la ventana ≥ cota del terreno)
```

Se calcula en dos escenarios:

- `principal`: cota del terreno = p10 espacial de Copernicus (convertido en forma aproximada a SRVN16).
- `conservador`: cota = la menor estimación admisible (IGN o Copernicus). Es un escenario identificado, no una cota más precisa.

Estado `modelada`, método `analogos-v2+transferencia-km`, versión `superacion-terreno-v1`.

## Método

1. **Tramo aprobado.** La localidad de la escuela (`ge.ge_localizacion`) tiene que pertenecer a un tramo `aprobada` de `tramos-prefectura`. La estación de ese tramo tiene que ser uno de los dos hidrómetros que encierran a la escuela. La escuela nunca se asigna por cercanía.
2. **Km de río.** Se toman las estaciones interpolables, es decir las del Paraná que tienen cero de escala, km de río y coordenada declarada por PNA. La escuela se proyecta sobre el segmento recto entre su estación y la estación vecina (plano equirectangular, la misma cuenta que `anomaliaInterpolada` de v0.3). El resultado es `t ∈ [0, 1]` y `km = km_arriba + t·(km_abajo − km_arriba)`. Si la estación es interior y la escuela queda junto a ella, del lado de afuera de ambos segmentos (por ejemplo en un recodo), se usa el nivel de esa estación. Si queda más allá de un extremo del tramo interpolable, la escuela queda fuera.
3. **Cota del agua en el sitio.** Es la interpolación lineal por km de `(cero + h)` de las dos estaciones en la misma fecha. Los metros de escala nunca se comparan con el DEM sin el cero.
4. **Trayectorias.** Se usa el ensamble conjunto `analogos-v2` (ver `modelo-temporal.md`). La referencia es la estación del tramo y la compañera es el otro hidrómetro. Las dos usan las mismas fechas análogas. Cada fecha en la que ambas estaciones tienen la ventana completa da un miembro, con una trayectoria de cota en el sitio para los días asOf+1 … asOf+10. P es la fracción de miembros cuyo máximo en la ventana alcanza la cota. Como las ventanas comparten miembros, `P(24) ≤ P(72) ≤ P(240)`. Una cota menor nunca baja P.
5. **Nivel actual (h0).** Se toma la serie diaria A5 (`hidro_serie_diaria`) hasta asOf en fecha local UTC−3. Si `hidro_lectura` (Prefectura, mismo hidrómetro y misma escala) tiene una lectura consistente con medida ≤ asOf y de una fecha posterior al último diario, se agrega. Un día que ya está en A5 conserva el valor de A5. Si la lectura tiene más de 2 días, el resultado es `no_estimable` con `nivel_actual_no_disponible`.

Sólo se usa información con fecha ≤ asOf. Una prueba verifica que agregar datos futuros no cambia el resultado.

## Qué no es

- **No es agua dentro del edificio.** No hay cota de piso relevada. `cotaIngresoEdificio` sigue nula con `umbral_ingreso_no_disponible`.
- **No modela defensas** (terraplenes, muros), ni la conexión real del terreno con el cauce. Se supone conexión hidráulica con el cauce principal. El diagnóstico lo registra con `conexionHidraulicaSupuesta` y `defensasNoModeladas`.
- **Datum.** Los ceros INA se suponen en datum IGN histórico (sin verificar). El terreno está en SRVN16 (Copernicus convertido en forma aproximada). Esa diferencia no se corrige: queda registrada con `datumCeroSupuesto: true`.
- Las coordenadas de las estaciones son las declaradas por PNA (`verificada: false`). La distancia `distanciaEjeKm` se mide al segmento recto entre estaciones, no a la costa.

Diagnóstico por estimación modelada: `cotaM`, `kmRio`, `t`, `distanciaEjeKm`, `estacionReferencia`, `estacionCompanera`, `miembros`, `fueraDeRangoHistorico` (de v2), `datumCeroSupuesto`, `conexionHidraulicaSupuesta`, `defensasNoModeladas`.

## Motivos de `no_estimable`

| Motivo | Causa |
|---|---|
| `sin_coordenadas`, `coordenada_invalida`, `perfil_geografico_pendiente` | Ubicación de la escuela no utilizable (este motivo va primero) |
| `sin_tramo_aprobado` | La localidad no tiene tramo aprobado |
| `rio_sin_transferencia` | El tramo es del Uruguay |
| `sin_cero_escala` / `sin_km_rio` | A la estación del tramo le falta el cero o el km |
| `estacion_sin_coordenadas` | La estación no tiene coordenada declarada |
| `fuera_de_tramo_interpolable` | La escuela queda aguas arriba de Corrientes, aguas abajo de Esquina o fuera del par que la encierra |
| `nivel_actual_no_disponible`, `analogos_insuficientes`, `analogos_lejanos`, `sin_miembros_completos` | El modelo temporal no estima en alguna de las dos estaciones |
| `cota_terreno_pendiente`, `cota_conservadora_pendiente`, `principal_sin_copernicus`, `revisar_georreferencia`, `sin_fuente_valida` | Falta altimetría para el escenario |
| `insumos_terreno_no_disponibles`, `ubicacion_escuela_no_disponible` | El puerto no pudo cargar los insumos o la ubicación |

La cobertura de la corrida (`metadatos.cobertura.abstencionesPorMotivo`) cuenta estos motivos. El job además informa `conSuperacionTerreno` en los contadores.

## Cobertura actual

Catálogo `ina-a5-2026-10-17.1`. Los hidrómetros interpolables son Corrientes (km 1208), Empedrado (1140), Bella Vista (1057), Goya (972) y Esquina (853). Las localidades con tramo aprobado en ese tramo son: CORRIENTES, RIACHUELO, EMPEDRADO, BELLA VISTA, GOYA, PUERTO BOCA y ESQUINA. Según el padrón de `data/natalidad`, son como máximo unas 432 escuelas (CUE/anexo). Las de Corrientes ubicadas aguas arriba de la estación y las de Esquina ubicadas aguas abajo quedan `fuera_de_tramo_interpolable`. La cifra real se conoce recién con una corrida.

Hoy no son estimables:

- Ituzaingó, Apipé Grande y Paso de la Patria/Ensenadita, por falta de cero.
- Itá Ibaté, Itatí y Ramada Paso, por falta de km.
- Todo el Uruguay, por falta de transferencia.

## Cómo extender

- **Ceros faltantes** (Paso de la Patria, Ituzaingó, estaciones del Uruguay): publicarlos en una versión nueva del catálogo A5, con fuente y datum declarados. La transferencia los toma sin cambios de código.
- **Km faltantes** (Itatí, Itá Ibaté): derivar el progresivo a lo largo del eje del río IGN, encadenado al km oficial de Corrientes. Documentarlo como derivado (fuente, método y error esperado) y no como km del boletín SSPVN.
- **Uruguay**: requiere ceros, km y una decisión sobre embalses (Salto Grande) antes de habilitar `rio`.
- **Defensas y datum**: corregirlos cambia la cota comparada. Tiene que ser una versión nueva de `superacion-terreno`, no un ajuste silencioso.
