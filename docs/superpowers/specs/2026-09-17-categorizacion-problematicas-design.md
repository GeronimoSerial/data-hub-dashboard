# Categorización de problemáticas — diseño

Fecha: 2026-09-17
Rama: `feat/alumnos`

## Problema

Hoy toda problemática es igual: motivo + severidad + secciones (+ alumnos
individuales opcionales). Pero hay dos naturalezas distintas:

1. **Afecta al establecimiento** — la escuela (o parte de ella) queda fuera de
   servicio. Se eligen secciones completas; no tiene sentido bajar a alumnos
   individuales.
2. **Inaccesibilidad de alumnos** — la escuela funciona, pero determinados
   alumnos no pueden llegar. Acá sí se eligen alumnos específicos dentro de
   cada sección.

El sistema no distingue ambos casos: el selector ofrece alumnos siempre, y el
mapa dibuja un punto idéntico para los dos.

## Decisiones tomadas

| Decisión | Resolución |
|---|---|
| Categoría | Columna propia `infra_problematica.categoria`, no derivada en runtime |
| Catálogo de categorías | **Fijo en código**: exactamente dos |
| Motivos | **Datos**, con ABM desde el admin; cada motivo pertenece a una categoría |
| UI del formulario | Dos controles separados: primero Tipo, luego Motivo filtrado |
| Alcance de `establecimiento` | Secciones completas elegibles (no toda la escuela por definición) |
| Mapa | Dos capas con símbolo distinto, color sigue siendo severidad |

## 1. Modelo de datos

### Categorías (fijas, en código)

Archivo nuevo `lib/infraestructura/categorias.ts`:

```ts
export const CATEGORIAS = ['establecimiento', 'alumnos'] as const
export type CategoriaProblematica = (typeof CATEGORIAS)[number]

export const CATEGORIA_META: Record<CategoriaProblematica, {
  label: string
  descripcion: string
  permiteAlumnos: boolean
}> = {
  establecimiento: {
    label: 'Afecta al establecimiento',
    descripcion: 'La escuela o parte de ella queda fuera de servicio.',
    permiteAlumnos: false,
  },
  alumnos: {
    label: 'Inaccesibilidad de alumnos',
    descripcion: 'La escuela funciona, pero hay alumnos que no pueden llegar.',
    permiteAlumnos: true,
  },
}

export function esCategoria(v: string): v is CategoriaProblematica
```

`permiteAlumnos` es la **única** fuente de verdad sobre si una categoría admite
selección nominal. Ni el formulario ni el POST deciden esto por su cuenta.

### Motivos (tabla nueva)

```ts
export const infraMotivo = sqliteTable('infra_motivo', {
  id: text('id').primaryKey(),          // slug estable, p.ej. 'inundacion'
  nombre: text('nombre').notNull(),
  categoria: text('categoria').notNull(), // 'establecimiento' | 'alumnos'
  orden: integer('orden').notNull().default(0),
})
```

Semilla inicial (reparto acordado; `Otro` existe en ambas categorías con ids
distintos porque es el comodín de cada una):

| id | nombre | categoria | orden |
|---|---|---|---|
| `inundacion` | Inundación | establecimiento | 10 |
| `tormenta-severa` | Tormenta severa | establecimiento | 20 |
| `sin-energia-o-agua` | Sin energía o agua | establecimiento | 30 |
| `evacuacion-preventiva` | Evacuación preventiva | establecimiento | 40 |
| `otro-establecimiento` | Otro | establecimiento | 90 |
| `anegamiento` | Anegamiento | alumnos | 10 |
| `acceso-interrumpido` | Acceso interrumpido | alumnos | 20 |
| `otro-alumnos` | Otro | alumnos | 90 |

`infra_problematica.motivo` sigue guardando el **nombre** (texto libre
histórico, no FK) para no romper las filas existentes ni la consulta por
`p.motivo` que ya usa el filtro del mapa. El id sólo se usa en el ABM y en el
form.

### Columna `categoria` en `infra_problematica`

```ts
categoria: text('categoria').notNull(),
```

### Integridad: la categoría la resuelve el servidor

El cliente envía `motivo` (nombre). El POST busca ese motivo en `infra_motivo`
y **persiste la categoría que dice la tabla**, ignorando cualquier `categoria`
que venga en el body. El campo "Tipo" del formulario es sólo UI de filtrado.

Regla adicional: si la categoría resuelta tiene `permiteAlumnos: false` y el
body trae `alumnos` no vacío → `400`, mensaje
`"Esta categoría no admite selección de alumnos"`.

