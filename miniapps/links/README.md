# Links CADM

La miniapp conserva un único documento. En el Host exacto
`links.sistemas.mec.gob.ar` (sin puerto, sin distinguir mayúsculas y aceptando
el punto DNS final) sólo publica `/cadm`, `/cadm/admin` y `/cadm/api/*`.
La raíz redirige a `/cadm`. Las rutas del Hub y `/links/*` responden 404;
`/_next/*`, `/marca/*`, `/favicon.ico` y `/api/health` siguen disponibles.
El health devuelve únicamente `{ "ok": true }`, con no-store y sin DB o sesión.
En el host del Hub conserva `/links`. No hay basePath global ni multi-slug.

El servidor deriva el basePath del Host directo y lo pasa al cliente.
Las cookies son host-only, HttpOnly, SameSite=Strict y llevan ese mismo Path
al crear y al cerrar sesión. Producción exige origen HTTPS y siempre usa Secure,
aun si el transporte interno es HTTP. Canonical, og:url y metadataBase públicos
apuntan a `https://links.sistemas.mec.gob.ar/cadm`.

## Persistencia y migraciones

Aplicar la cadena versionada de Drizzle hasta `0039_links_revision_sesiones`
como paso operativo previo, mediante el procedimiento de migraciones del repo.
La visita anónima sólo consulta `linktree_config`: no ejecuta migraciones, seed,
ni inicializa datos del Hub. Tabla migrada sin fila muestra el estado vacío.
Una tabla ausente es un error operativo, no dispara DDL desde un GET.

0039 agrega `revision` (default 1 para documentos existentes) y
`links_sesiones`. SQL, snapshot y journal se generan con drizzle-kit del repo,
sin DB. El documento ausente usa revisión 0. PUT exige revisión explícita;
insert/update condicionado devuelve 409 ante conflictos. El editor conserva
el borrador y ofrece recargar con aviso de que esa acción lo descarta.
La revisión devuelta en cada guardado se usa para el siguiente.

## Sesiones y autoría

`LINKS_ADMIN_USERS` y `LINKS_SESSION_SECRET` siguen configurando el acceso.
Usuarios duplicados o configuración incompleta cierran el admin.
Cada login emite 32 bytes aleatorios; sólo su SHA-256 se guarda como id.
La fila contiene usuario, HMAC de su credencial, vencimiento y revocación.
Cada autorización comprueba existencia actual del usuario, clave y secreto;
logout revoca la fila antes de borrar la cookie. Las cookies anteriores al
cambio requieren volver a ingresar. `actualizado_por` guarda el usuario de
esa sesión, nunca un valor recibido en el body.
Las filas vencidas/revocadas se conservan; su limpieza puede hacerse en una
tarea operativa futura. Restaurar una configuración antigua de credenciales
puede rehabilitar sesiones no revocadas aún vigentes de esa configuración.

## Proxies y límite de Next

Nueva variable: `LINKS_TRUSTED_PROXIES`. Lista separada por comas de IPs o
CIDRs IPv4/IPv6; vacía por defecto. Una lista mal formada no confía en nadie.
No se lee ninguna IP del par desde cabeceras. Sólo `request.socket.remoteAddress`
(si el adaptador la aporta como propiedad del transporte) permite confiar en
X-Forwarded-Host/Proto/For. X-Real-IP nunca se utiliza.

Los Route Handlers estándar de Next no exponen el socket. En ese runtime,
aunque exista una lista configurada, las cabeceras reenviadas se ignoran;
la IP es `unknown` y todos los logins comparten el mismo cupo local. Para tener
límites por cliente hace falta un adaptador que aporte la IP real fuera de
headers, o un limitador en el ingress. No se agregó un header de IP privilegiado
ni una variable que declare confiable a todo el tráfico. El límite es de
10 intentos por 15 minutos por proceso; no coordina réplicas.

En producción el protocolo público esperado es siempre HTTPS, sin depender de
la URL interna reconstruida por Next ni de X-Forwarded-Proto. En desarrollo se
usa el protocolo de Request.url, o el reenviado con un par confiable. Para el
origen se compara esquema, host y puerto. El montaje por host y el basePath
usan siempre Host directo; el ingress debe preservarlo. El servidor debe
quedar detrás del ingreso previsto, con TLS público y cabeceras saneadas.
No se verificó ni modificó infraestructura.

Si existe peer confiable, Host/Proto reenviados deben ser valores únicos,
reemplazados por el proxy. Para X-Forwarded-For se recorre desde la derecha
hasta el primer salto no confiable; no se toma ciegamente el primer valor.

## Límites y diagnósticos

Login limita a 4096 bytes y PUT a 512 KiB, también sin Content-Length.
Zod exige ids únicos. Configuración almacenada inválida produce un aviso fijo
sin documento y fallback vacío. Las APIs devuelven no-store incluso en 429,
413 y 500; errores inesperados registran sólo `links_api_error`, sin serializar
excepciones del driver ni credenciales. Logout fallido muestra un aviso.

Los tests de integración ejecutan handlers, cookies simuladas por next/headers
y persistencia PGlite real. No equivalen a una prueba de navegador desplegado.


## CI y publicación independiente

`.github/workflows/links-cadm.yml` prueba links, middleware, health y lib/db en
PRs a main y pushes a dev, staging y prod que cambien las rutas cubiertas.
Sólo el push a prod, después de los tests, publica `links-prod` y
`links-prod-<sha>` en GHCR. El job deploy depende del job image mediante needs:
sólo después dispara/espera el deploy de links, con force=false y los secrets
COOLIFY_LINKS_TOKEN y COOLIFY_LINKS_APP_UUID. Si falta alguno, el job falla
indicando que debe crearlo MEC Infra.
No publica `latest`. La app debe estar configurada para consumir `links-prod`;
este cambio no modifica la configuración de Coolify.

CI y GHCR del Hub ignoran únicamente los paths exclusivos de links. Cambios
en middleware, health, lib/db o el journal compartido siguen ejecutando ambos
circuitos. Sin checks requeridos de branch protection, el workflow omitido por
paths no necesita un job artificial de éxito. Dev/staging no despliegan links.
El script de release se prueba con curl/sleep simulados y no usa infraestructura.

Las migraciones Postgres toman un advisory lock estable en un PoolClient
exclusivo, ejecutan Drizzle sobre ese mismo cliente y liberan el lock antes de
devolverlo. Si falla el unlock se descarta la conexión para no devolver al pool
una sesión posiblemente bloqueada. PGlite conserva su migrador anterior.
