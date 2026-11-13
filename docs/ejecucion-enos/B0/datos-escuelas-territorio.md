# B0.1 y B0.4: escuelas y territorio de Manaos

Fecha de la investigación: 13/11/2026. Solo fuentes públicas. Los archivos descargados se guardaron fuera del repositorio y no se ejecutó nada de ellos. Las cifras salen de scripts de análisis de una sola vez, no de código del repositorio. Este documento no es asesoramiento legal.

Área provisional (`config/regiones/manaos.json`, decisión M0.4: se mantiene): latitud -3,7 a -2,3, longitud -60,8 a -59,2.

## Resultado para el criterio CA1 (≥ 80 % de escuelas con coordenadas utilizables)

**CA1 no se cumple con datos abiertos.** Ninguna fuente abierta encontrada entrega latitud y longitud con el código INEP de la escuela. La mejor ruta reproducible (cruce por nombre y dirección con el CNEFE 2022 del IBGE) alcanza **41 %** en los 16 municipios del área (805 de 1.968 escuelas en actividad) y **35 %** en Manaus. Con coincidencia exacta de nombre solo se llega a 18 % (354). Alcanzar 80 % exige un archivo con código INEP y coordenadas de la SEDUC-AM o de la SEMED (B0.6, a cargo del dueño) o el Catálogo de Escolas del INEP exportado por su portal.

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

### 1.3 Cruce INEP y CNEFE: escuelas con coordenadas por municipio del área

Los 16 municipios cuyo contorno toca el área (sección 2). El conteo es de **todo** el municipio, no solo de la parte dentro del área; varios municipios (Nhamundá, Urucará, Novo Airão, Presidente Figueiredo, São Sebastião do Uatumã) se extienden mucho más allá.

Reglas, aplicadas en orden y solo a las escuelas aún sin resolver: (a) nombre normalizado idéntico dentro del municipio; (b) mismo CEP y similitud de nombre (Jaccard de palabras ≥ 0,6); (c) calle y número iguales. Si los candidatos distan más de 200 m entre sí, se descarta.

| Municipio | Código IBGE | Escuelas en actividad | Con nombre idéntico (a) | Con coordenadas (a+b+c) | % |
|---|---|---|---|---|---|
| Manaus | 1302603 | 1.060 | 161 | 370 | 35 % |
| Manacapuru | 1302504 | 166 | 39 | 82 | 49 % |
| Itacoatiara | 1301902 | 144 | 19 | 57 | 40 % |
| Nova Olinda do Norte | 1303106 | 71 | 22 | 34 | 48 % |
| Iranduba | 1301852 | 69 | 8 | 29 | 42 % |
| Nhamundá | 1303007 | 65 | 18 | 33 | 51 % |
| Autazes | 1300300 | 58 | 5 | 28 | 48 % |
| Careiro | 1301100 | 54 | 17 | 24 | 44 % |
| Careiro da Várzea | 1301159 | 54 | 2 | 29 | 54 % |
| Manaquiri | 1302553 | 45 | 13 | 25 | 56 % |
| Urucará | 1304302 | 36 | 13 | 18 | 50 % |
| Presidente Figueiredo | 1303536 | 34 | 10 | 19 | 56 % |
| São Sebastião do Uatumã | 1303957 | 31 | 6 | 13 | 42 % |
| Rio Preto da Eva | 1303569 | 29 | 9 | 19 | 66 % |
| Novo Airão | 1303205 | 28 | 3 | 8 | 29 % |
| Itapiranga | 1302009 | 24 | 9 | 17 | 71 % |
| **Total** | | **1.968** | **354** | **805** | **41 %** |

En todo AM: 5.542 en actividad, 751 por nombre idéntico (13,6 %), 1.972 con la regla (b) (35,6 %), 2.087 con la regla (c) (37,7 %).

**Precisión.** En una revisión visual de 20 pares, 12 son correctos o probables, 6 inciertos y 2 dudosos. La regla (b) es la más débil en zonas rurales: un CEP rural cubre un municipio entero y el punto puede quedar a decenas de kilómetros. Ese punto exige una decisión antes de publicar coordenadas aproximadas en el mapa (ver el informe a N1).

## 2. Límites municipales del IBGE (B0.4)

| Dato | Valor |
|---|---|
| Fuente | Malha Municipal 2025, https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/UFs/AM/AM_Municipios_2025.zip (26,8 MB; modificado el 26/02/2026). Existe también la edición 2022 en la misma estructura |
| Formato | Shapefile, 62 municipios |
| Sistema de referencia | SIRGAS 2000 (EPSG:4674), prácticamente idéntico a WGS 84 para este uso |
| Atributos | `CD_MUN` (7 dígitos), `NM_MUN`, `CD_UF`, `SIGLA_UF`, `AREA_KM2`, entre otros. Codificación declarada en el `.cpg`: UTF-8 |
| Licencia | Datos abiertos del IBGE; texto de términos no verificado en esta sesión. Citar «Fonte: IBGE» |
| Recuperación | 13/11/2026 |
| Servicio de malhas (API) | `servicodados.ibge.gov.br` no respondió desde este entorno (tiempo de espera agotado), por eso se usa el FTP |

Municipios cuya caja delimitadora toca el área (16): Manaus (1302603), Iranduba (1301852), Manacapuru (1302504), Manaquiri (1302553), Careiro (1301100), Careiro da Várzea (1301159), Autazes (1300300), Rio Preto da Eva (1303569), Presidente Figueiredo (1303536), Itacoatiara (1301902), Itapiranga (1302009), Nova Olinda do Norte (1303106), Nhamundá (1303007), Urucará (1304302), São Sebastião do Uatumã (1303957) y Novo Airão (1303205). Se comprobó con la caja delimitadora de cada polígono, no con la geometría, así que algunos podrían tocar el área solo por la esquina.

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

Conclusión: Copernicus GLO-30 es la base sin riesgo de licencia para uso del Estado, a costa de conservar la altura de bosques y edificios (menos precisión en profundidad de inundación). FABDEM mejora la precisión pero su uso depende de un criterio legal («no comercial» y «compartir igual» sobre la capa publicada) que debe confirmar el área legal del ministerio o por escrito Bristol/Fathom. El batch B12.4 queda sujeto a esa respuesta.

## 4. Fuentes adicionales (orden del dueño del 13/11/2026)

| Fuente | Uso propuesto | Licencia | Fecha |
|---|---|---|---|
| CNEFE 2022, IBGE (espécie 4) | Coordenadas de escuelas por cruce con el INEP | Abierta del IBGE, citar | 13/11/2026 |
| OpenStreetMap `amenity=school` | Complemento para escuelas que el CNEFE no resuelve | ODbL (exige atribución y compartir igual de la base de datos derivada) | 13/11/2026 |
| Malha Municipal 2025, IBGE | Límites municipales y máscara | Abierta del IBGE, citar | 13/11/2026 |

## 5. Reproducción

Descargas con `curl` a un directorio nuevo fuera del repositorio; lectura con `python3 -I`. Para el INEP: `curl -k` más verificación del MD5 publicado. El script del repositorio que reproduce los datasets se documenta en F3.
