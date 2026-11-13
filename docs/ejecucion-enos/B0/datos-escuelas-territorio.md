# B0.1 y B0.4: escuelas y territorio de Manaos

Fecha de la investigación: 13/11/2026. Solo fuentes públicas. Los archivos descargados se guardaron fuera del repositorio y no se ejecutó nada de ellos. Las cifras salen de scripts de análisis de una sola vez, no de código del repositorio. Este documento no es asesoramiento legal.

Área provisional (`config/regiones/manaos.json`, decisión M0.4: se mantiene): latitud -3,7 a -2,3, longitud -60,8 a -59,2.

## Resultado para el criterio CA1 (≥ 80 % de escuelas con coordenadas utilizables)

**CA1 no se cumple con datos abiertos.** Ninguna fuente abierta encontrada entrega latitud y longitud con el código INEP de la escuela. El cruce exploratorio por nombre, CEP y dirección con el CNEFE 2022 del IBGE llegó a 41 %, pero incluía coincidencias por CEP que en zona rural pueden quedar a decenas de kilómetros. Por decisión del dueño («ninguna escuela mal ubicada es mejor que más escuelas»), los datasets de B12.1 asignan coordenadas solo con coincidencias confiables y el resultado es **126 de 1.765 escuelas en actividad (7 %)** en los 12 municipios del área; las otras 1.639 quedan con coordenadas nulas. Alcanzar 80 % exige un archivo con código INEP y coordenadas de la SEDUC-AM o de la SEMED (B0.6, a cargo del dueño) o el Catálogo de Escolas del INEP exportado por su portal. El script acepta ese archivo y le da precedencia (ver sección 5).

## 1. Escuelas

### 1.1 Fuentes revisadas

| Fuente | URL | Coordenadas | Código INEP | Licencia | Fecha del dato | Resultado |
|---|---|---|---|---|---|---|
| Censo Escolar 2024, microdatos | https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_2024.zip | No (426 columnas, ninguna de lat/lon) | Sí (`CO_ENTIDADE`) | No declarada en el archivo; el sitio del INEP indica CC BY-ND 3.0 para su contenido. Tratar como no verificada | 2024 (zip modificado el 08/07/2026) | Base de identidad. El zip de 2025 devuelve 404 |
| Catálogo de Escolas del INEP | https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/inep-data/catalogo-de-escolas/ | Sí (según el portal) | Sí | No declarada | Sin dato | Es un portal BI (Oracle Analytics, `anonymousdata.inep.gov.br`) sin endpoint de descarga encontrado: no sirve para un script reproducible |
| CNEFE 2022 (IBGE), espécie 4 (enseñanza) | https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/13_AM/ | Sí, 100 % de los registros | No (nombre libre en `DSC_ESTABELECIMENTO`) | Datos abiertos del IBGE; términos exactos no verificados, citar la fuente | Publicado el 20/05/2024 | **Mejor opción**: 62 zips, 28 MB, uno por municipio |
| OpenStreetMap `amenity=school` | Overpass API (`overpass-api.de`) | Sí | Solo 16 de 749 tienen `ref=INEP-<código>` | ODbL | Vivo, 13/11/2026 | 749 en AM, 554 en el área; sirve como complemento, no como clave |
| Base dos Dados (tabla de escuelas) | https://basedosdados.org | Sin verificar | Sin verificar | Sin verificar | Sin dato | La página no se pudo leer |
| Datos de Alagoas con `cod_inep` y coordenadas | https://dados.al.gov.br | Sí | Sí | Abierta | 2022/2023 | Solo precedente estatal; no es AM |

Nota técnica: `download.inep.gov.br` sirve la cadena de certificados incompleta, por lo que `curl` estricto falla (error 60). La descarga se hizo con `-k` y se verificó con el MD5 publicado en el mismo servidor (`04d691fe6d8d744de65f21ed65068ad6` para el CSV de 2024). Un script reproducible debe verificar ese MD5 y no desactivar la validación sin dejarlo dicho.

### 1.2 Conteo de escuelas en actividad

