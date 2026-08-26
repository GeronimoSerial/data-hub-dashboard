# Usuarios, roles y carga de recursos

El Hub deja de ser un catálogo efímero y público en `/admin`. Pasa a un monolito Next.js con Better Auth (email + contraseña), tres roles fijos, SQLite + archivos en disco, y un visor in-page con ACL. Los listados siguen mostrando títulos publicados a cualquiera; abrir el archivo, el visor o una ruta interna exige sesión y audiencia.

## Quick path

1. Anónimo recorre Inicio / Reportes / Tableros / Mapas y ve títulos.
2. Clic en un recurso → `/login?callbackUrl=…` → visor o mapa interno.
3. Admin crea usuarios (rol + N niveles). Editor sube archivo o pega ruta, elige audiencia, publica, renombra.
4. Consulta abre solo si `puedeAbrir` es verdadero; si no, 403.

## Decisiones

| Tema | Decisión |
|------|----------|
| Identidad | Cuentas locales, email + contraseña, alta solo desde Administración. Sin SSO, sin registro público. |
| Auth | Better Auth en este Next.js. `emailAndPassword.disableSignUp: true`. |
| Roles | Fijos: `admin`, `editor`, `consulta`. Sin constructor de permisos. |
| Catálogo | Títulos publicados públicos. Abrir = login + audiencia. |
| Contenido | Los tres formatos son archivo **o** ruta interna (XOR). Se sirven como URL de la app. |
| Audiencia | N niveles y/o N personas. Vacía = cualquier usuario logueado. |
| Niveles de usuario | Un usuario puede tener varios. Intersección con la audiencia del recurso. |
| Visor | En la página: HTML iframe sandbox, imagen, PDF. xlsx/docx solo descarga. |
| Persistencia | SQLite + `uploads/` en un volumen Coolify (`DATA_DIR`). Un contenedor. |
| Mail | No hay SMTP. El Admin resetea contraseñas. Primer Admin por env. |

## Arquitectura

Un solo proceso Next.js (App Router, ya en producción vía Coolify + GHCR). El volumen montado en `DATA_DIR` guarda `hub.sqlite` y `uploads/`.

```
Anónimo                Consulta                 Editor / Admin
  títulos públicos       login + visor si ACL     /admin
                                                  usuarios y taxonomías: solo Admin
                         │
                         ▼
              Next.js ── Better Auth ── Drizzle + SQLite
                              │
                              └── GET archivo (sesión + ACL) ── disco
```

`HubDataProvider` deja de ser estado React semilla: taxonomías y recursos se leen de SQLite. El seed actual de `lib/model.ts` se inserta **una vez** si las tablas están vacías (incluido el mapa de matrícula con `ruta: /mapas/matricula`).

### Unidades

| Unidad | Hace | Depende de |
|--------|------|------------|
| `lib/auth.ts` | Better Auth: sesión, password, rol, ban | Drizzle/SQLite |
| `lib/acl.ts` | `puedeAbrir(user, recurso)` | sesión + audiencia + rol |
| `lib/db` | Drizzle schema + queries de catálogo, usuarios, archivos | `DATA_DIR` |
| `app/api/auth/[...all]` | Handler Better Auth | `lib/auth.ts` |
| `GET /api/recursos/:id/archivo` | Stream del archivo con ACL | `puedeAbrir`, disco |
| `app/recursos/[id]` | Visor in-page | archivo o 404 |
| `app/login` | Formulario Fluent | Better Auth client |
| Admin (páginas existentes) | CRUD persistido + archivo + audiencia + pestaña Usuarios | rol |

## Modelo de datos

Las taxonomías **no se duplican**: `niveles`, `tipos`, `categorias`, `tags` son las mismas entidades que hoy. El **nivel de clasificación del recurso** (`recursos.nivelId`: de qué trata el contenido) es distinto de los **niveles de audiencia** (quién puede abrirlo).

### Usuario (Better Auth + extras)

Tablas de Better Auth (`user`, `session`, `account`, `verification`) vía `drizzleAdapter(..., { provider: "sqlite" })`.

Campos del plugin `admin` de Better Auth (no duplicar `role` en `additionalFields`):

| Campo | Valor |
|-------|--------|
| `role` | `admin` \| `editor` \| `consulta`. `adminRoles: ['admin']`. Solo el server / pestaña Usuarios lo setea. |
| `banned` | usuario desactivado. La sesión deja de valer al banear. |

`user_niveles (userId, nivelId)`: N niveles por usuario. Vacío permitido: ese usuario no entra por grupo; solo si lo nominan en un recurso o si el recurso no tiene audiencia.

No se elimina el último usuario con `role = admin` (activo y no baneado). Preferir ban a delete.

### Recurso

