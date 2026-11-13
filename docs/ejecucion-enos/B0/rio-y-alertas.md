# B0 — Río y alertas de Manaos (B0.2, B0.3, B0.5, B0.7)

Fecha de relevamiento: 13/11/2026. Fuentes públicas, sin credenciales. Los archivos
descargados se trataron como datos no confiables (nada se ejecutó). Los fixtures
quedan recortados en el repositorio; cada uno indica su URL y cómo se recortó.

## Veredicto

| Subtarea | Resultado |
|---|---|
| B0.2 estaciones ANA | **Hay API programática sin autenticación** (`telemetriaws1.ana.gov.br`, servicio SOAP/GET heredado de ANA). Estación clave: **14990000 Manaus (Porto), Río Negro**. |
| B0.3 puerto de Manaus (SGB) | **Hay fuente programática sin autenticación**: SACE del SGB publica la cota de «MAO - Manaus» en un CSV estable, cada 15 min. |
| B0.5 estaciones virtuales | **No verificado**: DAHITI exige API key; Hydroweb.next es una SPA sin API pública hallada. No bloquea nada (ver más abajo). |
| B0.7 alertas INMET | **No hay CAP.** Sí hay un JSON público no documentado (`/avisos/ativos`) con geocódigos IBGE por aviso. El RSS por municipio devuelve HTTP 500. |

**CA2 de B0 (≥ 1 fuente de nivel de río con acceso programático confirmado): cumplido, con dos fuentes.** G2 es posible.
G3 es posible con la advertencia de que la fuente es una API no oficial (ver B0.7).

## B0.2 — Estaciones ANA

Servicio: `http://telemetriaws1.ana.gov.br/ServiceANA.asmx` (HTTP sin TLS en el
relevamiento; `https://` también responde).

`HidroInventario` con rango de códigos `14000000`–`14999999` devolvió 75 estaciones
dentro del bbox provisional (lat −3,7…−2,3; lon −60,8…−59,2). Lista completa:
dataset `estacoes-ana` (`scripts/` de G2). Las más relevantes:

| Código | Estación | Río | Lat | Lon | Telemetría | Período |
|---|---|---|---|---|---|---|
| **14990000** | Manaus (Porto) | Negro | −3,1383 | −60,0272 | sí, operando | escala 1902-09…2014-06; telemetría desde 2001-06 |
| 14100000 | Manacapuru | Solimões-Amazonas | −3,3106 | −60,6094 | sí, operando | escala y descarga desde 1972-06; telemetría desde 2001-06 |
| 14070000 | Manacapuru Montante | Solimões-Amazonas | −3,5181 | −60,7944 | no | descarga desde 2014-01 |
| 14101000 | Iranduba | Solimões-Amazonas | −3,2681 | −60,2156 | no | escala desde 2012-11 |
| 14911000 | Tatu Paricatuba | Negro | −3,0594 | −60,2653 | no | escala desde 2010-11 |
| 14900050 | Novo Airão | Negro | −2,6250 | −60,9364 | no | escala desde 2014-11 |

Careiro y Ponta do Ipixuna no figuran en el inventario del bbox.

### APIs de ANA

| API | URL | Autenticación | Formato | Verificado (13/11/2026) |
|---|---|---|---|---|
| Inventario | `…/ServiceANA.asmx/HidroInventario?codEstDE=&codEstATE=` | ninguna | XML DataSet | HTTP 200; **sólo el filtro por rango de códigos funciona** (los filtros `nmRio`/`nmEstado` devuelven «Sem dados») |
| Datos hidrometeorológicos | `…/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao=14990000&dataInicio=dd/mm/aaaa&dataFim=dd/mm/aaaa` | ninguna | XML DataTable (`DataHora`, `Nivel`, `Vazao`, `Chuva`) | HTTP 200; un día ≈ 60 KB (96 filas de 15 min), un año ≈ 10,7 MB |
| HidroWeb REST | `https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas/OAUth/v1` | **sí** (identificador y contraseña; alta por correo a ANA) | JSON | la ruta existe; GET → 400, POST sin credenciales → 405. No se probó el flujo con credenciales |
| Dados Abertos ANA | `https://dadosabertos.ana.gov.br/` | ninguna (descarga) | archivos | sin API CKAN (`package_list` → 404) |