Base: Censo Escolar 2024, `SG_UF=AM`, `TP_SITUACAO_FUNCIONAMENTO=1` (en actividad), `CO_ENTIDADE` único.

- Amazonas: 6.181 registros, 5.542 en actividad, 62 municipios.
- Manaus: 1.107 registros, 1.060 en actividad.
- Registros CNEFE espécie 4: 7.052 en AM, 1.743 en Manaus, 2.138 dentro del área. Superan a las escuelas porque incluyen CMEI, centros de formación y refuerzo escolar.

### 1.3 Resultado del cruce confiable por municipio (datasets de B12.1)

Los 12 municipios cuyo contorno interseca el área (sección 2). El conteo es de **todo** el municipio; las coordenadas que caen fuera del área provisional se anulan.

Niveles de calidad (`geoCalidad`), de mayor a menor precedencia:

| Nivel | Regla |
|---|---|
| `seduc` | Archivo de la SEDUC-AM o la SEMED con código INEP y coordenadas (opcional; hoy no existe) |
| `osm-ref-inep` | OpenStreetMap con `ref=INEP-<código>` igual al código de la escuela |
| `cnefe-nombre-calle` | Nombre idéntico dentro del municipio y calle compatible, con candidatos a menos de 200 m entre sí |
| `cnefe-nombre` | Nombre idéntico y sin calle comparable (hoy ninguna escuela cae aquí) |
| `osm-calle` | Coincidencia por calle y número en CNEFE y un único nombre idéntico en OSM a menos de 500 m de ese punto |

Nunca se usa el CEP. Un nombre idéntico con calle contradictoria o con candidatos dispersos no se acepta.

| Municipio | Escuelas en actividad | Con coordenadas | % | Niveles |
|---|---|---|---|---|
| Manaus | 1.060 | 98 | 9 % | cnefe-nombre-calle 79, osm-calle 6, osm-ref-inep 13 |
| Manacapuru | 166 | 9 | 5 % | cnefe-nombre-calle 8, osm-calle 1 |
| Itacoatiara | 144 | 1 | 1 % | cnefe-nombre-calle 1 |
| Iranduba | 69 | 3 | 4 % | cnefe-nombre-calle 3 |
| Autazes | 58 | 0 | 0 % | |
| Careiro | 54 | 6 | 11 % | cnefe-nombre-calle 6 |
| Careiro da Várzea | 54 | 1 | 2 % | cnefe-nombre-calle 1 |
| Manaquiri | 45 | 1 | 2 % | cnefe-nombre-calle 1 |
| Presidente Figueiredo | 34 | 0 | 0 % | |
| Rio Preto da Eva | 29 | 7 | 24 % | cnefe-nombre-calle 7 |
| Novo Airão | 28 | 0 | 0 % | |
| Itapiranga | 24 | 0 | 0 % | |
| **Total** | **1.765** | **126** | **7 %** | cnefe-nombre-calle 106, osm-ref-inep 13, osm-calle 7 |

Cifras de la corrida del 13/11/2026, guardadas también en `metadatos.resumen` del dataset `localizaciones`. Itacoatiara, Itapiranga, Novo Airão y Presidente Figueiredo se extienden mucho más allá del área, por eso aportan pocas coordenadas dentro de ella.

**Cruce exploratorio previo (no usado).** Con las reglas más laxas (nombre idéntico, CEP más similitud de nombre, calle y número) se obtuvieron coordenadas para 41 % de las escuelas de 16 municipios (bbox de los polígonos). En una revisión visual de 20 pares, 12 eran correctos o probables, 6 inciertos y 2 dudosos, y la regla por CEP en zona rural puede errar por decenas de kilómetros. Por eso no se usa.

## 2. Límites municipales del IBGE (B0.4)

