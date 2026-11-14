# Runbook de auditoría: medición, despliegue y reversión

La auditoría estricta registra cada cambio de base y cada rechazo en `auditoria_evento`.
Esta guía cubre cómo reproducir la medición de rendimiento, cómo desplegar la migración
0059 con los permisos del rol SQL, cómo verificar el despliegue y cómo revertirlo.
Todos los números de este documento son locales: salen de corridas en una máquina de
desarrollo contra PostgreSQL 17 en Docker. No hay resultados de staging ni de producción.

## Presupuesto

| Criterio | Límite | Resultado local |
|---|---|---|
| p95 de cada recorrido de escritura auditado | sube como máximo 5 ms | cumple en las 6 rutas; el máximo es +3,6 ms (foto) |
| Rutas no auditadas | sin cambio (dentro del ruido) | sin regresión detectada |
| Visor con 1.000.000 de eventos | p95 < 300 ms por página o filtro | cumple en los 10 recorridos; el más cercano es "acción rara" con 293 ms |

## Ejecutar la medición

El archivo `lib/infraestructura/auditoria/rendimiento.test.ts` es opt-in: sin `AUDITORIA_MEDIR=1`
todos sus casos se omiten.

Variables:

| Variable | Uso | Valor por defecto |
|---|---|---|
| `AUDITORIA_MEDIR` | activa la medición | (vacía: se omite) |
| `AUDITORIA_MEDIR_SECCIONES` | secciones a correr, separadas por coma: `escritura`, `lecturas`, `microbench`, `visor` | las cuatro |
| `DATABASE_URL` | PostgreSQL de la medición; debe terminar en `_test` | sin valor: PGlite temporal |
| `AUDITORIA_EVENTOS` | filas sembradas para el visor | `1000000` |
| `AUDITORIA_MUESTRAS` | muestras por modo y recorrido | `60` (tras 10 pares de calentamiento) |
| `AUDITORIA_MEDICION_ARCHIVO` | ruta del JSON de salida | `auditoria-medicion.json` en el directorio temporal del sistema |

PostgreSQL local para la medición:

```bash
docker run -d --name audit-medicion-pg -e POSTGRES_PASSWORD=<clave-local> \
  -e POSTGRES_DB=auditoria_medicion_test -p 55447:5432 postgres:17-alpine
```

Escritura (con y sin auditoría, modos alternados):

```bash
DATABASE_URL=postgres://postgres:<clave-local>@localhost:55447/auditoria_medicion_test \
AUDITORIA_MEDIR=1 AUDITORIA_MEDIR_SECCIONES=escritura \
AUDITORIA_MEDICION_ARCHIVO=/ruta/privada/escritura.json \
pnpm exec vitest run lib/infraestructura/auditoria/rendimiento.test.ts --maxWorkers=2
```

Lecturas no auditadas y costo de `getDb()`:

```bash
DATABASE_URL=postgres://postgres:<clave-local>@localhost:55447/<base_nueva>_test \
AUDITORIA_MEDIR=1 AUDITORIA_MEDIR_SECCIONES=lecturas,microbench \
AUDITORIA_MEDICION_ARCHIVO=/ruta/privada/lecturas.json \
pnpm exec vitest run lib/infraestructura/auditoria/rendimiento.test.ts --maxWorkers=2
```

Visor con un millón de eventos. Requiere una base nueva: si `auditoria_evento` tiene filas,
la prueba se detiene.

```bash
DATABASE_URL=postgres://postgres:<clave-local>@localhost:55447/<base_visor_nueva>_test \
AUDITORIA_MEDIR=1 AUDITORIA_MEDIR_SECCIONES=visor AUDITORIA_EVENTOS=1000000 \
AUDITORIA_MEDICION_ARCHIVO=/ruta/privada/visor.json \
pnpm exec vitest run lib/infraestructura/auditoria/rendimiento.test.ts --maxWorkers=2
```

La siembra se hace en tandas de 100.000 filas para no superar el `statement_timeout` de la
conexión (30 s por defecto). No se cambia ese valor para la medición.

