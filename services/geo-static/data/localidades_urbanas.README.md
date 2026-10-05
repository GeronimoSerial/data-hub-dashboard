# Localidades urbanas de Corrientes

Este conjunto versionado reúne localidades de Corrientes asociadas a municipios con 2.000 habitantes o más según el Censo 2022. Quedaron 51 localidades. La población informada corresponde al municipio asociado, no a la localidad individual: **población del municipio, incluye población dispersa; se usa como aproximación al umbral urbano de 2.000 habitantes**.

## Fuentes

- **Población:** Instituto de Modernización e Innovación, Provincia de Corrientes; datos del Censo Nacional de Población, Hogares y Viviendas 2022, INDEC. Publicación: 10/10/2024. [Archivo CSV de población municipal](https://estadistica.corrientes.gob.ar/get_file/Viv_Particulares_Censo2022.csv). Licencia: Creative Commons Attribution 4.0 (CC BY 4.0).
- **Coordenadas:** Georef Argentina, API de localidades, provincia de Corrientes. [Consulta utilizada](https://apis.datos.gob.ar/georef/api/localidades?provincia=Corrientes&max=1000&campos=id,nombre,centroide,departamento.nombre,categoria). Fecha de consulta: 2026-10-04. Georef aporta el nombre, departamento, identificador y centroide; no aporta población.

## Criterio de cruce

Se seleccionaron los municipios con población 2022 igual o superior a 2.000, excluyendo `INDETERMINADO`. Los nombres se normalizaron a mayúsculas, sin tildes y con espacios colapsados, y se cruzaron con las localidades Georef dentro del mismo departamento. Los 44 cruces exactos fueron únicos. Para siete nombres se aplicaron estas equivalencias explícitas, todas dentro del mismo departamento:

| Municipio del censo | Localidad Georef | ID Georef |
| --- | --- | --- |
| CAA CATI | Nuestra Señora del Rosario de Caá Catí | 18063030 |
| COLONIA LIEBIG | Colonia Liebig's | 18084010 |
| CONCEPCION DEL YAGUARETE CORA | Concepción | 18028010 |
| GOBERNADOR MARTINEZ | Gobernador Juan E. Martínez | 18091020 |
| GOBERNADOR VIRASORO | Gobernador Igr. Valentín Virasoro | 18168030 |
| SANTA ANA DE LOS GUACARAS | Santa Ana | 18133040 |
| YATAY TI CALLE | Yatayti Calle | 18091060 |

El archivo JSON registra estas equivalencias en `equivalencias`. Cada localidad conserva el nombre Georef con tildes, el departamento, `georef_id`, el nombre del municipio del censo, su población y el centroide Georef sin modificar.

## Municipios que no cruzan

Estos cuatro municipios superan el umbral, pero no se incluyen entre las localidades porque no tienen una correspondencia inequívoca en Georef. No se asignaron coordenadas inventadas.

| Municipio | Departamento | Población 2022 | Motivo |
| --- | --- | ---: | --- |
| PAGO DE LOS DESEOS | Saladas | 2.259 | No existe una localidad correspondiente en Georef. |
| SAN ANTONIO DE ITATI | Berón de Astrada | 2.808 | En Georef solo figura como localidad censal de «Berón de Astrada»; la correspondencia es ambigua. |
| SAN ISIDRO | Goya | 5.366 | No existe una localidad correspondiente en Georef. |
| TRES DE ABRIL | Bella Vista | 3.048 | No existe una localidad correspondiente en Georef. |
