# Cuadernillos: remitos y recibidos firmados

Guía operativa del flujo de envío de cuadernillos. Reemplaza el esquema anterior de cupos y pedidos de las cabeceras.

## Flujo

Planeamiento envía los cuadernillos a las escuelas que los necesitan. Cada traspaso se firma con la cuenta de quien recibe.

1. **Planeamiento** arma un remito por cabecera (botón "Nuevo remito"), con una línea por escuela destino y cantidades por cuadernillo (nivel y grado). La cantidad inicial sale de la recomendación por matrícula y se puede editar. Solo pueden ser destino escuelas del Consejo con severidad Crítica.
2. **Despacho.** Al enviar, el sistema revalida que todas las escuelas sigan en Crítica y descuenta el stock global en el acto. Si alguna dejó de serlo, o el stock no alcanza, no se despacha nada. Reenviar con la misma clave de idempotencia no duplica el remito.
3. **Cabecera.** La cuenta de la cabecera del remito firma un único recibido por todo el remito. Para cada cuadernillo se confirma la cantidad recibida.
4. **Escuela.** La cuenta de la escuela (GE SSO, rol `operador_establecimiento`, acotada por su CUE) firma su propia línea en `/cuadernillos/recepcion`. Se le consulta por lo que confirmó la cabecera, no por lo que despachó Planeamiento. No puede firmar antes de que la cabecera firme (`cabecera_receipt_pending`), y una escuela no puede firmar la línea de otra.
5. **Cabecera como destino.** Si la propia escuela cabecera es una línea, el recibido del remito cuenta también como recibido de esa línea.

## Faltantes

Cada receptor responde "¿Recibió X cantidad de X cuadernillo?". Confirmar firma. Si la cantidad real es menor, se carga por nivel y grado y el motivo es obligatorio. La diferencia queda registrada como faltante del tramo anterior (Planeamiento → Cabecera, o Cabecera → Escuela). Nunca se puede recibir más de lo enviado en ese tramo, y no se admite un motivo si no hay faltante.

Los recibidos firmados son inmutables y su identidad y fecha salen de la sesión, nunca del cuerpo del pedido. Una línea cuyo total confirmado por la cabecera es 0 se cierra sin recibido de escuela.

## Supervisión

El supervisor de cada cabecera tiene una vista de control posterior ("Control de remitos"): ve lo despachado, lo recibido y los faltantes por tramo de sus remitos y puede agregar observaciones. No aprueba ni bloquea nada. Los administradores de cuadernillos solo leen.

## Stock

La carga de stock no cambió: es simple y no se firma.

## Histórico

Los cupos, pedidos, aprobaciones y remanentes anteriores se conservan como histórico de solo lectura y no aparecen en la interfaz. El stock ya descontado por aprobaciones anteriores se mantiene. Las rutas de escritura anteriores (cupos, creación, aprobación, rechazo y remanente de pedidos) responden `410 flow_retired`.

## API

| Acción | Ruta | Quién |
|---|---|---|
| Despachar remito | `POST /api/cuadernillos/remitos` | Planeamiento |
| Listar remitos | `GET /api/cuadernillos/remitos` | Planeamiento |
| Recibido de cabecera | `POST /api/cuadernillos/remitos/{id}/recibir` | Cabecera del remito |
| Recibido de escuela | `POST /api/cuadernillos/remito-lineas/{id}/recibir` | Escuela de la línea |
| Control | `GET /api/cuadernillos/control` | Supervisor |
| Observación | `POST /api/cuadernillos/remitos/{id}/observaciones` | Supervisor |

Los CUE de las tablas de cuadernillos se guardan con 9 dígitos; el CUE de sesión y de GE usa la forma con guion (`1800002-00`).

## Prueba extremo a extremo

`node e2e/cuadernillos/run.mjs` construye una copia aislada con PGlite y ejecuta el humo por rol y el flujo completo (despacho, faltante con motivo, recibido de escuela, control, `410` del flujo retirado). `--screens <directorio>` genera las capturas. Con `T8_E2E_PG_URL` apuntando a un clúster local descartable, el mismo flujo corre además sobre PostgreSQL.