Si el motivo no existe en la tabla → `400 "Motivo inválido"`.

## 2. Migración

**No hay archivos de migración en este repo.** `lib/db/seed.ts` aplica un
`HUB_DDL` idempotente (`CREATE TABLE IF NOT EXISTS`) en cada arranque, y
`seed.test.ts` verifica que correrlo dos veces no pierde ni duplica filas.

- `infra_motivo` se agrega a `HUB_DDL` como un `CREATE TABLE IF NOT EXISTS`
  más, **en el mismo bloque**, respetando el comentario que ya está ahí.
- La columna `infra_problematica.categoria` necesita `ALTER TABLE ADD COLUMN`,
  que en SQLite **no** es idempotente. Va un helper que consulta
  `PRAGMA table_info('infra_problematica')` y sólo aplica el ALTER si la
  columna falta. Se agrega como `text` sin `NOT NULL` en el ALTER (SQLite no
  permite agregar columnas NOT NULL sin default a tablas con filas); el schema
  de Drizzle la declara notNull y el backfill la completa antes de que
  cualquier lectura la use.
- Backfill: después del ALTER, un `UPDATE infra_problematica SET categoria = ?
  WHERE categoria IS NULL AND motivo IN (...)` por cada categoría, usando el
  mapeo nombre→categoría de la semilla. Cualquier motivo desconocido cae a
  `establecimiento` (el caso conservador: no expone identidades de alumnos).
- Los motivos semilla se insertan con `onConflictDoNothing` para que un admin
  pueda borrarlos sin que vuelvan a aparecer en el próximo arranque.

El test de idempotencia de `seed.test.ts` debe seguir pasando y hay que
extenderlo para cubrir el ALTER condicional.

## 3. ABM de motivos en el admin

### API

Ruta nueva `app/api/infraestructura/motivos/route.ts`:

- `GET` — staff autenticado. Devuelve todos los motivos ordenados por
  `categoria, orden, nombre`.
- `POST` — sólo admin. Upsert por `id` (`{ id, nombre, categoria, orden }`).
  Valida `categoria` con `esCategoria`. Rechaza nombre vacío.
- `DELETE` — sólo admin. Bloquea con `400` si hay filas en
  `infra_problematica` cuyo `motivo` coincide con el nombre del motivo:
  `"No se puede eliminar: hay problemáticas asociadas"`.

**No** se extiende `/api/taxonomia/[kind]`. Esa familia pertenece al dominio de
recursos — su `taxonomyInUseCount` cuenta exclusivamente contra la tabla
`recursos`. Meter infraestructura ahí rompe el límite del módulo.

Los guards de admin siguen el patrón exacto de
`app/api/taxonomia/[kind]/route.ts` (`staffGuard` + `role !== 'admin'`).

### UI

Pestaña nueva **"Motivos"** en `components/admin-page.tsx`, junto a
Categorías / Niveles / Tipos / Etiquetas. Mismo patrón de tabla editable que
las otras taxonomías, con una columna Categoría que es un `Select` de las dos
opciones fijas.

## 4. Formulario público

`app/(publico)/problematicas/nueva/page.tsx` (server component) lee los motivos
de la DB y los pasa como prop a `FormularioProblematica`. **No se expone un
endpoint público nuevo.**

`components/infraestructura/formulario-problematica.tsx`:

- Campo nuevo **Tipo de problemática**, radios (no Select): son dos opciones
  mutuamente excluyentes, visibles de una, y es el control que define el resto
  del formulario. Va arriba de Motivo.
- **Motivo** muestra sólo los motivos de la categoría elegida. Queda
  deshabilitado hasta que haya tipo.
- Al cambiar el tipo se limpian `motivo` y `alumnosSeleccionados`
  (`seccionesSeleccionadas` se conserva: las secciones siguen siendo válidas).
- `SeccionesSelector` recibe `permiteAlumnos` desde
  `CATEGORIA_META[tipo].permiteAlumnos`.

### Motivo y severidad siguen usando `<select>` nativo

Hay un comentario deliberado en `formulario-problematica.tsx` explicando por
qué: este formulario lo llena un director desde el celular, sin cuenta y a
veces con mala conexión. El nativo abre el picker del SO, funciona con lectores
de pantalla sin configuración extra y no tiene bugs de touch/scroll.
**Ese comentario se mantiene y se actualiza** para dejar constancia de que la
decisión se revisó al introducir las categorías.

El `Select` de shadcn/base se usa en el **admin**, que es escritorio y con
sesión.

### `SeccionesSelector`

