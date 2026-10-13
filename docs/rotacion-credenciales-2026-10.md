# Rotación de credenciales expuestas (octubre 2026)

## Contexto

Durante sesiones de trabajo del 2026-10-13 se compartieron en el chat las siguientes credenciales:

- credenciales de la base de datos de producción;
- contraseña del usuario `root` del servidor que aloja Coolify (producción y staging);
- token de la API de Coolify.

Por ese motivo se consideran comprometidas y deben rotarse.

- **Prioridad:** inmediata.
- **Responsable de la rotación:** el usuario y su equipo (decisión Q7).
- **Regla general:** ninguna credencial rotada se escribe en el repositorio, en logs, en la base ni en el chat.
  Usar placeholders como `<host-produccion>` y variables de entorno en la shell local.

## Checklist por credencial

Marcar cada ítem al completarlo. Registrar el resultado en la [tabla de registro](#registro).

### 1. Token de la API de Coolify

- [ ] Revocar el token expuesto en Coolify (*Keys & Tokens*).
- [ ] Crear un token nuevo solo si hace falta, con el menor permiso posible.
- [ ] Actualizar los consumidores del token nuevo (si los hay) y guardarlo en el gestor de secretos.

**Verificación:** la llamada con el token viejo debe responder `401`. Ejemplo, con el token viejo en una
variable de entorno local (nunca escrito en el comando):

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $COOLIFY_TOKEN_VIEJO" \
  https://<host-coolify>/api/v1/version
```

Si el endpoint de prueba no existe en la instancia, usar cualquier endpoint autenticado de la API.
El resultado esperado es `401` con el token revocado y `200` con el token nuevo.

### 2. Acceso SSH del usuario root

Objetivo: dejar de usar contraseña para root y acceder con clave pública a un usuario nominal con `sudo`.

- [ ] Crear un usuario nominal (`<usuario-admin>`) con `sudo` y cargar su clave pública en `~/.ssh/authorized_keys`.
- [ ] Verificar el acceso con clave y `sudo` en una sesión nueva, sin cerrar la sesión existente.
- [ ] Cambiar la contraseña de root (`passwd root`) como paso previo a cualquier otro cambio.
- [ ] Editar la configuración de `sshd` (`/etc/ssh/sshd_config` o un archivo en `sshd_config.d/`):

  ```text
  PasswordAuthentication no
  PermitRootLogin prohibit-password
  ```

- [ ] Validar la sintaxis antes de recargar: `sudo sshd -t`. Si falla, no recargar.
- [ ] Recargar el servicio (`sudo systemctl reload ssh`, o `sshd` según la distribución).

**Precauciones:**

- Mantener **abierta una segunda sesión SSH** durante todo el cambio. Si la configuración deja el servidor
  inaccesible, esa sesión permite revertir.
- Confirmar que el usuario nominal entra con clave y puede ejecutar `sudo` antes de deshabilitar la contraseña.

**Verificación:**

- Un intento con la contraseña vieja debe fallar (`Permission denied`), tanto para root como para cualquier usuario.
- Login de root con contraseña debe fallar; con clave, solo si se decide mantenerlo habilitado.
- `sudo sshd -T | rg -i "passwordauthentication|permitrootlogin"` debe mostrar `no` y `prohibit-password`.
- Login con `<usuario-admin>` y clave pública funciona en una sesión nueva.

### 3. Usuario de la base de datos de la aplicación (producción y staging, PostgreSQL 17)

Verificar primero si producción y staging usan el mismo rol. Si son distintos, rotar cada uno por separado.

- [ ] Cambiar la contraseña del rol de la aplicación en el servidor de base:

  ```sql
  ALTER ROLE <rol_aplicacion> PASSWORD '<nueva-contraseña>';
  ```

  Ejecutarlo el propietario de la base o un rol con permisos suficientes. La contraseña nueva se genera
  con un gestor de contraseñas y no se escribe en el chat.
- [ ] Actualizar `DATABASE_URL` en las variables de entorno de Coolify de la aplicación de **producción**.
- [ ] Actualizar `DATABASE_URL` en la aplicación de **staging**. Verificar antes dónde está definida: el
  runbook del scheduler indica que el staging usa `EnvironmentFile` de systemd, no Coolify. Actualizar el
  mecanismo que corresponda.
- [ ] Redesplegar cada aplicación para que tome el valor nuevo.
- [ ] Revisar que no haya otras copias de `DATABASE_URL` (scripts, timers, `.env` locales fuera del repositorio).

**Verificación:**

- La aplicación responde su health check y conecta con la base (revisar logs de arranque sin imprimir la URL).
- Un intento de conexión con la contraseña vieja falla:

  ```bash
  PGPASSWORD="$PASS_VIEJA" psql "host=<host-produccion> port=5432 dbname=<base> user=<rol_aplicacion>" -c "select 1"
  ```

  Debe responder `password authentication failed`.
- Los jobs del scheduler siguen registrando corridas correctas tras el redespliegue.

### 4. Otros secretos visibles en el entorno de la aplicación

Revisar el listado de variables de entorno de producción y staging. Rotar solo los que estuvieron expuestos
en la misma sesión (verificar con el usuario).

- [ ] `EARTHDATA_TOKEN` (verificar): si estuvo expuesto, renovarlo según
  [la sección correspondiente del runbook](ejecucion-enos/OPS1/runbook-scheduler.md#renovación-de-la-credencial-de-earthdata-vence-2026-11-26).
- [ ] `OPEN_METEO_API_KEY`, `OPENROUTER_API_KEY` (verificar): rotar en el proveedor si aparecieron en el chat.
- [ ] `NOMINAL_ENCRYPTION_KEY` (verificar, no rotar en esta tanda): rotarla solo con el procedimiento completo de
  [rotación de la clave nominal](rotacion-clave-nominal.md). Rotarla sin ese procedimiento deja los nombres
  cifrados irrecuperables.

**Verificación:** cada servicio externo responde con la credencial nueva y la credencial vieja queda rechazada.

## SQL: rol de auditoría de solo lectura (PostgreSQL 17)

Para auditorías y consultas de revisión sin riesgo de escritura. Lo ejecuta el **propietario de la base**.
Reemplazar los placeholders antes de ejecutar y guardar la contraseña en el gestor de secretos.

```sql
CREATE ROLE auditoria_lectura LOGIN PASSWORD '<definir>' CONNECTION LIMIT 3;

GRANT CONNECT ON DATABASE <base> TO auditoria_lectura;
GRANT USAGE ON SCHEMA public TO auditoria_lectura;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO auditoria_lectura;
ALTER DEFAULT PRIVILEGES FOR ROLE <rol_propietario> IN SCHEMA public GRANT SELECT ON TABLES TO auditoria_lectura;

ALTER ROLE auditoria_lectura SET default_transaction_read_only = on;
ALTER ROLE auditoria_lectura SET statement_timeout = '60s';
```

Notas:

- `GRANT SELECT ON ALL TABLES` cubre las tablas existentes. `ALTER DEFAULT PRIVILEGES` cubre las que el
  propietario cree después. Si las tablas las crea otro rol, usar ese rol en `FOR ROLE`.
- `default_transaction_read_only = on` es una protección de conveniencia, **no** la garantía: la sesión puede
  desactivarlo con `SET default_transaction_read_only = off`. La garantía real es que el rol **no tiene
  privilegios de escritura**. Por eso la verificación se hace sobre los privilegios, no sobre esa opción.

### Verificación

Ejecutar como propietario:

```sql
-- Solo SELECT debe aparecer para el rol.
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'auditoria_lectura'
ORDER BY table_schema, table_name, privilege_type;

-- Ningún privilegio de escritura sobre tablas de public.
SELECT c.relname, has_table_privilege('auditoria_lectura', c.oid, 'INSERT') AS insert_ok,
       has_table_privilege('auditoria_lectura', c.oid, 'UPDATE') AS update_ok,
       has_table_privilege('auditoria_lectura', c.oid, 'DELETE') AS delete_ok
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND (has_table_privilege('auditoria_lectura', c.oid, 'INSERT')
    OR has_table_privilege('auditoria_lectura', c.oid, 'UPDATE')
    OR has_table_privilege('auditoria_lectura', c.oid, 'DELETE'));
-- Debe devolver 0 filas.
```

Prueba de conexión como el rol de auditoría:

```sql
SELECT 1;                                   -- debe funcionar
SET default_transaction_read_only = off;    -- la sesión puede desactivar la opción
CREATE TABLE auditoria_prueba (x int);      -- debe fallar: permission denied for schema public
```

Si una tabla de prueba o un `INSERT` sobre una tabla real tiene éxito, el rol tiene privilegios de más:
revisar los grants antes de continuar.

### Revocación

Ejecutar en cada base donde se haya concedido acceso, como propietario:

```sql
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM auditoria_lectura;
ALTER DEFAULT PRIVILEGES FOR ROLE <rol_propietario> IN SCHEMA public REVOKE SELECT ON TABLES FROM auditoria_lectura;
REVOKE USAGE ON SCHEMA public FROM auditoria_lectura;
REVOKE CONNECT ON DATABASE <base> FROM auditoria_lectura;
DROP ROLE auditoria_lectura;
```

`DROP ROLE` falla si el rol conserva privilegios en otra base o es dueño de objetos: revisar esos casos
antes de repetir el comando. La reconexión con la contraseña del rol debe fallar después de la revocación.

## Registro

Completar una fila por credencial. No escribir valores de credenciales en la tabla.

| Credencial | Rotada por | Fecha | Verificación |
|---|---|---|---|
| Token de la API de Coolify | | | |
| Contraseña SSH de root | | | |
| Acceso SSH con clave (`<usuario-admin>`) | | | |
| Rol de base de datos de producción | | | |
| Rol de base de datos de staging | | | |
| `DATABASE_URL` producción (Coolify) | | | |
| `DATABASE_URL` staging (indicar mecanismo) | | | |
| `EARTHDATA_TOKEN` (verificar) | | | |
| `OPEN_METEO_API_KEY` (verificar) | | | |
| `OPENROUTER_API_KEY` (verificar) | | | |
| Rol `auditoria_lectura` creado | | | |