Comparación con la base anterior a la auditoría (`09ecfd32`): se crea un worktree temporal
fuera del repositorio, se copia solo el archivo de medición, se instalan dependencias y se
corre la sección `lecturas,microbench`. Después se elimina el worktree (`git worktree remove --force`).
Con la base anterior no existe `auditoria_evento`, por lo que `escritura` y `visor` no aplican.

Al terminar: `docker rm -f audit-medicion-pg` y borrar los JSON si contienen rutas privadas.

### Entorno de la medición

- CPU: Intel Core i7-14700, 28 hilos lógicos (`lscpu`).
- RAM: 31.839 MB (`free -m`).
- PostgreSQL 17.11 (`postgres:17-alpine`, en Docker local).
- Node.js 24.15.0. Pool `pg` con `max` 10 (valor por defecto; `DATABASE_POOL_MAX` sin definir).
- `statement_timeout` 30 s (por defecto).

## Resultados medidos

### Escritura: handler completo, sin auditoría frente a con auditoría

Tres corridas completas, cada una en una base nueva. 60 muestras por modo tras 10 pares de
calentamiento. El "delta" es con auditoría menos sin auditoría. Se verificó en cada corrida
que el número de eventos escritos coincide con el número de llamadas auditadas (70 por recorrido).

| Recorrido | p50 sin (ms) | p95 sin (ms) | p50 con (ms) | p95 con (ms) | Δ p95 corrida 1 / 2 / 3 (ms) | Δ p95 mediana (ms) |
|---|---:|---:|---:|---:|---:|---:|
| `parte.guardar` (confirma afectación) | 13,06 | 15,14 | 13,24 | 15,90 | +0,76 / +0,48 / −1,87 | +0,48 |
| `borrador.sincronizar` (PUT) | 5,07 | 6,66 | 5,20 | 6,52 | −0,26 / +0,09 / +0,39 | +0,09 |
| `foto.autorizar_carga` | 1,07 | 1,60 | 4,23 | 5,20 | +3,70 / +3,60 / +3,28 | +3,60 |
| `verificacion.responder` | 4,21 | 5,54 | 5,04 | 6,25 | −0,02 / +0,71 / +0,51 | +0,51 |
| `motivo.guardar` (admin) | 3,89 | 4,40 | 3,95 | 4,73 | +0,77 / +0,24 / −0,21 | +0,24 |
| `cuadernillo.stock_guardar` | 5,88 | 6,75 | 5,92 | 7,07 | −0,82 / +0,99 / +1,06 | +0,99 |

La foto es el recorrido más cercano al límite: +3,6 ms de mediana frente a 5 ms de presupuesto.
Es el único que no tiene una transacción de dominio: su handler solo lee el movimiento y firma
URL, y el evento es su única escritura. Esa inserción se hace fuera de una transacción y paga su
propio commit. Es una explicación consistente con los datos, no algo que se haya aislado con
una prueba específica.

Ruido: la variación entre corridas del p95 de escritura es de aproximadamente ±1 ms. Una diferencia
menor de 1 ms no se considera un efecto.

### Lecturas no auditadas (PostgreSQL, tres corridas por código)

Sin auditoría en ninguna de las dos versiones. `09ecfd32` es la base anterior a la auditoría.
Las lecturas usan la base sembrada con el fixture de la prueba, que es pequeña: el resultado vale
para el costo del handler, no para cargas grandes.

| Recorrido | Versión | p50 (ms) corridas 1 / 2 / 3 | p95 (ms) corridas 1 / 2 / 3 |
|---|---|---|---|
| `infraestructura.situacion.get` | base `09ecfd32` | 2,90 / 2,90 / 2,89 | 6,11 / 3,55 / 3,55 |
| `infraestructura.situacion.get` | actual | 2,33 / 2,20 / 2,21 | 3,45 / 2,86 / 6,51 |
| `mapas.infraestructura.totales.get` | base `09ecfd32` | 3,10 / 2,93 / 3,18 | 3,77 / 4,08 / 4,25 |
| `mapas.infraestructura.totales.get` | actual | 2,34 / 2,31 / 2,38 | 3,11 / 3,25 / 3,67 |