`components/infraestructura/secciones-selector.tsx` gana
`permiteAlumnos?: boolean` (default `true`, para no romper llamadores).

Cuando es `false`:

- No se renderiza el botón "Elegir alumnos" ni el panel de alumnos.
- `alternarSeccion` no pasa por `aplicarEfectivo`: agrega o quita el
  `geSectionId` y emite siempre `alumnosSeleccionados: []`.
- Ningún checkbox de sección queda en estado indeterminado.
- El checkbox "Todas las secciones" sigue funcionando igual.

La semántica documentada en `validacion.ts` (sección sin alumnos explícitos =
sección completa) **no cambia**; simplemente en esta categoría nunca se generan
alumnos explícitos.

## 5. Mapa

### Datos

`AlertaActiva` en `lib/infraestructura/consulta.ts` gana
`categoria: CategoriaProblematica`. `listarAlertasActivas` la selecciona de
`p.categoria`.

No se agrega filtro de categoría al panel: la distinción se hace por capas.

### Render

`components/mapas/map-infraestructura-page.tsx`:

- La agrupación pasa de `cueAnexo` a la clave compuesta `cueAnexo|categoria`.
  Una escuela con ambas categorías produce **dos** features en las mismas
  coordenadas.
- Dos `Source`/`Layer`:
  - `infra-alertas-establecimiento`: círculo relleno, `circle-color` = color de
    severidad (igual que hoy).
  - `infra-alertas-alumnos`: anillo hueco — `circle-opacity: 0`,
    `circle-stroke-width: 3`, `circle-stroke-color` = color de severidad.
    Se dibuja **encima** de la capa de establecimiento, de modo que una escuela
    con ambas se ve como ◉.
- `peorAlerta` se aplica **dentro de cada grupo** (por categoría), no sobre
  todas las alertas del CUE.
- El click sigue resolviendo a la ficha; si hay dos features superpuestas, la
  ficha lista las alertas de ambas categorías para ese CUE.

`components/mapas/layer-control.tsx`: dos toggles, uno por capa, ambos
encendidos por defecto.

`components/mapas/legend-panel.tsx`: explica que el **símbolo** es la categoría
(● establecimiento, ○ alumnos) y el **color** es la severidad.

`components/infraestructura/ficha-alerta.tsx` y el popup muestran la categoría
de cada alerta.

## 6. Admin: alta de problemáticas

`ProblematicaForm` en `admin-page.tsx` gana el `Select` de Tipo y filtra los
motivos (traídos de `/api/infraestructura/motivos`) por esa categoría.

**Fuera de alcance**: el alta del admin sigue sin permitir elegir alumnos
individuales — sólo secciones completas, para ambas categorías. Es el
comportamiento actual y no se degrada.

## 7. Testing

Tests a extender o crear:

- `lib/db/seed.test.ts` — idempotencia con el ALTER condicional y la tabla
  nueva; backfill correcto de filas preexistentes.
- `lib/infraestructura/validacion.test.ts` — motivo inexistente → error;
  categoría `establecimiento` + alumnos → error.
- `app/api/problematicas/route.test.ts` — la categoría persistida es la del
  motivo, no la del body; body con `categoria` mentida se ignora.
- `app/api/infraestructura/motivos/route.test.ts` (nuevo) — guards de rol,
  upsert, DELETE bloqueado por uso.
- `components/infraestructura/secciones-selector.test.tsx` — con
  `permiteAlumnos: false` no hay botón "Elegir alumnos" y nunca se emiten
  alumnos.
- `app/(publico)/problematicas/nueva/page.test.tsx` — cambiar el tipo limpia
  motivo y alumnos; los motivos ofrecidos son los de la categoría.
- `lib/infraestructura/consulta.test.ts` — `categoria` viaja en `AlertaActiva`.

## Criterios de aceptación

1. Una problemática de categoría `establecimiento` nunca tiene filas en
   `infra_problematica_alumno`, ni siquiera si el cliente las manda.
2. Un admin puede crear un motivo nuevo, asignarle categoría, y ese motivo
   aparece en el formulario público bajo el tipo correcto sin redeploy.
3. Una escuela con una problemática de cada categoría se ve en el mapa como un
   punto relleno con un anillo alrededor, cada uno con el color de la severidad
   peor de su propia categoría.
4. Apagar la capa "Inaccesibilidad de alumnos" deja sólo los puntos rellenos.
5. Las problemáticas que ya existían en la base quedan categorizadas por su
   motivo, sin filas huérfanas ni `categoria` nula.
6. `pnpm test` y `pnpm lint` pasan.
