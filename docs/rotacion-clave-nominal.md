# Rotación de la clave de cifrado nominal

`NOMINAL_ENCRYPTION_KEY` cifra en `ge_alumno_identidad.payload_cifrado` (AES-256-GCM). Es la única
clave que existe para ese dato: no hay copia, no hay clave maestra, no hay recuperación fuera de
este procedimiento.

## Advertencia — pérdida de la clave

**Si se pierde la clave, los nombres quedan irrecuperables y hay que re-sincronizar desde GE.**
No hay forma de descifrar `payload_cifrado` sin la clave exacta con la que se cifró. La única
salida ante una pérdida es reimportar la identidad desde Gestión Educativa con `importarIdentidad`,
que sobrescribe la fila con el payload cifrado bajo la clave vigente.

## Antes de rotar

1. Hacé una copia de `ge.sqlite` (el archivo bajo `DATA_DIR`). El procedimiento se prueba primero
   contra esa copia, nunca directamente contra la base en uso.
2. Generá la clave nueva: 32 bytes en base64, por ejemplo con
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
3. Guardá la clave vieja en un lugar seguro (gestor de secretos) hasta confirmar que la rotación
   terminó sin errores. Nunca en el repositorio, nunca en la base, nunca en un log.

## Procedimiento

1. Abrí una conexión directa a la copia de `ge.sqlite` con `openGeDb()`.
2. Llamá a `rotarClaveIdentidad(client, claveVieja, claveNueva)` de
   `lib/infraestructura/identidad.ts`. La función:
   - lee cada fila de `ge_alumno_identidad`,
   - descifra el payload con la clave vieja,
   - lo recifra con la clave nueva,
   - escribe todas las actualizaciones en una única transacción: o rotan todas las filas, o
     ninguna.
3. Verificá el resultado (`filasRotadas` debe coincidir con la cantidad de alumnos con identidad
   importada) leyendo algunos nombres con `listarIdentidadesPorPersonas` usando la clave nueva.
4. Recién ahora actualizá `NOMINAL_ENCRYPTION_KEY` en el entorno de producción y desplegá.
5. Confirmá que el endpoint `/api/infraestructura/nominal` sigue devolviendo nombres correctos con
   un usuario que tenga un grant vigente.
6. Destruí la clave vieja del gestor de secretos.

## Frecuencia

No hay una cadencia fija todavía: rotá ante sospecha de compromiso de la clave, o como parte de una
política de seguridad que se defina más adelante. Cada rotación es una operación completa sobre
todo `ge_alumno_identidad`, no incremental.