Lectura: el p95 se superpone entre versiones (ruido de hasta ±3 ms en situación). En totales, el
p50 actual es unos 0,6 ms menor en las tres corridas. No se investigó la causa; puede ser el orden o
el estado de la máquina. No se afirma una mejora. La conclusión es que no se detecta regresión.

### Costo de `getDb()` (1.000.000 de llamadas)

| Versión | Sin contexto transaccional (ns/llamada) | Con contexto transaccional activo (ns/llamada) |
|---|---:|---:|
| base `09ecfd32` | 7,2 / 7,3 / 8,1 | no existe |
| actual | 13,5 / 15,9 / 13,2 | 19,8 / 21,6 / 19,4 |

El costo es de unos 6 ns por llamada, casi todo por la consulta a `AsyncLocalStorage`. En las
rutas auditadas esto se paga una vez por consulta y es despreciable frente a la latencia de red y
de base.

### Visor con 1.000.000 de eventos

Una corrida. Siembra de 1.000.000 de filas en 33 s (10 tandas). Después de `ANALYZE`, 105 solicitudes
por recorrido (100 medidas, 5 de calentamiento). La página 200 se alcanza encadenando cursores.

| Recorrido | p50 (ms) | p95 (ms) | p99 (ms) | Filas | p95 < 300 ms |
|---|---:|---:|---:|---:|:---:|
| Primera página (límite 50) | 0,85 | 1,62 | 1,77 | 50 | sí |
| Página 200 por cursor | 1,13 | 1,62 | 1,81 | 50 | sí |
| Actor (`u-337`) | 0,94 | 1,46 | 1,73 | 50 | sí |
| Acción frecuente (`parte.consultar`) | 0,98 | 1,39 | 1,51 | 50 | sí |
| Acción rara (`cuenta.operacion`, ~300 filas) | 250,94 | 293,38 | 312,32 | 50 | sí (7 ms de margen) |
| Acción sin coincidencias | 66,60 | 72,24 | 75,07 | 0 | sí |
| Objeto (sin índice) | 69,22 | 78,21 | 103,55 | 5 | sí |
| Rango de un día | 0,75 | 1,18 | 1,39 | 50 | sí |
| Resultado `exito` | 1,06 | 1,29 | 1,40 | 50 | sí |
| Resultado sin coincidencias (`error`) | 69,39 | 75,15 | 79,93 | 0 | sí |

Hay un punto a vigilar. El filtro por acción no tiene índice. Cuando la acción aparece poco, el
recorrido hacia atrás por `(ocurrido_en, id)` tiene que leer gran parte de la tabla hasta juntar 50
filas. Con 1.000.000 de filas, la acción rara queda a 293 ms de p95. Con más volumen, ese filtro
superaría el presupuesto. No se midió ningún índice candidato porque el resultado no supera 300 ms;
si se llega a superar, el candidato a medir es `(accion, ocurrido_en, id)`, con su efecto medido antes
de agregarlo a una migración. Sin índice, el filtro por objeto (`objeto_id`) tiene el mismo problema
de forma más leve (78 ms en este volumen).

### Almacenamiento (1.000.000 de filas)

| Medida | Valor |
|---|---:|
| Tamaño total (`pg_total_relation_size`) | 1.196 MB (1.196 bytes por fila, con índices) |
| Tabla (`pg_relation_size`) | 758 MB (758 bytes por fila) |
| Índices (`pg_indexes_size`) | 438 MB (438 bytes por fila) |
| `auditoria_evento_actor_fecha_idx` | 165 MB |
| `auditoria_evento_fecha_idx` | 147 MB |
| `auditoria_evento_pkey` | 126 MB |
| Metadatos promedio | 175 bytes |

Usar 1.200 bytes por fila para la proyección.

## Despliegue

### 1. Migración 0059

