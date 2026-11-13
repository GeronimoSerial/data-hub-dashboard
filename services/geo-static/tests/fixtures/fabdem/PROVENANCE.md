# Fixture: FABDEM V1-2 crop (S04W061)

Archivo: `fabdem_v1-2_S04W061_crop.tif`

## Origen

- Dataset: FABDEM V1-2 (Forests And Buildings removed Copernicus DEM), Fathom.
- Archivo fuente: `S04W061_FABDEM_V1-2.tif`, dentro del zip
  `S10W070-N00W060_FABDEM_V1-2.zip`.
- URL: https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/S10W070-N00W060_FABDEM_V1-2.zip
- Version: V1-2 (tag `TITLE` del archivo: "FABDEM v1-2").
- Fecha de obtencion: 2026-11-13.
- Lectura remota con GDAL `/vsizip/vsicurl/`; solo se conservo el recorte.

## Recorte

- Ventana: 64 x 64 px centrada en lon -60.02, lat -3.12.
- Pixeles en el tile de origen (3600 x 3600, 0-based): columnas 3496-3559, filas 400-463.
- Extension geografica: oeste -60.02903, sur -3.12875, este -60.01125, norte -3.11097.
- Formato: GeoTIFF, EPSG:4326, float32, nodata -9999, compresion deflate, resolucion
  1 arcosegundo (0.000277778 grados, ~30 m).
- Relieve: altura minima 20.13 m, maxima 77.82 m, desviacion estandar ~12.7 m.
- Pixeles nodata en la ventana: 0. La ventana elegida tiene relieve real y no tiene
  nodata; el nodata se prueba en los tests a partir de una copia modificada.

## Licencia

- Licencia de FABDEM (tag `LICENCE` del archivo fuente): CC BY-NC-SA 4.0, uso no comercial.
  Texto: "The FABDEM dataset is freely available for non-commercial use under a Creative
  Commons "CC BY-NC-SA 4.0" licence. For commercial use queries, please contact
  fabdem@fathom.global"
- Licencia: https://creativecommons.org/licenses/by-nc-sa/4.0/
- Atribucion: FABDEM is produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and
  © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European
  Union and ESA; all rights reserved.

Este recorte es un derivado modificado del dataset. La licencia CC BY-NC-SA 4.0 exige
share-alike: el recorte conserva la misma licencia y el mismo alcance no comercial.
