# SYNC MAIN — Registro de ejecución

Objetivo: integrar `main` (mapa de natalidad, roles/recursos-por-usuario,
recurso sin acceso con candado en el catálogo, hotfix de pestañas centradas,
etc. — commits no presentes en `feat/renovación`) en
`/home/gero/orca/workspaces/data-hub-dashboard/enos-sync-main`, rama
`feat/enos-sync-main`, base `feat/renovación` con DB1 (PostgreSQL) y el
pulido visual del mapa de infraestructura ya mergeados (`170c89a`). Se hizo
con `git merge` (no rebase), como pidió el usuario porque `feat/renovación`
ya tiene merges publicados.

Rol: N2 (sonnet). Coordiné, delegué a N3 (`opencode run --auto -m
opencode-go/deepseek-v4.1-flash`, uno por vez, en primer plano) y verifiqué
yo mismo leyendo el diff real y corriendo `tsc`/`vitest`/`lint`/`build`/curl
antes de aceptar cada resolución — regla dura del usuario: no edité código,
tests ni scripts. Este documento y los comandos `git merge`/`status`/
`diff`/`log`/`add`/`commit` (además de las verificaciones: `tsc`, `vitest`,
`lint`, `build`, `drizzle-kit`, `curl`) son lo único que hice directamente.

## Conflictos y cómo se resolvieron

`git merge main --no-commit --no-ff` dejó 8 archivos en conflicto de
contenido más 1 add/add. Merge-base: `f4cc0eb9`.

1. **`app/globals.css`** (8 bloques): regla del pulido manda para el mapa de
   infraestructura. Investigación (N2) reveló que el aparente choque no era
   "un lado gana": HEAD tenía clases `.mapa-buscador-escuela-*` (buscador
   genérico, infraestructura) y `main` tenía `.natalidad-buscador-*`
   (buscador específico de natalidad) con los MISMOS cuerpos CSS pero
   selectores distintos — dos componentes distintos, no una superposición.
   N3 expandió ambos conjuntos completos de reglas (ninguno se descarta) más
   el contenido puramente aditivo de cada lado (`.evolucion-*`,
   `.verificacion-*`, `.situacion-*` de HEAD; `.natalidad-filtro-*`,
   `.natalidad-title-panel`, `.natalidad-kpis`, etc. de main).
2. **`components/mapas/escuela-search-box.tsx`** (add/add): dos componentes
   `EscuelaSearchBox` con el mismo nombre de archivo pero propósitos
   distintos (genérico reutilizable en HEAD vs. específico de natalidad en
   main). Resolución: el archivo original queda con la versión de HEAD; la
   de main se movió a `components/mapas/natalidad-escuela-search-box.tsx`
   con el export renombrado a `NatalidadEscuelaSearchBox`, y se actualizó el
   import/uso en `components/mapas/map-natalidad-page.tsx` (archivo nuevo de
   main, sin conflicto).
3. **`lib/db/schema.ts`**: conflicto chico (columna `accesoRecursos` en
   `user`) + una tabla completa que el auto-merge de git insertó tal cual
   desde main usando `sqliteTable` (`userRecursos`). Regla dura del proyecto:
   DB1 usa PostgreSQL (pg-core), nunca SQLite. N3 portó `userRecursos` a
   `pgTable` siguiendo el patrón exacto de `userNiveles` (misma tabla,
   mismo archivo), y agregó `accesoRecursos: text('acceso_recursos')
   .notNull().default('todos')` sin el comentario original sobre `ALTER
   TABLE`/SQLite (ya no aplica: en Postgres esta columna nace declarada y se
   aplica vía migración de drizzle-kit).