Notas de la respuesta de `DadosHidrometeorologicos` (fixture
`lib/infraestructura/hidrometria/__fixtures__/ana/dados-14990000-2026-11-12_13.xml`,
recortado a 24 filas):

- Orden **descendente** por fecha; `DataHora` trae un espacio final (`2026-11-13 00:45:00 `).
- `Nivel` en **cm** (1628.00 = 16,28 m); `Vazao` viene vacío en Manaus.
- Hora local de Manaus (UTC−4), sin zona explícita: asumido, no documentado.
- Al relevar, el último dato de ANA era `00:45` mientras SACE ya mostraba `01:45`: ANA rezaga ≈ 1 h o difieren en zona. A confirmar antes de fijar la regla de frescura.
- No se hallaron límites de tasa ni cadencia documentados; la cadencia observada es de 15 min.

## B0.3 — Puerto de Manaus (SGB / SACE)

Sistema: SACE (Sistema de Alerta de Eventos Críticos) del Serviço Geológico do Brasil.
Estación «MAO - Manaus» (pm=8, s=33, sr=106; lat −3,13667, lon −60,02694).

| Elemento | Detalle |
|---|---|
| Página | `https://sace.sgb.gov.br/niveis/relatorio.php?apenas_grafico=sim&bacia=amazonas&pm=8&s=33&sr=106` (HTML) |
| **CSV de cotas** | `https://sace.sgb.gov.br/niveis/api/dados/amazonas_8_cota.csv`, sin autenticación, `data_hora_medicao;indice` |
| Contenido del CSV | 2 890 filas (≈ 30 días móviles), paso de 15 min, cota en **cm**; verificado 13/11/2026 (último dato `2026-11-13 01:45:00;1628.00`) |
| Umbrales en la página | alerta 2 700 cm, inundación 2 750 cm, inundación severa 2 900 cm (situación «Normal» al relevar) |
| Autenticación / límites | ninguna / no publicados |

El mapeo `MAO - Manaus` ↔ ANA `14990000` se infiere por nombre y coordenadas, **no** por una tabla oficial.
Fixture: `lib/infraestructura/hidrometria/__fixtures__/sgb/sace-manaos-cota-2026-11-12_13.csv` (cabecera + últimas 60 filas).

Los boletines PDF semanales del SGB no se abrieron; no se usan.
`rhasso.sgb.gov.br` no resuelve.
Pendiente de B0.6 (dueño): confirmar con SGB/SEMPOR si el CSV de SACE es un canal estable y de uso permitido.

## B0.5 — Estaciones virtuales (Hydroweb / SWOT / DAHITI)

| Fuente | Resultado |
|---|---|
| DAHITI API v2 (`https://dahiti.dgfi.tum.de/api/v2/`) | HTTP 403 sin clave (`No api_key found`); requiere registro. Formatos json/csv/netcdf/ascii. |
| Hydroweb.next (`https://hydroweb.next.theia-land.fr/`) | SPA (Next.js); sin lista de estaciones en el HTML ni ruta API pública hallada. |
| Hydroweb (Theia) clásico | no conectó desde este entorno |
| SWOT, GSW | no consultados |

No se pudo listar ninguna estación virtual en el bbox. **No bloquea:** hay dos fuentes
in situ (ANA y SGB). Queda como mejora (nivel en tramos sin regla) para un batch posterior; requiere registro en DAHITI o una sesión de navegador sobre Hydroweb.next.

## B0.7 — Alertas INMET

| Feed | URL | Resultado |
|---|---|---|
| **Avisos activos y futuros** | `https://apiprevmet3.inmet.gov.br/avisos/ativos` | HTTP 200, JSON `{hoje:[…], futuro:[…]}`, 179 KB. Sin autenticación. **Exige `User-Agent` de navegador y HTTP/1.1** (curl simple fue reseteado). |
| RSS por municipio | `…/avisos/rss/1302603` (Manaus) y `…/rss/1300029` (control) | **HTTP 500** `TypeError: Cannot read property 'xml' of null`; roto para AM. |
| Aviso por id | `…/avisos/28690` | 404 |
| CAP/IDAP Defesa Civil | `alerta2.inmet.gov.br`, `idapdefesacivil.com.br` | no resuelven; `alertas2.inmet.gov.br` resetea la conexión. Sin CAP verificado. |