Campos actuales más archivo y audiencia:

| Campo | Regla |
|-------|--------|
| `ruta` | Visor interno. XOR con archivo: exactamente uno de los dos en recursos publicados que se pueden abrir. Un borrador puede no tener ninguno todavía. |
| `storageKey`, `mime`, `nombreOriginal`, `size` | Metadatos del archivo. Path interno estable; renombrar no lo cambia. |
| `recurso_audiencia_niveles` | N niveles (quién abre). |
| `recurso_audiencia_usuarios` | N personas. |

Publicado (`estado = publicado`) controla si el **título** aparece en el catálogo anónimo. No relaja ni endurece `puedeAbrir` salvo el caso consulta + borrador (abajo).

### Archivos

- Disco: `$DATA_DIR/uploads/{recursoId}/{fileId}` — no hay URL estática `/uploads`.
- Tope **50 MB**.
- Visor in-page: `application/pdf`, `text/html`, `image/png`, `image/jpeg`, `image/webp`, `image/gif`. Extensiones `.html`/`.htm` → `text/html`.
- También permitidos: `xlsx`, `docx` (descarga en el visor; sin preview).
- **Sin SVG** (XSS).
- Reemplazar archivo: mismo `recursoId`, nuevo `fileId`, borrar el blob anterior.
- Borrar recurso: borrar fila + archivo en disco.

## Auth, rutas y ACL

Cookie de sesión httpOnly; `Secure` en producción. El cliente **no** es autoridad de rol.

`emailAndPassword.disableSignUp: true`. Altas solo con APIs de Admin en servidor (plugin `admin` de Better Auth o Server Actions equivalentes que verifiquen `role === 'admin'`).

### Matriz

| Superficie | Anónimo | Consulta | Editor | Admin |
|------------|---------|----------|--------|-------|
| Catálogo (`/`, `/reportes`, `/tableros`, `/mapas`) | títulos publicados | igual | igual | igual |
| `/login` | sí | redirige si hay sesión | igual | igual |
| `/recursos/:id` y `GET /api/recursos/:id/archivo` | → login | si `puedeAbrir` | sí | sí |
| Ruta interna (`/mapas/matricula` u otra `ruta`) | → login | si `puedeAbrir` de ese recurso | sí | sí |
| `/admin` recursos (CRUD + archivo + audiencia) | → login | 403 | sí | sí |
| `/admin` usuarios | no | no | no | sí |
| `/admin` taxonomías (categorías, tags, niveles, tipos) | no | no | no | sí |

### `puedeAbrir(user, recurso)`

Única función. La usan visor, stream de archivo y páginas con `ruta` interna.

1. Sin sesión → no (el caller redirige a `/login?callbackUrl=`).
2. `recurso.estado === 'borrador'` y `user.role === 'consulta'` → no (403). El catálogo no lista borradores.
3. `user.role` es `admin` o `editor` → sí (también borradores).
4. `user.banned` → no.
5. Audiencia vacía (0 niveles y 0 personas) → sí.
6. `user.id` está en `recurso_audiencia_usuarios` **o** hay intersección entre `user_niveles` y `recurso_audiencia_niveles` → sí.
7. Si no → no (403).

Consulta nunca abre un recurso publicado que no le toca, aunque conozca la URL.

### Nav

- Anónimo: catálogo + Iniciar sesión. Sin Administración.
- Consulta: catálogo + Salir. Sin Administración.
- Editor: + Administración (sin pestaña Usuarios ni taxonomías).
- Admin: Administración completa.

## Visor y seguridad HTML

`/recursos/:id` usa el chrome del hub (título, formato, volver). Cuerpo:

| MIME | UI |
|------|-----|
| `text/html` | iframe cuyo `src` es `/api/recursos/:id/archivo` |
| imagen | `img` con la misma URL |
| `application/pdf` | iframe/`object` |
| xlsx/docx | texto + botón descarga (`Content-Disposition: attachment` en un query o la misma ruta con `?download=1`) |
| recurso con `ruta` | no usa esta página; navega a `ruta` |

Recurso publicado sin archivo y sin `ruta`: la tarjeta no es clicable (igual que hoy cuando no hay `ruta`). En admin se puede guardar borrador incompleto.

### HTML

No inyectar HTML en el origen del hub (`dangerouslySetInnerHTML` prohibido para contenido de usuario).

Iframe: `sandbox="allow-scripts allow-forms"` **sin** `allow-same-origin`.

Respuesta del archivo:

- `X-Content-Type-Options: nosniff`
- `Cache-Control: private, no-store`
- `Content-Security-Policy: frame-ancestors 'self'`
- `Content-Type` del allowlist, nunca adivinado por extensión sola