4. **`lib/db/seed.ts`** + **`lib/db/seed.test.ts`** (el segundo sin
   marcadores de conflicto pero con un test que dependía de lo que se borró
   en el primero): regla dura explícita del usuario, "Nada de
   `ensure*Column*` ni `HUB_DDL`". Se descartó por completo el bloque
   `HUB_DDL` (DDL SQLite embebido) y las tres funciones
   `ensureMovimientoIdempotencyKeyColumn`, `ensureAccesoNominalLogAfectacionIdColumn`
   y `ensureAccesoRecursosColumn` (workarounds de `ALTER TABLE` en runtime,
   típicos de SQLite). Confirmado en `lib/db/schema.ts` que las columnas que
   esas funciones parcheaban (`idempotencyKey`, `afectacionId`,
   `accesoRecursos`) ya nacen declaradas en el schema pg-core. En
   `seed.test.ts` se borró el test de `ensureAccesoRecursosColumn` (función
   que ya no existe) y se reescribió el test estructural de `user_recursos`
   contra Postgres real (`pg_tables`/`information_schema.columns` en vez de
   `sqlite_master`/`PRAGMA table_info`).
5. **`package.json`**: conflicto aditivo trivial en `scripts` (`
   import:geo-static` de HEAD + `extract:natalidad` de main), se quedaron
   ambas líneas.
6. **`components/infraestructura/indicadores.tsx`**: HEAD (grid del pulido,
   `map-indicadores-grid`) ya cubre los mismos 8 indicadores que main
   renderizaba a mano; se descartó el bloque de main completo.
7. **`components/infraestructura/lista-alertas.test.tsx`**: el test que
   entraba en conflicto testeaba, del lado de main, una función de búsqueda
   por CUE que ya no existe en el componente actual (reemplazada por el
   panel colapsable "Filtros del mapa" del pulido, confirmado con grep sobre
   `lista-alertas.tsx`); se descartó el bloque de main.
8. **`components/infraestructura/reporte-inicial-form.tsx`** (el más
   complejo, 3 bloques): **primer intento fallido** — asumí que HEAD era
   siempre el lado "más nuevo" y le pedí a N3 que descartara los 3 bloques de
   main sin verificar. N3 corrió `tsc` después y encontró 10 errores reales:
   HEAD referenciaba `servicioAlcanceTipo`/`servicioTurnos`/
   `servicioSecciones`, variables que YA HABÍAN SIDO ELIMINADAS por el
   auto-merge en otra parte del mismo archivo (esa eliminación viene de
   `main`, no de HEAD). N3 se frenó, no inventó una resolución, y reportó la
   contradicción con evidencia (`git show :2:`/`:3:` de cada stage). Investigué
   con `git log`/`git show` de los dos commits que causaban la divergencia:
   `8353c19` (HEAD, "integrar el envío offline en los formularios") agregó
   una cola de envío offline con reintento automático; `3a0a8fa` (main, "fix:
   corregir flujo y lenguaje del funcionamiento escolar", **del mismo autor,
   geronimo@icvmhawk.com** — un fix real, no una feature en competencia)
   eliminó el concepto de "alcance de la suspensión" manual
   (turnos/secciones elegibles aparte) y lo simplificó: el alcance siempre es
   las mismas secciones ya marcadas como afectadas en el paso 2. Los dos
   commits parten del mismo ancestro (`82d86bd`) y hacían falta los dos.
   Reescribí el brief con la reconciliación exacta (motor de cola offline de
   HEAD + flujo simplificado de main) y se lo pasé a un N3 fresco, que
   aplicó los 3 bloques, corrigió además un detalle que el brief no había
   anticipado (`colapsarHistorial(indicePaso)` en vez de `colapsarHistorial(paso
   - 1)`, necesario porque `pasosDe` ahora salta el paso 3 para la categoría
   `alumnos`) y verificó `tsc`/`vitest` (29/29) antes de dar el visto bueno.

## Incidente: `git stash` durante el merge (autocorregido)

Mientras investigaba si un error de lint era preexistente, corrí `git stash
push -u` para probar el estado pre-merge — **error mío**: `git stash` durante
un `git merge --no-commit` en curso borra `MERGE_HEAD` (el índice con las
resoluciones queda intacto en el stash, pero git deja de saber que está en
medio de un merge). Lo detecté enseguida (`.git/MERGE_HEAD` no existía más),
restauré el contenido con `git stash apply <sha>` (nunca `pop`, por la regla
del entorno) y reconstruí `MERGE_HEAD` a mano escribiendo el sha de `main`
(`bc6f40e`) en `<gitdir>/MERGE_HEAD` — es sólo un puntero, no hay pérdida de
datos, y `git status` volvió a reportar "All conflicts fixed but you are
still merging" correctamente. Verifiqué `tsc` limpio y 0 marcadores de
conflicto inmediatamente después para confirmar que no se había perdido nada.
No volví a usar `git stash` en el resto de la tarea.