| Dato | Valor |
|---|---|
| Fuente | Malha Municipal 2025, https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/UFs/AM/AM_Municipios_2025.zip (26,8 MB; modificado el 26/02/2026). Existe también la edición 2022 en la misma estructura |
| Formato | Shapefile, 62 municipios |
| Sistema de referencia | SIRGAS 2000 (EPSG:4674), prácticamente idéntico a WGS 84 para este uso |
| Atributos | `CD_MUN` (7 dígitos), `NM_MUN`, `CD_UF`, `SIGLA_UF`, `AREA_KM2`, entre otros. Codificación declarada en el `.cpg`: UTF-8 |
| Licencia | El índice del FTP dice «Todos os arquivos aqui disponíveis são públicos»; el `LEIA-ME.txt` condiciona el uso a la «Nota Metodológica» del IBGE, que el portal no sirvió a este cliente (403). No se encontró una licencia CC explícita: leer esa nota antes de redistribuir. Citar «Fonte: IBGE» |
| Recuperación | 13/11/2026 |
| Servicio de malhas (API) | `servicodados.ibge.gov.br` no respondió desde este entorno (tiempo de espera agotado en el puerto 443), por eso se usa el FTP. SHA-256 del zip 2025: `6be84c61a9ad3c8510ea91b36a5da3b1860b580e5d3ddd29a6700c04a8e09b92`; edición 2022: https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2022/UFs/AM/AM_Municipios_2022.zip |

Municipios cuyo contorno interseca el área (12, con prueba exacta de vértice, arista y esquina; el resultado es el mismo con las ediciones 2022 y 2025): Manaus (1302603), Iranduba (1301852), Manacapuru (1302504), Manaquiri (1302553), Careiro (1301100), Careiro da Várzea (1301159), Autazes (1300300), Rio Preto da Eva (1303569), Presidente Figueiredo (1303536), Itacoatiara (1301902), Itapiranga (1302009) y Novo Airão (1303205). Nhamundá, Urucará, São Sebastião do Uatumã y Nova Olinda do Norte tienen la caja delimitadora superpuesta con el área pero el polígono no la toca.

Código de Manaus confirmado: 1302603.

## 3. FABDEM (B0.4, licencia)

| Tema | Hallazgo | Fuente | Estado |
|---|---|---|---|
| Licencia | «The FABDEM dataset is licensed under a Creative Commons CC BY-NC-SA 4.0 license»; el readme agrega «non-commercial and ShareAlike» y «may not be used for commercial purposes» | https://data.bris.ac.uk/datasets/25wfy0f9ukoge2gs7a5mqpq2j7/readme.txt | Primaria, leída |
| Conflicto en los metadatos | Según resultados de búsqueda, las fichas de Bristol listarían además la «Non-Commercial Government Licence» (Reino Unido), pero las páginas no cargaron | https://data.bris.ac.uk/data/dataset/s5hqmjcdj8yo2ibzi9b4ew3sn | **Sin verificar** |
| «No comercial» | «Not primarily intended for or directed towards commercial advantage or monetary compensation». Se define por el propósito, no por quién usa el dato | https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en, sección 1 | Primaria, leída |
| Compartir igual | El material adaptado que se comparta debe licenciarse con la misma licencia o una compatible (sección 3(b)) | Ídem | Primaria, leída |
| Capa de exposición publicada en el mapa | Si esa capa es «material adaptado» y está «compartida» es una cuestión legal que la licencia no resuelve | Análisis | Interpretación |
| Uso gubernamental | La licencia no tiene excepción para gobiernos; un servicio público gratuito es plausiblemente no comercial, pero no está establecido | Ídem | Sin confirmar |
| Atribución | «FABDEM is produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved», más indicar las modificaciones | Readme | Primaria, leída |
| Descarga | Mosaicos de 10° × 10° (ejemplo `N51E005_FABDEM_V1-0.tif`), 1 arco-segundo (~30 m), cobertura 60° S a 80° N | Readme | Primaria, leída |
| Licencia comercial | Sin términos publicados para FABDEM; Fathom ofrece FABDEM+ por API y portal. Contacto citado por un espejo: fabdem@fathom.global (sin verificar) | https://www.fathom.global/product/global-terrain-data-fabdem/ | Parcial |

Alternativas con licencia permisiva:

