# Habilitación gradual de reportes offline

Los flags se leen en el servidor en cada solicitud. El endpoint de configuración entrega al navegador únicamente valores booleanos, sin exponer el entorno. Solo el texto exacto `true` habilita una función; cualquier otro valor, incluido uno ausente, la deja apagada.

| Variable | Controla | Valor predeterminado |
| --- | --- | --- |
| `REPORTES_OFFLINE_BORRADORES_SYNC` | Creación y sincronización de borradores en el servidor. | Apagado en todos los entornos. |
| `REPORTES_OFFLINE_FOTOS` | Selector, subidas, autorizaciones, confirmaciones, galería e historial de fotos. | Apagado en todos los entornos; por lo tanto, apagado en producción. |
| `REPORTES_OFFLINE_MAPA_BORRADORES` | Conteos y detalle de borradores pendientes en el mapa. | Apagado en todos los entornos. |

## Habilitar gradualmente

1. Desplegar primero con los tres flags apagados y observar errores de servidor y del navegador.
2. Habilitar `REPORTES_OFFLINE_BORRADORES_SYNC=true` para un entorno o grupo de instancias controlado. Confirmar que los borradores sincronizan y que los envíos finales siguen teniendo prioridad.
3. Habilitar `REPORTES_OFFLINE_MAPA_BORRADORES=true` cuando la sincronización esté estable. Verificar permisos, conteos agrupados y detalle.
4. Habilitar `REPORTES_OFFLINE_FOTOS=true` por separado, solo después de comprobar OBS, autorizaciones y confirmaciones idempotentes. En producción, fotos requieren esta habilitación explícita.
5. Aumentar el alcance de forma gradual y revisar métricas, errores 5xx/503, trabajos pendientes y consumo de OBS antes de continuar.

Cambiar variables requiere aplicar la nueva configuración al proceso o despliegue que sirve la aplicación. El endpoint de configuración usa `no-store`; las pestañas consultan el valor antes de iniciar sincronizaciones o subidas. Las APIs verifican el flag en el servidor, aunque un navegador conserve una vista abierta.

## Reversión

1. Para detener una superficie, quitar su variable o cambiarla a `false` y aplicar la configuración al servidor.
2. Borradores: desactivar `REPORTES_OFFLINE_BORRADORES_SYNC`. Las APIs de escritura responden 503 y el cliente deja de enviar. Las instantáneas locales, los índices de pendientes, revisiones y conflictos permanecen en IndexedDB.
3. Fotos: desactivar `REPORTES_OFFLINE_FOTOS`. Se detienen nuevas selecciones en vistas actualizadas, nuevas autorizaciones, confirmaciones y lecturas de galería. Los archivos locales, trabajos de subida y referencias confirmadas no se eliminan. Una transferencia ya iniciada puede terminar; las siguientes quedan detenidas.
4. Mapa: desactivar `REPORTES_OFFLINE_MAPA_BORRADORES`. Las APIs devuelven resultados vacíos y la interfaz oculta conteos y detalles; no modifica borradores.
5. Investigar el incidente con las colas conservadas. Al volver a habilitar el mismo flag, el cliente reintenta los pendientes existentes; no requiere limpiar almacenamiento ni recrear los borradores.

No borrar IndexedDB, trabajos `pendiente`, `enviando`, `error` o `sesion-vencida`, archivos locales, ni filas remotas para ejecutar una reversión. Desactivar la bandera detiene procesamiento y no es una operación de limpieza.
