# Reconstruir staging con datos reales de infraestructura

`pnpm db:rebuild-staging` prepara una extracción consistente de `hub_prod`.
Con `--apply`, reemplaza los datos de `hub_staging` en una única transacción.
Conserva el esquema compatible con la aplicación y las migraciones aplicadas.
No ejecuta escrituras en producción ni copia archivos de datos entre entornos.

## Ejecutar

Inyectar `SOURCE_DATABASE_URL` y `TARGET_DATABASE_URL` desde la configuración
privada del entorno. No guardar credenciales en el repositorio. El destino
debe llamarse exactamente `hub_staging` y el origen, `hub_prod`.

```bash
pnpm db:rebuild-staging
pnpm db:rebuild-staging --apply --backup=/ruta/privada/hub_staging.dump
```

El primer comando sólo devuelve el plan y los conteos. El segundo exige un
respaldo completo cuya restauración se haya comprobado, con menos de 24 horas
de antigüedad. El manifiesto `/ruta/privada/hub_staging.dump.verified.json`
debe contener:

```json
{
  "database": "hub_staging",
  "createdAt": "<fecha ISO UTC>",
  "restoreVerified": true,
  "sha256": "<checksum SHA-256 del dump>"
}
```

Crear el dump con `pg_dump --format=custom`. Restaurarlo en una instancia de
prueba usando `pg_restore --no-owner --no-privileges --exit-on-error`, verificar
conteos y relaciones, y sólo entonces generar el manifiesto. Tanto el dump
como el manifiesto deben quedar fuera del repositorio, con acceso restringido.
La lectura de `pg_restore --list` por sí sola no comprueba la restauración.

Se exige TLS. `DATABASE_SSL_CA_PATH` permite validar una CA propia; sin ella
se usa TLS sin verificar el certificado, igual que `DATABASE_SSL=require` en
la configuración existente de la aplicación.

## Qué se carga

| Grupo | Selección |
|---|---|
| Usuarios | Usuarios reales, cuentas de login y permisos del mapa |
| Reportes | Partes, afectaciones, movimientos, alcance de servicios y adjuntos |
| Gestión Educativa | Corte vigente y cortes referenciados por reportes; secciones de escuelas presentes en el mapa, membresías e identidades cifradas necesarias |
| Capas territoriales | Versiones disponibles en producción de aislamiento, geometrías, susceptibilidad y exposición de rutas/ríos |
| Riesgo | Dos corridas publicadas más recientes, snapshots, factores y cortes asociados |
| Pronóstico | Dos corridas más recientes por proveedor y variable |
| Observaciones satelitales | Últimas 72 horas |
| Hidrometría, lluvia, alertas y verificación | Últimos 14 días |
| Radar | Dos corridas completas por proveedor/modelo/grilla; ensemble por modelo |
| Climatología | Catálogos y series completos |
| Veredictos | Últimos 14 días, con los jobs referenciados para trazabilidad |
| Recursos del hub | Sólo `recurso-infraestructura` y sus relaciones de acceso |

El corte GE vigente debe ser único. Se excluyen asignaciones de nivel de
escuelas ausentes del mapa. Si un corte en estado `importando` es necesario
para un reporte histórico, se conserva como `historico`.

Se vacían sesiones, tokens temporales, borradores, enlaces de verificación,
logs de acceso/SSO, contadores de cuota y presupuestos de IA. Las cuentas
conservan el hash de contraseña; se eliminan sus access/refresh/ID tokens.
Los jobs importados conservan su trazabilidad, sin leases de producción.
El usuario debe iniciar una sesión nueva en staging.

El seed de la aplicación respeta un catálogo que sólo contiene
`recurso-infraestructura`: no vuelve a agregar natalidad al reiniciar.
Las instalaciones con catálogo completo mantienen su comportamiento anterior.

Las identidades nominales permanecen cifradas. Para abrirlas, la aplicación
de staging necesita una configuración de cifrado compatible. Este comando
no extrae ni cambia claves de cifrado. Los adjuntos conservan sus referencias
a objetos; el comando no copia, elimina ni modifica objetos en OBS.

## Garantías y validación

- Compara nombres reales de las bases, columnas y hashes de migraciones.
- Aborta si aparece una tabla sin clasificar: las tablas nuevas requieren
  una decisión explícita en `scripts/lib/reconstruir-staging-plan.mjs`.
- Mantiene un snapshot `REPEATABLE READ READ ONLY` durante la extracción.
- Carga padres antes que hijos y conserva las claves de origen.
- Vacía staging sin `CASCADE`: una dependencia fuera del alcance aborta.
- Verifica conteos, escuelas de los reportes, cortes, membresías, identidades
  afectadas, secciones afectadas, riesgo y permisos antes del commit.
- Ante un error, revierte la limpieza y toda la carga.

```bash
pnpm exec vitest run scripts/reconstruir-staging.test.ts
pnpm exec tsc --noEmit --incremental false
```

También se comprobó una reconstrucción en PostgreSQL 17 aislado y un fallo
provocado durante la carga de factores de riesgo: el destino conservó sus
datos anteriores después del rollback.

### Aplicación del 16 de octubre de 2026

Se aplicó sobre `hub_staging` un snapshot de producción del
`2026-10-16T15:18:46.932Z`: 2.005 localizaciones, 9 usuarios y 6 reportes reales.
Los lectores de la aplicación resolvieron 1.999 escuelas ubicadas, 6 sin
ubicación válida, 5 reportes vigentes y 2.001 escuelas por capa territorial.
Dos arranques posteriores conservaron el catálogo exclusivo de infraestructura.
Pasaron 27 tests focalizados, TypeScript y lint de los archivos TypeScript
modificados. Producción se utilizó exclusivamente en modo de solo lectura.

## Alcance del modelo

Esta reconstrucción normaliza la selección y sus relaciones sobre el modelo
operativo. La fase posterior agregó [datasets versionados](datasets-infraestructura.md),
con registros, procedencia, dependencias y publicación transaccional de capas.
Staging ya contiene esas migraciones adicionales: el comando de reconstrucción
abortará al compararlo con producción y no debe usarse para sobrescribir el
esquema nuevo. La promoción de datasets utiliza `pnpm datasets:replicar`.

## Recuperación

Si la carga falla antes del commit, no hace falta restaurar. Para revertir
una carga ya confirmada, detener escrituras de staging y restaurar el dump
completo verificado sobre `hub_staging` con `pg_restore --clean --if-exists
--no-owner --no-privileges --single-transaction --exit-on-error`. Comprobar conteos y acceso antes
de reanudar escrituras. No usar esta operación sobre producción.