La migración `drizzle/0059_auditoria_evento.sql` es aditiva. Crea la tabla, sus dos índices, la
restricción de tamaño de `metadatos` (4 KiB), la función de trigger `auditoria_evento_solo_insercion`
y dos triggers: uno `BEFORE UPDATE OR DELETE` por fila y uno `BEFORE TRUNCATE` por sentencia.

La aplicación aplica las migraciones pendientes con `migrarDb()` (drizzle `migrate` sobre `./drizzle`).
Esa función también se invoca en tiempo de ejecución, por ejemplo al primer uso del visor o de un
job. Para aplicar antes de habilitar la nueva versión, se corre el mecanismo versionado del proyecto
con la URL del rol de migración, y luego se verifica:

```sql
SELECT count(*) AS migraciones_aplicadas FROM drizzle.__drizzle_migrations;
SELECT to_regclass('public.auditoria_evento') IS NOT NULL AS tabla_existe;
```

### 2. Permisos del rol de la aplicación

Requisito: el rol de la aplicación puede insertar y consultar `auditoria_evento`. No puede actualizar,
borrar ni truncar. Los triggers rechazan esas operaciones aunque el rol tuviera permiso, pero los
permisos son la primera barrera.

Reemplazar `<rol_aplicacion>` por el rol real. Ejecutar con el rol administrador:

```sql
GRANT INSERT, SELECT ON auditoria_evento TO <rol_aplicacion>;
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria_evento FROM <rol_aplicacion>;
```

Verificación de permisos (esperado: `t | t | f | f | f`):

```sql
SELECT has_table_privilege('<rol_aplicacion>', 'auditoria_evento', 'INSERT')   AS insertar,
       has_table_privilege('<rol_aplicacion>', 'auditoria_evento', 'SELECT')   AS consultar,
       has_table_privilege('<rol_aplicacion>', 'auditoria_evento', 'UPDATE')   AS actualizar,
       has_table_privilege('<rol_aplicacion>', 'auditoria_evento', 'DELETE')   AS borrar,
       has_table_privilege('<rol_aplicacion>', 'auditoria_evento', 'TRUNCATE') AS truncar;
```

Dueño de la tabla. Un dueño conserva sus privilegios aunque se le quiten con `REVOKE`. Por eso el
rol de la aplicación no debe ser el dueño de `auditoria_evento`:

```sql
SELECT tableowner FROM pg_tables WHERE tablename = 'auditoria_evento';
```

El resultado debe ser distinto de `<rol_aplicacion>`. Si la aplicación ejecuta `migrarDb()` con su
propio rol y esa es la única vía, el dueño será ese rol: en ese caso la protección efectiva queda en
los triggers, y conviene separar el rol de migración del rol de ejecución antes de habilitar.

Triggers (esperado: los dos triggers, `O` = habilitados):

```sql
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'auditoria_evento'::regclass AND NOT tgisinternal
ORDER BY tgname;
```

Esperado:

```
auditoria_evento_sin_truncate | O
auditoria_evento_solo_insercion | O
```

Comprobado en una base local: con el rol de prueba, `UPDATE` y `TRUNCATE` fallan con
`auditoria_evento es de solo inserción`, y los permisos dieron `t | t | f | f | f`.

### 3. Verificación posterior al despliegue

Eventos entrantes (cada hora de las últimas 24 horas; debe haber filas en horas de uso):

```sql
SELECT date_trunc('hour', ocurrido_en) AS hora, count(*)
FROM auditoria_evento
WHERE ocurrido_en > now() - interval '24 hours'
GROUP BY 1 ORDER BY 1;
```

Fallas de persistencia. La aplicación registra cada falla con la etiqueta
`[auditoria] persistencia fallida` y responde 503 `auditoria_no_disponible`. Revisar los logs de la
aplicación después del despliegue. Una tasa sostenida de esas líneas, o cualquier 503 con ese código,
significa que el evento no se guarda y el cambio se revierte. Tratar como incidente.

Crecimiento de la tabla (estimación rápida, sin `count(*)` sobre la tabla completa):