## Rutas no conflictivas que necesitaron trabajo igual

- Después de que todos los conflictos quedaron resueltos, `tsc --noEmit`
  reportó 122 errores en 29 archivos de test: el tipo `SessionUser` (en
  `lib/acl.ts`, feature de roles) ganó los campos `accesoRecursos`/
  `recursoIds`, y muchos tests viejos construían el objeto a mano sin esos
  campos. N3 escribió un codemod puntual (fuera del repo, en `/tmp`, borrado
  al terminar) para agregar los defaults (`accesoRecursos: 'todos' as const,
  recursoIds: []`) en los 24 archivos de test afectados (67 literales reales,
  no 122 — ese número contaba líneas de continuación del mensaje de error).
  Verificado: `tsc --noEmit` queda en 0 errores.
- `pnpm lint` fallaba con un error de `react-hooks/immutability` en
  `reporte-inicial-form.tsx` (`manejarEnvio` referenciada antes de su
  declaración, dentro de un `useEffect`) — confirmé que este problema ya
  existía en el HEAD pre-merge (mismo patrón, sólo con otros números de
  línea, verificado con `git show 170c89a:...`), no lo introdujo el merge,
  pero había que dejarlo limpio igual. N3 reordenó la declaración de la
  función antes del efecto que la usa (subiendo también `pasos`/`indicePaso`,
  de las que depende) sin tocar lógica. Verificado: `lint`/`tsc` limpios,
  29/29 tests del archivo siguen verdes.
- `drizzle-kit generate` (corrido por mí, N2) generó
  `drizzle/0002_empty_frank_castle.sql`: `CREATE TABLE user_recursos` + `ALTER
  TABLE user ADD COLUMN acceso_recursos text DEFAULT 'todos' NOT NULL` + la FK
  de `user_recursos.recurso_id`. `drizzle-kit check` → "Everything's fine",
  sin drift.
- La suite completa (`flock ... pnpm exec vitest run --maxWorkers=2`) dio 3
  fallos reales en la primera corrida, en 2 archivos:
  - `scripts/migrar-sqlite-a-postgres.test.ts` (2 tests): la nueva columna
    `acceso_recursos` (NOT NULL DEFAULT 'todos') rompía el script de
    migración legacy SQLite→Postgres porque `convertirFila()` convertía
    "columna ausente en el origen" (`undefined`) en un `null` EXPLÍCITO, que
    pisa el DEFAULT de Postgres. Fix (N3): si la columna no existe en el
    origen, se omite la clave del todo en vez de forzar `null`, para que
    Postgres aplique su DEFAULT. Sin efecto en columnas nullable sin
    default (mismo resultado final). 6/6 verde después.
  - `lib/mapas/recurso-seed-natalidad.test.ts` (1 test, timeout de 5000ms): mi
    brief inicial diagnosticó mal la causa (asumí que era sólo lento y pedí
    extender el timeout). N3 **no aceptó el diagnóstico sin verificar**:
    aplicó el fix, vio que el test pasaba a fallar por un assertion real
    (`expected [] to have length 1`) en vez de por timeout, y encontró la
    causa real — el test simulaba "reinicio de proceso" con
    `vi.resetModules()` pero sin fijar `PGLITE_DATA_DIR` ni limpiar la
    instancia cacheada en `globalThis` (ver DB1 FIX2), así que bajo Vitest
    cada `restart()` creaba una base PGlite en memoria NUEVA y vacía: el
    insert manual se perdía y por eso además se re-sembraban 2005 registros
    de `ge_localizacion` en cada reinicio (de ahí el timeout real). Corrigió
    el test para persistir la PGlite en un directorio temporal y limpiar la
    instancia cacheada entre reinicios, igual que hace el test hermano
    `lib/infraestructura/recurso-seed.test.ts`. 2/2 verde después, sin hacer
    falta ningún timeout extendido.
  - Segunda corrida completa de la suite (yo, N2): **229 archivos / 2099
    tests verdes** (+3 skipped preexistentes), 223s.

