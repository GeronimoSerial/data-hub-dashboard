# Materiales de la landing

Página pública: `/materiales`. El catálogo versionado está en `data/materiales.json`; los PDF no se guardan en Git.

## Desarrollo local

Los archivos optimizados se guardan en `DATA_DIR/materiales` (por defecto `.data/materiales`). El catálogo contiene sus nombres, peso, páginas y hash SHA-256. Las descargas públicas pasan por `/api/materiales/[id]/descargar`.

## S3 compatible / Huawei OBS

1. Configurar `OBS_BUCKET`, `OBS_REGION`, `OBS_ENDPOINT`, `OBS_ACCESS_KEY_ID` y `OBS_SECRET_ACCESS_KEY` en `.env.local`. Para proveedores que lo requieran, `OBS_FORCE_PATH_STYLE=true`.
2. Ejecutar `node --env-file=.env.local scripts/publicar-materiales.mjs`. Verifica los hashes locales, sube al prefijo `materiales/` y comprueba los objetos subidos.
3. Solo después de completar la publicación, configurar `MATERIALES_STORAGE=s3` y reiniciar o desplegar la aplicación.

El bucket permanece privado. El endpoint público solo permite descargar documentos incluidos en el catálogo y redirige a una URL firmada de cinco minutos, con disposición de descarga. No hace falta habilitar CORS del bucket para esta navegación directa. Las credenciales permanecen en el servidor.

El video del manual (`tipo: "video"`) se publica igual que los PDF, pero se reproduce en la página con `<video>` desde `/api/materiales/[id]/video` (soporta rangos; con S3 redirige a una URL firmada de una hora). Optimizarlo con `ffmpeg -i entrada.mp4 -c copy -movflags +faststart salida.mp4` para que empiece antes de bajar completo; el póster va en `public/materiales/manuales/`.

Para reemplazar un PDF, actualizar su hash, nombre versionado, tamaño y páginas en el catálogo, subirlo y desplegar el catálogo nuevo. Conservar los objetos anteriores permite volver a una versión previa.

## Optimización de los documentos originales

`scripts/optimizar-materiales.py ORIGINALES SALIDA` requiere `pikepdf` y `Pillow`. Comprime y deduplica imágenes, conserva perfiles de color, texto, fuentes y vectores. Conservar los originales por separado. Antes de publicar una actualización, comparar cantidad de páginas, texto extraído y renders de páginas representativas. Después, actualizar los metadatos del catálogo y copiar las versiones resultantes a `DATA_DIR/materiales` con el nombre versionado del catálogo.

El Manual Nº 2 está retirado del catálogo público por pedido del usuario. Su copia privada no es descargable desde el endpoint de materiales.