Campos de cada aviso: `id`, `id_aviso`, `codigo` (OID estilo CAP, p. ej. `urn:oid:2.49.0.0.76.0.2026.28690.1`),
`inicio`/`fim` (`aaaa-mm-dd HH:MM`), `severidade` («Perigo Potencial»), `aviso_cor`, `descricao`
(«Tempestade»), `riscos`, `instrucoes` (cadenas con forma de lista), `estados`, `municipios`
(`Nombre - UF (geocódigo)`), `geocodes` (códigos IBGE de 7 dígitos, separados por coma),
`poligono` (GeoJSON en cadena), `encerrado`, `alterado`, `updated_at`.

- Selección para Manaus: `geocodes.split(',').includes('1302603')`. No comparar por nombre.
- Al relevar: el aviso del día (Tempestade, amarillo) cubría 2 343 municipios, 46 de AM, **sin** Manaus; el futuro no incluía AM.
- Cadencia no observable (`created_at`/`updated_at` con granularidad de día).
- Es una API **no documentada**: puede cambiar sin aviso. Los avisos de INMET no son CAP; el CAP de B16.4 es otra cosa.

Fixture: `lib/infraestructura/radar-meteo/__fixtures__/inmet/avisos-ativos-2026-11-13.json`
(respuesta real recortada: `geocodes`/`municipios` limitados a los 46 de AM + 2, `poligono` a 6 vértices, `icone` vacío, `micro/mesorregioes` truncadas a 80 caracteres).

## Husos horarios de las marcas de tiempo (inferido, 13/11/2026)

A las 04:29 UTC (01:29 en Brasília, 00:29 en Manaus) se leyó:

- ANA `DadosHidrometeorologicos`: última marca `00:45`, cota 1 628 cm.
- SACE CSV: última marca `01:45`, misma cota 1 628 cm; sin fila nueva 15 min antes (rezago).

Una marca de ANA en hora de Manaus (UTC−4) quedaría en el futuro; en Brasília (UTC−3) da un rezago de ≈ 44 min. SACE muestra la misma lectura con una hora de diferencia, coherente con un servidor que etiqueta en UTC−2 (tzdata desactualizado con horario de verano). Por eso los clientes asumen **ANA = UTC−3** y **SACE = UTC−2**, como constantes (`ANA_OFFSET_HORAS`, `SACE_OFFSET_HORAS`) fáciles de corregir. **No confirmado**: debe validarse con varios días de datos (el ciclo diario de nivel es demasiado lento para fijar el huso con una sola muestra). El job descarta como inconsistente toda lectura con marca posterior a «ahora + 15 min».

## Qué cambiar en el plan y la configuración (a cargo de N1/N2-F)

- `plan-batches-enos.md`, B0.2/B0.3/B0.7: marcar resueltos con este documento. B0.5: «no verificado, no bloquea».
- `plan-batches-enos.md`, B12.3: la fuente de alertas de Manaos es el JSON `avisos/ativos` (no CAP); B12.2 usará el CSV de SACE para `sgb` y `DadosHidrometeorologicos` para `ana`.
- `config/regiones/manaos.json`: sin cambios necesarios en `fuentesRio` (`ana`, `sgb`) ni `fuentesAlertas` (`inmet`).

## Pendientes y no verificado

- Cadencia real de actualización y desfase ANA/SGB; zona horaria de `DataHora`.
- Flujo con credenciales de HidroWeb REST (no se necesita mientras el servicio heredado siga abierto).
- Términos de uso de los tres servicios para consumo programático (B0.6).

## Estado de implementación G2 (B12.2, 13/11/2026)