## Verificación final (corrida por mí, N2)

- `pnpm exec tsc --noEmit`: sin errores.
- `pnpm lint`: sin salida (limpio).
- `flock $HOME/.cache/enos-n3/heavy.lock pnpm exec vitest run --maxWorkers=2`:
  229/229 archivos, 2099/2099 tests, 3 skipped preexistentes.
- `pnpm exec drizzle-kit check`: "Everything's fine", sin drift.
- `flock $HOME/.cache/enos-n3/heavy.lock pnpm build`: build exitoso, todas
  las rutas generadas incluyendo `/mapas/natalidad`, `/admin`, `/explorar`.
- Demo en `:3203` (`DATA_DIR=/home/gero/orca/demo-data/enos-sync-main`,
  `ENOS_JOBS_ENABLED=false`, receta EN SERIE igual a la de
  `docs/ejecucion-enos/pulido/registro.md`, `.env.demo` propio con secretos
  generados de cero, no copiados de otra demo): login por `curl` contra
  `/api/auth/sign-in/email` → 200, y con la cookie de sesión:
  `/mapas/infraestructura` → 200, `/mapas/natalidad` → 200, `/admin` → 200,
  `/explorar` (catálogo) → 200. El feature de "recurso sin acceso con
  candado" se verificó por código (`components/resource-card.tsx` calcula el
  candado a partir de `recurso.acceso` que ya resuelve el servidor) y por la
  suite verde de `lib/acl.test.ts`/`app/api/hub/route.test.ts`, no hice login
  como usuario `consulta` con `accesoRecursos: 'seleccionados'` para ver el
  candado visualmente — queda para el QA visual de N1 si lo necesita.

## Demo — cómo relanzarla

```sh
cd /home/gero/orca/workspaces/data-hub-dashboard/enos-sync-main
set -a && source /home/gero/orca/demo-data/enos-sync-main/.env.demo && set +a
setsid pnpm dev -p 3203 > /home/gero/orca/demo-data/enos-sync-main/dev.log 2>&1 < /dev/null &
disown
```

`.env.demo` (en `/home/gero/orca/demo-data/enos-sync-main/.env.demo`, fuera
del repo, permisos 600): `DATA_DIR=/home/gero/orca/demo-data/enos-sync-main`,
`ENOS_JOBS_ENABLED=false`, `RISK_ENGINE_ENABLED`, `RISK_RADAR_ENABLED`,
`HAZARD_CONTEXT_ENABLED`, `SITUACION_ENABLED`, `SEASONAL_ENABLED`,
`EPISODIOS_DERIVADOS_ENABLED` en `true`, `NOMINAL_ENCRYPTION_KEY` (base64 32
bytes), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3203`,
`ADMIN_EMAIL=demo@enos.local`, `ADMIN_PASSWORD` (aleatoria, generada una vez
para esta demo, no rotada, no copiada de la demo de `enos-pulido`). Al cierre
de esta tarea la demo sigue arriba (pid del proceso `next dev -p 3203`
verificable con `pgrep -af "next dev -p 3203"`).

## Commit de merge

`git commit` (sin `--no-verify`, sin mensajes de IA) con el mensaje:
`Merge branch 'main' into feat/enos-sync-main`. Sin push, sin PR — queda para
que N1 lo audite e integre, como pidió el usuario.

## Qué queda pendiente para N1

- QA visual del candado de "recurso sin acceso" con un usuario `consulta` y
  `accesoRecursos: 'seleccionados'` real (no sólo cobertura de tests).
- No se revisaron visualmente los datos de natalidad en el mapa (KPIs,
  gráficos, buscador) más allá de que la ruta responde 200 y la suite de
  `lib/mapas/*` está verde — es un chequeo funcional, no un QA visual.
- El warning de build "Base URL is not set" / "You are using the default
  secret" (Better Auth) es sólo de la demo local sin `BETTER_AUTH_URL`
  resuelto en build-time para prerender; no bloqueó el build ni afecta el
  runtime real (la demo levantada sí tiene `BETTER_AUTH_URL` seteado).
