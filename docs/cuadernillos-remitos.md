# Cuadernillos: remitos y recibidos firmados

Guía operativa del flujo de envío de cuadernillos. Reemplaza el esquema anterior de cupos y pedidos de las cabeceras.

## Flujo

Planeamiento envía los cuadernillos a las escuelas que los necesitan. Cada traspaso se firma con la cuenta de quien recibe.

1. **Planeamiento** arma un remito por cabecera (botón "Enviar cuadernillos"), con una línea por escuela destino y cantidades por cuadernillo (nivel y grado). La cantidad inicial sale de la recomendación por matrícula y se puede editar. Solo pueden ser destino escuelas del Consejo con severidad Crítica.
2. **Despacho.** Al enviar, el sistema revalida que todas las escuelas sigan en Crítica y descuenta el stock global en el acto. Si alguna dejó de serlo, o el stock no alcanza, no se despacha nada. Reenviar con la misma clave de idempotencia no duplica el remito.
3. **Cabecera.** La cuenta de la cabecera del remito firma un único recibido por todo el remito. Para cada cuadernillo se confirma la cantidad recibida.
4. **Escuela.** La cuenta de la escuela (GE SSO, rol `operador_establecimiento`, acotada por su CUE) firma su propia línea en `/cuadernillos/recepcion`. Se le consulta por lo que confirmó la cabecera, no por lo que despachó Planeamiento. No puede firmar antes de que la cabecera firme (`cabecera_receipt_pending`), y una escuela no puede firmar la línea de otra.
5. **Cabecera como destino.** Si la propia escuela cabecera es una línea, el recibido del remito cuenta también como recibido de esa línea.

**Modos de envío.** En el primer paso del asistente, Planeamiento elige "A una cabecera" (el flujo de los puntos 1 a 5) o "Directo a escuelas". Un envío directo no tiene cabecera: se salta los puntos 3 y 5. Cada escuela firma su línea desde que el envío sale de Planeamiento ("en camino"), contra lo despachado. El remito queda recibido cuando firmaron todas sus escuelas. Las reglas de Crítica, despacho, stock e idempotencia son las mismas.

## Qué ve cada usuario

La interfaz usa lenguaje llano: "envío" en lugar de remito, "enviar" en lugar de despachar, "confirmar que llegó" en lugar de firmar el recibido y "llegó de menos" en lugar de faltante. Cada pantalla abre con una tarjeta que dice qué hay que hacer ahora, y cada envío muestra su recorrido: Enviado → Llegó a la cabecera → Llegó a la escuela, con quién confirmó cada paso y cuándo.

| Rol | Pestaña | Tarea al entrar |
|---|---|---|
| Planeamiento | Enviar cuadernillos | "Enviar cuadernillos" (asistente de 3 pasos: cabecera, escuelas y cantidades, revisar y enviar) |
| Cabecera | Recibir y repartir | "Tenés N envíos para recibir." |
| Escuela | Recepción de cuadernillos | "Te llegó un envío de cuadernillos. Confirmá qué recibiste." |
| Supervisor | Revisar envíos | "N envíos llegaron incompletos. Revisalos." |

Sin pendientes, la tarjeta dice "No tenés nada pendiente.". En los términos de este documento, envío = remito y llegó de menos = faltante.

En un envío directo, la escuela ve su línea como "en camino" y puede firmarla sin esperar a una cabecera. Las cabeceras no ven los envíos directos y no pueden firmarlos; los ven solo Planeamiento y los administradores.

## Faltantes

Cada receptor ve la lista de lo enviado y elige "Sí, llegó todo" o "Llegó menos"; "Confirmo que recibí estos cuadernillos" firma. Si la cantidad real es menor, se carga por nivel y grado y el motivo es obligatorio. La diferencia queda registrada como faltante del tramo anterior (Planeamiento → Cabecera, o Cabecera → Escuela). Nunca se puede recibir más de lo enviado en ese tramo, y no se admite un motivo si no hay faltante.

En un envío directo no hay tramo con la cabecera. El faltante es el tramo "Planeamiento → Escuela": la escuela confirma contra lo que despachó Planeamiento, y el motivo es obligatorio si llegó menos.

Los recibidos firmados son inmutables y su identidad y fecha salen de la sesión, nunca del cuerpo del pedido. Una línea cuyo total confirmado por la cabecera es 0 se cierra sin recibido de escuela.

## Supervisión

El supervisor de cada cabecera tiene una vista de control posterior ("Revisar envíos"): ve lo despachado, lo recibido y los faltantes por tramo de sus remitos y puede agregar observaciones. No aprueba ni bloquea nada. Los administradores de cuadernillos solo leen. Los envíos directos quedan fuera del control del supervisor: no aparecen en su vista y no admiten observaciones suyas.

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

`POST /api/cuadernillos/remitos` acepta el campo `modo`: `cabecera` (o ausente, para los clientes existentes), que exige `cabeceraCueAnexo`; o `directo`, que no admite `cabeceraCueAnexo` y devuelve `400` si lo trae. `GET /api/cuadernillos/recommendations` acepta omitir `cabeceraCueAnexo` solo para Planeamiento, que arma envíos directos; para cualquier otro actor sin cabecera responde `403`.

Los CUE de las tablas de cuadernillos se guardan con 9 dígitos; el CUE de sesión y de GE usa la forma con guion (`1800002-00`).

## Prueba extremo a extremo

`node e2e/cuadernillos/run.mjs` construye una copia aislada con PGlite y ejecuta el humo por rol y el flujo completo (despacho, faltante con motivo, recibido de escuela, control, `410` del flujo retirado). `--screens <directorio>` genera las capturas. Con `T8_E2E_PG_URL` apuntando a un clúster local descartable, el mismo flujo corre además sobre PostgreSQL.