- Dataset `estacoes-ana`: `scripts/estacoes-ana.mjs` (reproducible; lee `HidroInventario` de ANA y filtra por `bboxPlausible`) genera `data/regiones/manaos/estacoes-ana.json` (75 estaciones). Entrada nueva en `DATASETS_REFERENCIA` (`lib/infraestructura/datasets/catalogo.ts`). Falta la carga con `region:cargar manaos`: requiere `cargaDatasets: [{ "clave": "estacoes-ana", "archivo": "data/regiones/manaos/estacoes-ana.json" }]` en `config/regiones/manaos.json` y quitar `estacoes-ana` de `datasetsPendientes` (a cargo de N1/N2-F).
- Clientes: `hidrometria/ana/cliente-ana.ts` (XML de ServiceANA) y `hidrometria/sgb/cliente-sace.ts` (CSV de SACE), probados contra los fixtures grabados.
- Jobs: `sync-ana-niveis` (`12 * * * *`, ventana de 48 h por estación telemétrica) y `sync-sgb-niveis` (`27 * * * *`). Escriben en `hidro_lectura` con `fuente` `ana` / `sgb` mediante `guardarLecturasPrefectura` (opción nueva `fuente`; sin ella rige el default `prefectura`, Corrientes igual que antes). Aplican por `fuentesRio` (`sync-ana-*` requiere `ana`, `sync-sgb-*` requiere `sgb`), sin campo `aplicaA`. Filas en `deploy/regiones/scheduler-jobs.md` («pendiente de crear en Coolify»).
- Proveedores `ana` y `sgb` en `PuertoNivelRio` (`motor/adaptadores/rio-ana-sgb.ts`), registrados en `jobs/compartido-riesgo.ts`; varias fuentes de una región se combinan (`combinarProveedoresRio`: gana la evidencia, luego el primer «sin dato»). Con el registro genérico sin `combinar`, varios proveedores siguen lanzando el error de antes.
- Umbrales (decisión técnica, a confirmar con el dueño): Manaus alerta = 27,00 m y `evacuacion` = 29,00 m (inundación severa de SACE); la cota de «inundación» de 27,50 m de SACE queda sin uso. Otras estaciones no tienen umbrales: devuelven «sin dato».
- **Limitación consciente:** un colegio sólo recibe evidencia de río si tiene `distanciaKm` al río ≤ 1 km (`infra_geo_rio`) y una estación a ≤ 60 km. Mientras Manaos no tenga datos de ribera (B12.4/B14), el motor no recibe exposición de río: no se inventó ninguna. Los niveles sí se sincronizan y alimentan frescura y volumen en el Centro de Situación.
- `periodo_horas` es entera: las lecturas de 15 min lo guardan en `null`.

## Estado de implementación G3 (B12.3, 13/11/2026)

- Adaptador `lib/infraestructura/radar-meteo/inmet-alertas.ts` (`syncInmetAlertas`) sobre el JSON `avisos/ativos`; job `sync-inmet-alertas` (`9-59/15 * * * *`, «pendiente de crear en Coolify»), aplica sólo si `fuentesAlertas` incluye `inmet`. No es CAP: la hipótesis CAP de B0.7 quedó descartada.
- Convención de SMN: los avisos se guardan en la misma tabla `smn_alerta` con id `inmet:<codigo>`; los consumidores (API de alertas, resumen, agrupación) los leen sin cambios. Un aviso es relevante si sus `geocodes` incluyen algún id de las unidades administrativas de la región (en Manaos, los códigos IBGE de los 12 municipios).
- Marcas de tiempo `inicio`/`fim` interpretadas como hora de Brasília (UTC−3), supuesto sin confirmar.
- Barrido: lo que ya no figura en el feed (instantánea de avisos activos y futuros) y no venció se marca cancelado; sólo toca ids `inmet:`, nunca filas de SMN.
- Fuente no oficial: el titular lleva «(aviso não oficial, fonte INMET)». Falla blanda: un error HTTP o de forma registra la corrida fallida y la salud `no_disponible`/`degradado` con mensajes fijos, sin tocar los avisos ya guardados.
- No se mapeó INMET en `veredicto/salud-fuentes.ts` (el tipo `FuenteVeredicto` es una unión cerrada de `veredicto/reglas.ts`); decisión de producto pendiente.
- El filtro de pertenencia no se reevalúa en el barrido: un aviso modificado para dejar de incluir Manaus sigue activo hasta que INMET lo retire del feed.