| Modelo | Licencia | URL | Estado |
|---|---|---|---|
| Copernicus DEM GLO-30 | «Free & Open»: reproducción, adaptación y comunicación al público sin restricción de uso comercial ni compartir igual; exige el aviso de atribución y de no responsabilidad (art. 6) | https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf ; acceso en https://registry.opendata.aws/copernicus-dem/ | Verificada |
| NASADEM | Sin restricciones de reutilización según LP DAAC; se pide citar | https://lpdaac.usgs.gov/documents/2237/NASADEM_User_Guide_V13.pdf | Parcial |
| SRTM | Se describe como dominio público | https://www.earthdata.nasa.gov/learn/use-data/data-use-policy | Sin verificar |
| MERIT Hydro | CC BY-NC 4.0 o ODbL (a elección), con registro; 3 arco-segundos | https://hydro.iis.u-tokyo.ac.jp/~yamadai/MERIT_DEM | Parcial |

**Decisión del dueño (13/11/2026): FABDEM aprobado para uso no comercial.** El uso es del Ministerio de Educación de Corrientes, educativo y sin fines de lucro, por lo que CC BY-NC-SA 4.0 es aceptable. Condiciones:

- Atribución obligatoria donde se muestren capas derivadas de FABDEM: «FABDEM, University of Bristol / Fathom», con el enlace a la licencia (https://creativecommons.org/licenses/by-nc-sa/4.0/) y el aviso de Copernicus del readme, indicando que hubo modificaciones.
- Compartir igual: cualquier derivado redistribuido (por ejemplo capas de elevación o terreno exportadas) debe llevar la misma licencia.
- Queda pendiente confirmar el campo de licencia de la ficha de Bristol, que según la búsqueda podría mencionar además la «Non-Commercial Government Licence» del Reino Unido (sin verificar).

Copernicus GLO-30 sigue siendo el modelo por defecto del perfil territorial de Manaos. El batch B12.4 (perfil con FABDEM) queda desbloqueado en lo legal; su implementación no forma parte de F3.

## 4. Fuentes adicionales (orden del dueño del 13/11/2026)

| Fuente | Uso propuesto | Licencia | Fecha |
|---|---|---|---|
| CNEFE 2022, IBGE (espécie 4) | Coordenadas de escuelas por cruce con el INEP | Datos abiertos del IBGE, citar la fuente | 13/11/2026 |
| OpenStreetMap `amenity=school` | Complemento para escuelas que el CNEFE no resuelve | ODbL (exige atribución y compartir igual de la base de datos derivada) | 13/11/2026 |
| Malha Municipal 2025, IBGE | Límites municipales y máscara | Abierta del IBGE, citar | 13/11/2026 |

## 5. Reproducción

El script `scripts/datasets-manaos.mjs` convierte las descargas públicas en los datasets:

```bash
# Directorio nuevo FUERA del repositorio; los archivos descargados son datos no confiables.
node scripts/datasets-manaos.mjs descargar --dir /tmp/manaos-datos
node scripts/datasets-manaos.mjs construir --dir /tmp/manaos-datos [--seduc archivo.csv]
pnpm region:cargar manaos
```

- `descargar` baja la malla del IBGE, los microdatos del INEP (verifica el MD5 publicado; el servidor del INEP tiene la cadena de certificados incompleta y exige un agente de usuario de navegador), los 62 zips del CNEFE de AM y las escuelas de OSM por Overpass (que rechaza agentes de navegador con 406).
- `construir` escribe `data/regiones/manaos/{localizaciones,departamentos,mascara}.json` (formato de `region:cargar`) y `public/data/{municipios-manaos,mascara-manaos}.geojson`. Las claves de los datasets son las fijas de la aplicación (`localizaciones`, `departamentos`, `mascara`).
- `--seduc` acepta un CSV con `CO_ENTIDADE` y `LATITUDE`/`LONGITUDE` (o `lat`/`lon`); esas coordenadas tienen precedencia sobre todas las demás y se marcan `seduc`.
- Las pruebas usan fragmentos reales grabados en `scripts/__fixtures__/manaos/`, nunca la red.