**Fuera de este corte:** HTML de un solo archivo. Sin zip, sin carpeta de assets relativos, sin SVG.

El mapa de matrícula sigue en `/mapas/matricula` (MapLibre). Middleware o el server component de esa página llama `puedeAbrir` sobre el recurso que tiene esa `ruta`.

### Catálogo → abrir

`ResourceCard`: si hay archivo → `/recursos/:id`; si hay `ruta` → esa ruta. Anónimo: `/login?callbackUrl=` al destino. Sin icono de candado en la card.

## UI

Fluent UI, mismos patrones que `components/admin-page.tsx`. Sin rediseño de marca.

**Login** (`/login`): email, contraseña, error genérico (“No se pudo iniciar sesión”). Sin enlace de registro ni “olvidé contraseña” (no hay mail). Admin resetea desde Usuarios.

**Usuarios** (solo Admin): tabla nombre, email, rol, niveles, estado. Alta/editar: email, nombre, contraseña inicial o reset, rol, niveles (multiselect). Ban/desactivar. No borrar el último Admin.

**Recurso (Editor + Admin):** diálogo actual más:

- Radio: **Archivo** | **Ruta interna**.
- Archivo: input file, nombre y peso; reemplazar.
- Ruta: input (ej. `/mapas/matricula`).
- Audiencia: niveles multiselect + personas (combobox de usuarios activos). Hint: “Si no elegís nadie ni niveles, cualquier usuario logueado puede abrir.”
- Título = renombrar visible. Publicar = checkbox de hoy.

Taxonomías: UI actual, visible y mutable solo para Admin.

**403:** “No tenés acceso a este recurso” + volver al catálogo.

## Errores

| Caso | Comportamiento |
|------|----------------|
| Login inválido | Mensaje genérico. No revelar si el email existe. |
| Abrir sin sesión | Redirect login + `callbackUrl`. |
| ACL falla | 403 de página, no stack trace. |
| MIME no permitido o >50 MB | Error en el diálogo; no se persiste metadatos huérfanos ni archivo parcial. |
| HTML malformado | Falla solo el iframe; el chrome sigue. |
| Archivo en DB sin blob (o al revés) | 404 en el visor; log server. |
| SQLite o disco caído | 500 genérico + log. |
| Ban en sesión viva | Próximo request no autenticado. |

## Deploy

Volumen Coolify en `DATA_DIR` (sqlite + uploads). Documentar en `docs/DEPLOY.md`.

| Variable | Uso |
|----------|-----|
| `DATA_DIR` | Directorio del volumen. Default local: `.data` (gitignored). |
| `BETTER_AUTH_SECRET` | Obligatorio. |
| `BETTER_AUTH_URL` | URL pública (`https://analisis.sistemas.mec.gob.ar` en prod). |
| `ADMIN_EMAIL` | Seed del primer Admin si `user` está vacío. |
| `ADMIN_PASSWORD` | Idem. No se re-aplica si ya hay usuarios. |

Backup = copiar el volumen. El contenedor no debe escribir sqlite/uploads en la capa efímera de la imagen.

## Tests

Hoy no hay runner. Este corte agrega tests unitarios de `puedeAbrir` y del allowlist (MIME + tamaño), más `pnpm build`.

Casos obligatorios de `puedeAbrir`:

- anónimo → false
- consulta + publicado + audiencia vacía → true
- consulta + publicado + nivel coincidente → true
- consulta + publicado + nivel no coincidente + no nominado → false
- consulta + publicado + nominado aunque sin nivel → true
- consulta + borrador → false
- editor/admin + borrador → true
- banned → false

Smoke manual: login; alta usuario; subir PDF y HTML; catálogo anónimo ve títulos; 403; `/mapas/matricula` con ACL; reset de contraseña; reemplazar archivo; desactivar usuario.

## Fuera de alcance

SSO / Azure AD, Postgres, S3/MinIO, zip o HTML con assets, SVG, registro público, “olvidé contraseña” por mail, roles a medida, candados en las cards, preview de Office, multi-instancia SQLite.

## Checklist de revisión

- [ ] Catálogo anónimo = solo títulos publicados, sin archivo.
- [ ] Abrir exige sesión y `puedeAbrir`.
- [ ] Audiencia vacía = cualquier logueado; no es “nadie”.
- [ ] `nivelId` del recurso ≠ niveles de audiencia.
- [ ] Editor no administra usuarios ni taxonomías.
- [ ] HTML nunca corre en el origen del hub.
- [ ] Un contenedor, un volumen, sin SMTP.
- [ ] Mapa de matrícula existente queda cubierto por la misma ACL.

## Next step

Tras OK de este spec: plan de implementación en `docs/superpowers/plans/` (Better Auth + Drizzle, ACL, admin persistido, visor, deploy).