```sql
SELECT pg_size_pretty(pg_total_relation_size('auditoria_evento')) AS total,
       (SELECT reltuples::bigint FROM pg_class WHERE relname = 'auditoria_evento') AS filas_estimadas;
```

## Reversión

1. Revertir la imagen de la aplicación a la versión anterior.
2. No borrar `auditoria_evento`. Los eventos ya escritos son el registro de auditoría.
3. No revertir la migración: la tabla, sus índices y sus triggers se mantienen. Si hubiera que
   quitarlos, se decide con el dueño, nunca como paso de reversión de código.
4. Los triggers de solo inserción no se desactivan.

La versión anterior no audita. Volver a ella no es un estado de cumplimiento: los cambios hechos
mientras opera no generan evento. Documentar el intervalo sin auditoría.

## Crecimiento

Fórmula:

```
filas por mes = 30,4 × (escrituras auditadas por día
                       + 2 × corridas de job por día
                       + lecturas sensibles auditadas por día)

bytes por mes = filas por mes × 1.200 (medido, con índices)
```

Los eventos de job son dos por corrida (intención y resultado). Las lecturas auditadas son las
sensibles (nominal, exportaciones, PDF, enlaces, fotos). El visor no se audita y las lecturas
automáticas del mapa no se auditan.

Entradas. El tráfico real es desconocido: todos los valores son supuestos a confirmar con datos de
producción.

| Escenario | Escrituras/día (supuesto) | Corridas de job/día (supuesto) | Lecturas sensibles/día (supuesto) | Filas/mes | Tamaño/mes |
|---|---:|---:|---:|---:|---:|
| Bajo | 500 | 50 | 200 | ~ 24.300 | ~ 29 MB |
| Medio | 2.000 | 300 | 1.000 | ~ 110.000 | ~ 130 MB |
| Alto | 10.000 | 1.000 | 5.000 | ~ 516.800 | ~ 620 MB |

Con el escenario medio, un año ronda 1,3 millones de filas y 1,6 GB. Con el alto, un año ronda
6,2 millones de filas y 7,4 GB.

## Particionado y retención

Particionado mensual y retención se activan con un número medido, no antes. Umbrales de referencia
(regla práctica, a revisar con datos reales; no son medidos):

- Revisar particionado cuando la tabla pase de unos 10 GB o de unos 50 millones de filas, o cuando
  el p95 de una página del visor supere 150 ms con el volumen real.
- Revisar la retención cuando haya requisito legal o de operación que defina el plazo.

La retención la decide el dueño del sistema. Esta guía no define plazos. Ninguna limpieza se
ejecuta sin esa decisión, y la tabla es de solo inserción: cualquier retención requiere un cambio
explícito en el diseño (por ejemplo, particiones que se adjuntan y se quitan completas).

## Variables y campos de los eventos de job

- `INFRA_AUDIT_OPERATOR`: identidad del operador de un job o de un comando de datasets. Por defecto
  `infra-jobs` o `infra-datasets`.
- `INFRA_AUDIT_TRIGGER`: `manual` o `programado`. Si no se define, `systemd` cuando existe
  `INVOCATION_ID`, y `cli` en otro caso.
- `INVOCATION_ID`: id de invocación de systemd; se guarda en los metadatos.
- `region`: en los metadatos de los eventos de Manaos y de Corrientes. Lo permite la lista de metadatos.

## Excepciones documentadas (A1 a A3)

1. Inicio de sesión ge (`/api/auth/ge-login`). La lógica (`lib/ge-sso/handlers.ts`, función
   `manejarGeLogin`) no corre dentro de `cambioAuditado`. El evento se escribe después de que el
   handler responde. Si esa escritura falla, la respuesta es 503 sin cookies, pero un efecto que el
   handler ya haya confirmado no se revierte. Es un caso a revisar antes de dar por cerrada la
   garantía de inicio de sesión.
2. Página pública de veredicto compartido (`/veredicto/compartido/[token]`). Es un Server Component
   que usa `lecturaAuditada`. Si la inserción de auditoría falla, la página lanza la excepción y el
   usuario ve la página de error de Next, no una respuesta 503 en JSON.
