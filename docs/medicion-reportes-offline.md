# Medición E2E de reportes offline

## Entorno y alcance

- Build de producción local: `pnpm build` y servidor `pnpm start` en `http://127.0.0.1:3000`.
- Playwright 1.64.1 con Chromium 156 y WebKit 27.2 sobre Debian 13. Chromium y WebKit usan datos PGlite temporales, CUE y secciones ficticias; la cookie de acceso se firma con una clave efímera de E2E. No se usan credenciales de producción ni un `.env` local.
- La presignación de fotos se intercepta con Playwright. No se envían bytes a OBS.
- Las cifras de red son cuerpos de request y response observados por Playwright. Los requests sin cuerpo aportan cero bytes de request. `Otros` incluye HTML, JavaScript, CSS y recursos del formulario.

## Resultados

| Flujo | Navegador | Requests observados | Bytes de request | Bytes de response | Resultado |
| --- | --- | ---: | ---: | ---: | --- |
| Reporte inicial, replay idempotente y preparación de actualización | Chromium | 3 | 609 | 945 | Pasa: POST inicial `201`, replay `200`, mismo `movimientoId`. |
| Reporte inicial, replay idempotente y preparación de actualización | WebKit | 4 | 609 | 2.097 | Pasa: POST inicial `201`, replay `200`, mismo `movimientoId`. |
| Presign de una foto, mock | Chromium | 1 | 160 | 21* | La declaración JSON se envía al endpoint simulado; cero bytes OBS. |
| Presign de una foto, mock | WebKit | 1 | 160 | 21 | La declaración JSON se envía al endpoint simulado; cero bytes OBS. |
| Navegación al mapa de infraestructura | Chromium | 2 | 0 | 28.784 | Página y consulta del mapa. |
| Navegación al mapa de infraestructura | WebKit | 2 | 0 | 28.784 | Página y consulta del mapa. |
| Recursos generales de página en la medición de mapa | Chromium | 56 | 0 | 2.384.308 | Incluye formulario y recursos estáticos. |
| Recursos generales de página en la medición de mapa | WebKit | 57 | 0 | 2.403.403 | Incluye formulario y recursos estáticos. |
| APIs de borrador | Ambos | 0 observados | 0 | 0 | Al cambiar al paso 2 no se observó una request de sincronización remota. |

\* El response de presign de Chromium no apareció en el contador de respuestas de Playwright; el mock devuelve el mismo JSON de 21 bytes que WebKit. El request de 160 bytes se midió desde el cuerpo serializado del navegador.

El POST de reporte llevaba 203 bytes por intento en esta fixture (609 bytes entre tres requests de forma equivalente). La autorización simulada agrega 160 bytes de metadatos y una request posterior a la confirmación. No hubo carga binaria a OBS. El formulario actual no expone un selector de fotos en el flujo integrado, así que esta comparación no mide una experiencia completa de usuario con y sin adjunto ni latencia real de OBS.

## Procesamiento de foto

La prueba genera una imagen JPEG sintética de 4000 × 3000 y ejecuta `procesarEnCanvas`, el procesador de la aplicación, en Chromium con `Emulation.setCPUThrottlingRate` a 4×.

| Entrada | Tiempo de proceso | Salida optimizada | Miniatura | Dimensiones optimizadas | Heap JS observado |
| ---: | ---: | ---: | ---: | --- | ---: |
| 141.555 bytes | 67,6 ms | 34.956 bytes | 4.032 bytes | 1600 × 1200 | Δ observado: 0 bytes |

La lectura de heap es la diferencia entre dos snapshots de `performance.memory`; no representa el máximo transitorio y puede ocultar asignaciones liberadas por GC. Esta prueba mide el núcleo de procesamiento en canvas, no la escritura en IndexedDB, el worker completo, la miniatura persistida ni una cámara real.

## Reapertura offline y fallos

La primera ejecución de diagnóstico encontró que el worker se instalaba sin fallar, pero el formulario y la ruta offline no lo registraban en una compilación de producción. Después de registrar `/sw-parte.js` desde el proveedor de la aplicación en las rutas `/problematicas/parte`, Chromium y WebKit activaron el worker y guardaron el borrador local.

La reapertura aún fallaba porque el handler del worker sólo aplicaba la caché a las navegaciones. Aunque la instalación guardaba los bundles, hojas de estilo y logos del shell offline, las solicitudes de esos recursos seguían yendo a la red. Ahora el worker responde primero desde su caché del shell para recursos estáticos del mismo origen. El flujo inicial también persiste el contexto de escuela y recorrido que la pantalla offline necesita para listar el borrador.

La última ejecución de `pnpm test:e2e:reportes` completó el build de producción y terminó con **7 pasados, 0 fallidos y 1 omitido**. La reapertura offline pasó en Chromium y WebKit; el benchmark CDP existente se omite en WebKit. Se verificó también que el contexto y el borrador local existen antes de cerrar la página.

## WebKit y iOS real

Playwright ejecuta WebKit en Linux; no ejecuta Safari de iOS. No reproduce el selector de fotos de iOS, permisos de cámara y biblioteca, imágenes HEIC/HEIF del dispositivo, restricciones de memoria de iPhone, suspensión de pestañas, cierre del proceso, política real de Background Sync ni eliminación de almacenamiento por iOS. Tampoco hay CDP de Chromium para aplicar la misma limitación de CPU o leer el mismo heap en WebKit. El resultado WebKit sirve como señal del motor, no como validación de Safari en un iPhone.
