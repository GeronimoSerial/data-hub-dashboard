# Partes — Fase 0 (estado de envío) + Fase 1 (modelo de datos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el estado de envío de un parte diga la verdad (sin "sin conexión" estando online) y dejar listo el modelo de datos del rediseño: gravedad sugerida por motivo, criterios por categoría, justificación de Crítica, vínculo causal, cierre "solucionada", regla Evacuado ⇒ sin clases y relevancia.

**Architecture:** Fase 0 corrige el motor `lib/infraestructura/parte/envio-offline.ts` (nuevo estado `error-servidor`, reenvío desde la cola, reintento programado) y lo cablea en los dos formularios. Fase 1 agrega columnas nullable vía una migración drizzle-kit (`drizzle/0008_*`), reglas puras en `lib/infraestructura/` y su enforcement en `POST /api/problematicas/parte`. No cambia UI del wizard salvo el ABM de motivos (Fases 2–3 consumen lo de acá).

**Tech Stack:** Next.js App Router, TypeScript, Zod v4, drizzle-orm 0.45 + drizzle-kit 0.31 (Postgres/pglite), vitest + @testing-library/react + jsdom, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-04-parte-wizard-redesign-design.md` (§4, §7.1–7.3).

## Global Constraints

- Comandos: `pnpm test` (vitest run), `pnpm exec vitest run <archivo>`, `pnpm lint`, `pnpm build`. Migraciones: `pnpm exec drizzle-kit generate --name <nombre>`.
- Todas las columnas nuevas son **nullable** (se agregan por `ALTER` sobre bases pobladas).
- Gravedades válidas: exactamente `Baja | Media | Alta | Crítica` (`SEVERIDADES` en `lib/infraestructura/validacion.ts`).
- Justificaciones de Crítica válidas: `mas_personas | riesgo_fisico | se_prolonga | combinado | otro`; detalle obligatorio solo con `otro`, máx. 300 caracteres.
- Ventana del vínculo causal: la causa está activa o fue cerrada hace **≤ 15 días** respecto del `rigeDesde` del envío; misma escuela (`cue_anexo`).
- Copy de UI en español neutro, sin voseo regional en strings nuevos salvo que el archivo ya lo use. Comentarios de código siguen el idioma del archivo (español).
- Commits: Conventional Commits, sin atribución de IA.
- No se recalculan gravedades de partes existentes.

## Review Focus

1. **Error 5xx persistente estando online** — el director debe ver "El servidor no respondió…", no "sin conexión", y el reintento no puede quedar en loop sin espera (backoff con techo de 30 s). Test en Task 1.
2. **Cola pendiente vieja al reabrir con conexión** — debe reenviarse sola usando los datos de la cola, sin depender de que el wizard esté en el paso final. Test en Task 2.
3. **Motivo sin sugerido o renombrado/borrado** — elegir Crítica exige justificación (se trata como "sin sugerido"), nunca un 500. Test en Task 6.
4. **Causa de otra escuela o cerrada hace más de 15 días** — 400 con mensaje entendible, nada persistido. Test en Task 7.
5. **Admin manda una gravedad sugerida inválida** — 400, no se guarda basura que después rompa el badge. Test en Task 4.

---

## File Structure

| Archivo | Responsabilidad | Tasks |
|---|---|---|
| `lib/infraestructura/parte/envio-offline.ts` | Motor de envío: estados, clasificación, reenvío, reintento | 1 |
| `components/infraestructura/reporte-inicial-form.tsx`, `actualizacion-form.tsx` | Cableado del reintento | 2 |
| `lib/db/schema.ts`, `drizzle/0008_*.sql` | Columnas nuevas + backfill | 3 |
| `lib/infraestructura/motivos.ts`, `app/api/infraestructura/motivos/route.ts`, `components/admin-page.tsx` | Gravedad sugerida | 4 |
| `lib/infraestructura/severidad.ts` | Criterios por categoría | 5 |
| `lib/infraestructura/justificacion-critica.ts` (nuevo) | Regla de justificación | 6 |
| `lib/infraestructura/causa-afectacion.ts` (nuevo) | Regla del vínculo causal | 7 |
| `lib/infraestructura/validacion-trayectoria.ts` | Zod de entrada (justificación, causa, solucionadas, Evacuado) | 6, 7, 8, 9 |
| `app/api/problematicas/parte/route.ts` | Enforcement servidor + persistencia | 6, 7, 8 |
| `lib/infraestructura/relevancia.ts` (nuevo) | `compararRelevancia` | 10 |

---

## FASE 0 — Estado de envío veraz

### Task 1: Motor de envío distingue red de servidor y reenvía desde la cola

**Files:**
- Modify: `lib/infraestructura/parte/envio-offline.ts` (tipos ~6–11, `MENSAJES_ESTADO` ~57–63, `completarEnvio` ~426–430, nuevas funciones al final)
- Test: `lib/infraestructura/parte/envio-offline.test.ts`

**Interfaces:**
- Produces:
  - `type EstadoEnvio = 'guardado-local' | 'pendiente-envio' | 'error-servidor' | 'enviando' | 'enviado' | 'error'`
  - `MENSAJES_ESTADO['pendiente-envio'] === 'Sin conexión: se enviará solo cuando vuelva la conexión'`
  - `MENSAJES_ESTADO['error-servidor'] === 'El servidor no respondió. Reintentamos en unos segundos.'`
  - `function esEstadoReintentable(estado: EstadoEnvio | null): boolean`
  - `async function reenviarCola<T>(opciones: EnviarOpciones<T>): Promise<ResultadoEnvio | null>` — `null` si no hay cola reintentable.
  - `function programarReintento(intentos: number, callback: () => void): () => void` — devuelve cancelador.

- [ ] **Step 1: Write the failing tests** (agregar al final de `envio-offline.test.ts`)

```ts
describe('estado veraz: red vs servidor', () => {
  it('un 5xx deja el borrador en error-servidor, no en pendiente-envio', async () => {
    const almacen = crearAlmacenMemoria()
    const fetchImpl = vi.fn(async () => respuesta(false, 503, { error: 'caído' }))
    const resultado = await intentarEnviar({ observacion: 'x' }, {
      almacen, tipo: 'nuevo', cue: 'cue-1', fetchImpl, url: '/api', construirCuerpo: (d, k) => ({ ...d, k }),
    })
    expect(resultado).toEqual({ ok: false, estado: 'error-servidor' })
    expect((await leerBorrador(almacen, 'nuevo', 'cue-1'))?.estado).toBe('error-servidor')
  })

  it('una falla de red deja el borrador en pendiente-envio', async () => {
    const almacen = crearAlmacenMemoria()
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    const resultado = await intentarEnviar({ observacion: 'x' }, {
      almacen, tipo: 'nuevo', cue: 'cue-1', fetchImpl, url: '/api', construirCuerpo: (d, k) => ({ ...d, k }),
    })
    expect(resultado).toEqual({ ok: false, estado: 'pendiente-envio' })
  })

  it('los mensajes no hablan de conexión para un error del servidor', () => {
    expect(MENSAJES_ESTADO['error-servidor']).not.toMatch(/conexi/i)
    expect(MENSAJES_ESTADO['pendiente-envio']).toMatch(/sin conexión/i)
  })

  it('esEstadoReintentable sólo acepta pendiente-envio y error-servidor', () => {
    expect(esEstadoReintentable('pendiente-envio')).toBe(true)
    expect(esEstadoReintentable('error-servidor')).toBe(true)
    expect(esEstadoReintentable('error')).toBe(false)
    expect(esEstadoReintentable('enviando')).toBe(false)
    expect(esEstadoReintentable(null)).toBe(false)
  })
})

describe('reenviarCola', () => {
  it('reenvía los datos guardados en la cola con la misma idempotencyKey', async () => {
    const almacen = crearAlmacenMemoria()
    await guardarBorrador(almacen, crearBorrador({ tipo: 'nuevo', estado: 'error-servidor', idempotencyKey: 'k-1', datos: { observacion: 'de la cola' } }))
    const fetchImpl = vi.fn(async () => respuesta(true, 201, { ok: true }))
    const resultado = await reenviarCola({
      almacen, tipo: 'nuevo', cue: 'cue-1', fetchImpl, url: '/api', construirCuerpo: (d, k) => ({ ...d, idempotencyKey: k }),
    })
    expect(resultado).toEqual({ ok: true, respuesta: { ok: true } })
    const cuerpo = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(cuerpo).toEqual({ observacion: 'de la cola', idempotencyKey: 'k-1' })
  })

  it('devuelve null si la cola está vacía o en un estado no reintentable', async () => {
    const almacen = crearAlmacenMemoria()
    const fetchImpl = vi.fn()
    const opciones = { almacen, tipo: 'nuevo', cue: 'cue-1', fetchImpl, url: '/api', construirCuerpo: (d: unknown) => d }
    expect(await reenviarCola(opciones)).toBeNull()
    await guardarBorrador(almacen, crearBorrador({ tipo: 'nuevo', estado: 'error' }))
    expect(await reenviarCola(opciones)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('programarReintento', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('dispara después de la espera con backoff y se puede cancelar', () => {
    const callback = vi.fn()
    programarReintento(1, callback)
    vi.advanceTimersByTime(1999)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)

    const otro = vi.fn()
    const cancelar = programarReintento(0, otro)
    cancelar()
    vi.advanceTimersByTime(60_000)
    expect(otro).not.toHaveBeenCalled()
  })

  it('nunca espera más de 30 segundos', () => {
    const callback = vi.fn()
    programarReintento(50, callback)
    vi.advanceTimersByTime(30_000)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
```

Agregar `esEstadoReintentable`, `MENSAJES_ESTADO`, `programarReintento`, `reenviarCola` al import del archivo de test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run lib/infraestructura/parte/envio-offline.test.ts`
Expected: FAIL — `esEstadoReintentable is not a function` / el 5xx devuelve `pendiente-envio`.

- [ ] **Step 3: Implement**

En `envio-offline.ts`:

```ts
export type EstadoEnvio =
  | 'guardado-local'
  | 'pendiente-envio'
  | 'error-servidor'
  | 'enviando'
  | 'enviado'
  | 'error'

export const MENSAJES_ESTADO: Record<EstadoEnvio, string> = {
  'guardado-local': 'Guardado en este dispositivo',
  'pendiente-envio': 'Sin conexión: se enviará solo cuando vuelva la conexión',
  'error-servidor': 'El servidor no respondió. Reintentamos en unos segundos.',
  enviando: 'Enviando…',
  enviado: 'Enviado',
  error: 'No se pudo enviar',
}
```

`registrarPendiente` recibe el estado destino:

```ts
async function registrarPendiente<T>(
  opciones: EnviarOpciones<T>,
  borrador: BorradorParte<T>,
  intentos: number,
  estado: 'pendiente-envio' | 'error-servidor',
): Promise<BorradorParte<T>> {
  const pendiente: BorradorParte<T> = {
    ...borrador,
    estado,
    intentos: intentos + 1,
    actualizadoEn: new Date().toISOString(),
  }
  await guardarBorrador(opciones.almacen, pendiente)
  opciones.onCambioEstado?.(pendiente)
  return pendiente
}
```

En `completarEnvio`: el `catch` del `fetch` llama `registrarPendiente(opciones, borradorEnviando, intentos, 'pendiente-envio')`; la rama `clasificacion === 'reintentable'` (sólo 5xx llega acá, la red ya salió por el `catch`) llama `registrarPendiente(..., 'error-servidor')`.

Al final del archivo:

```ts
// Un envío que quedó en cola por red o por un 5xx se puede reintentar sin
// intervención del director; 'error' (4xx) y 'sesion-vencida' no.
export function esEstadoReintentable(estado: EstadoEnvio | null): boolean {
  return estado === 'pendiente-envio' || estado === 'error-servidor'
}

// Reintenta con los datos GUARDADOS en la cola, no con el estado actual del
// formulario: tras recargar la página el asistente puede no estar en el paso
// final, pero la cola conserva exactamente lo que se intentó enviar.
export async function reenviarCola<T>(opciones: EnviarOpciones<T>): Promise<ResultadoEnvio | null> {
  const cola = await leerBorrador<T>(opciones.almacen, opciones.tipo, opciones.cue)
  if (!cola || !esEstadoReintentable(cola.estado)) return null
  return intentarEnviar(cola.datos, opciones)
}

export function programarReintento(intentos: number, callback: () => void): () => void {
  const temporizador = setTimeout(callback, calcularEsperaReintento(intentos))
  return () => clearTimeout(temporizador)
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run lib/infraestructura/parte/envio-offline.test.ts`
Expected: PASS. Si algún test previo afirmaba `pendiente-envio` para un 5xx, actualizarlo a `error-servidor` (ese test codificaba el bug).

- [ ] **Step 5: Commit**

```bash
git add lib/infraestructura/parte/envio-offline.ts lib/infraestructura/parte/envio-offline.test.ts
git commit -m "fix(parte): distinguir error del servidor de falta de conexión en el envío"
```

### Task 2: Los formularios reintentan solos al montar y tras un error del servidor

**Files:**
- Modify: `components/infraestructura/reporte-inicial-form.tsx` (restauración de cola ~240–252, `manejarEnvio` ~286–375, `reintentarRef` ~378–386)
- Modify: `components/infraestructura/actualizacion-form.tsx` (bloques equivalentes; ubicar con `rg -n "leerColaEnvio|reintentarRef|registrarAutoReintento|onCambioEstado" components/infraestructura/actualizacion-form.tsx`)
- Test: `components/infraestructura/reporte-inicial-form.test.tsx`, `components/infraestructura/actualizacion-form.test.tsx`

**Interfaces:**
- Consumes (Task 1): `esEstadoReintentable`, `reenviarCola`, `programarReintento`, `MENSAJES_ESTADO`.

- [ ] **Step 1: Write the failing tests** (`reporte-inicial-form.test.tsx`)

Reemplazar el test `'un 5xx queda pendiente de envío y se reintenta solo al volver la conexión, con un único parte'` por:

```tsx
it('un 5xx muestra error del servidor (no de conexión) y se reintenta solo, con un único parte', async () => {
  const fetchMock = vi.fn()
  fetchMock
    .mockImplementationOnce(async () => jsonResponse({ error: 'boom' }, 503))
    .mockImplementationOnce(async () => jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
  vi.stubGlobal('fetch', fetchMock)

  renderFormulario()
  guardarReporte()

  expect(await screen.findByText(MENSAJES_ESTADO['error-servidor'])).toBeInTheDocument()
  expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument()

  // Sin evento 'online': el reintento lo dispara el temporizador (backoff 2 s).
  await screen.findByText(MENSAJE_REPORTE_EXITOSO, undefined, { timeout: 5000 })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const [, initA] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  const [, initB] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
  expect(JSON.parse(initA.body as string).idempotencyKey).toBe(JSON.parse(initB.body as string).idempotencyKey)
})

it('al montar con una cola pendiente y conexión disponible, la reenvía sin intervención', async () => {
  const almacen = crearAlmacenNavegador()
  await guardarBorradorEnvio(almacen, {
    tipo: 'nuevo',
    cue: props.cue,
    idempotencyKey: 'k-vieja',
    datos: { cue: props.cue, rigeDesde: '2026-10-04T10:00:00.000Z', afectacionesNuevas: [] },
    estado: 'pendiente-envio',
    intentos: 1,
    actualizadoEn: '2026-10-04T10:00:00.000Z',
  })
  const fetchMock = vi.fn(async () => jsonResponse({ ok: true, movimientoId: 'm1' }, 201))
  vi.stubGlobal('fetch', fetchMock)

  renderFormulario()

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 5000 })
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(JSON.parse(init.body as string).idempotencyKey).toBe('k-vieja')
  await waitFor(() => expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument())
})
```

Imports: `import { MENSAJES_ESTADO, crearAlmacenNavegador, guardarBorrador as guardarBorradorEnvio } from '@/lib/infraestructura/parte/envio-offline'` y `waitFor` de `@testing-library/react`. Verificar con `rg -n "crearAlmacenNavegador|almacenParte" components/infraestructura/reporte-inicial-form.tsx` que el formulario usa ese almacén (localStorage de jsdom); si usa otro, sembrar la cola con el mismo.

En el test `'un error de red deja el envío pendiente y conserva lo ingresado'` cambiar el texto esperado por `MENSAJES_ESTADO['pendiente-envio']`. Aplicar el mismo reemplazo de literales en `reporte-inicial-form.test.tsx:673` y `actualizacion-form.test.tsx:291,397,694`; en los casos que simulan 5xx, esperar `MENSAJES_ESTADO['error-servidor']`.

Agregar en `actualizacion-form.test.tsx` el equivalente del primer test nuevo (5xx → mensaje de servidor → reintento por temporizador → éxito con la misma idempotencyKey), usando los helpers existentes de ese archivo.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run components/infraestructura/reporte-inicial-form.test.tsx components/infraestructura/actualizacion-form.test.tsx`
Expected: FAIL — el reintento no ocurre sin evento `online`; la cola vieja no se reenvía.

- [ ] **Step 3: Implement** (mismo cambio en ambos formularios)

1. Estado nuevo junto a `estadoEnvio`: `const [intentosEnvio, setIntentosEnvio] = useState(0)`. En `onCambioEstado` y en la restauración de la cola al montar, `setIntentosEnvio(borrador.intentos)` / `setIntentosEnvio(colaPendiente.intentos)`.
2. Extraer las opciones de `intentarEnviar` a una función del componente para reutilizarlas:

```tsx
function opcionesEnvio(): EnviarOpciones<DatosEnvio> {
  return {
    almacen: almacenParte,
    tipo: 'nuevo',
    cue,
    fetchImpl: fetch,
    url: '/api/problematicas/parte',
    construirCuerpo: (datos, idempotencyKey) => {
      const vinculo = leerVinculoVerificacion()
      return { ...datos, idempotencyKey, ...(vinculo ? { verificacion: vinculo } : {}) }
    },
    validarExito: (respuesta) => {
      const cuerpo = respuesta as { ok?: boolean; movimientoId?: string } | null
      return !!cuerpo && cuerpo.ok === true && typeof cuerpo.movimientoId === 'string'
    },
    onCambioEstado: (borrador) => {
      setEstadoEnvio(borrador.estado)
      setMotivoEnvio(borrador.motivoError ?? null)
      setIntentosEnvio(borrador.intentos)
    },
  }
}
```

`DatosEnvio` es `typeof datosEnvio` hoy; declararlo como `type DatosEnvio = Parameters<typeof construirDatosEnvio>...` no hace falta: definir `type DatosEnvio = Record<string, unknown>` alcanza porque `construirCuerpo` sólo lo esparce. `manejarEnvio` pasa a `intentarEnviar(datosEnvio, opcionesEnvio())`. La rama de éxito (limpiar borrador, `colapsarHistorial`, `setGuardado`) se extrae a `function alEnviarConExito(movimientoId: string)` para reutilizarla.

3. Reemplazar el cuerpo de `reintentarRef.current`:

```tsx
reintentarRef.current = () => {
  if (guardado) return
  if (!esEstadoReintentable(estadoEnvio)) return
  void (async () => {
    const resultado = await reenviarCola(opcionesEnvio())
    if (resultado?.ok) {
      const datos = resultado.respuesta as { movimientoId: string }
      alEnviarConExito(datos.movimientoId)
    }
  })()
}
```

4. Reintento programado (nuevo efecto):

```tsx
// 'error-servidor' se reintenta con backoff aunque haya conexión (el
// evento 'online' nunca llega si nunca se perdió). 'pendiente-envio' se
// reintenta también al montar si el navegador dice que hay red: una cola
// vieja no puede quedar trabada esperando un evento que no va a ocurrir.
useEffect(() => {
  if (guardado || enviando) return
  if (!esEstadoReintentable(estadoEnvio)) return
  if (estadoEnvio === 'pendiente-envio' && typeof navigator !== 'undefined' && navigator.onLine === false) return
  return programarReintento(intentosEnvio, () => reintentarRef.current())
}, [estadoEnvio, intentosEnvio, guardado, enviando])
```

`registrarAutoReintento` (eventos `online`/`visibilitychange`) se mantiene.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run components/infraestructura/reporte-inicial-form.test.tsx components/infraestructura/actualizacion-form.test.tsx lib/infraestructura/parte/envio-offline.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check + commit**

Run: `pnpm test && pnpm lint`
Expected: PASS (si un test ajeno falla también en `main`, anotarlo con su nombre exacto y no tocarlo).

```bash
git add components/infraestructura/reporte-inicial-form.tsx components/infraestructura/actualizacion-form.tsx components/infraestructura/reporte-inicial-form.test.tsx components/infraestructura/actualizacion-form.test.tsx
git commit -m "fix(parte): reintentar envíos pendientes sin esperar un evento de conexión"
```

---

## FASE 1 — Modelo de datos

### Task 3: Columnas nuevas y migración 0008

**Files:**
- Modify: `lib/db/schema.ts` (`infraMotivo` ~214–219, `infraAfectacion` ~321–345)
- Create: `drizzle/0008_parte-rediseno-modelo.sql` (generado + backfill a mano), `drizzle/meta/0008_snapshot.json`, `drizzle/meta/_journal.json` (generados)
- Test: `lib/db/seed.test.ts`

**Interfaces:**
- Produces (columnas drizzle):
  - `infraMotivo.severidadSugerida: text('severidad_sugerida')` (nullable)
  - `infraAfectacion.justificacionCritica: text('justificacion_critica')`
  - `infraAfectacion.justificacionCriticaDetalle: text('justificacion_critica_detalle')`
  - `infraAfectacion.causadaPorId: text('causada_por_id')`
  - `infraAfectacion.cierre: text('cierre')` — `'solucionada' | 'retirada' | null`
  - índice `infra_afectacion_causada_por_id_idx`

- [ ] **Step 1: Write the failing test** (en `lib/db/seed.test.ts`, siguiendo el setup de DB temporal que ya usa el archivo)

```ts
it('la migración 0008 agrega las columnas del rediseño y siembra la gravedad sugerida', async () => {
  await ensureSeeded()
  const db = getDb()
  const motivos = await db.select().from(infraMotivo)
  const porId = new Map(motivos.map((m) => [m.id, m.severidadSugerida]))
  expect(porId.get('inundacion')).toBe('Crítica')
  expect(porId.get('sin-energia-o-agua')).toBe('Media')
  expect(porId.get('otro-establecimiento')).toBeNull()

  const columnas = await crearEjecutorSql(getRawClient()).execute(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'infra_afectacion'",
  )
  const nombres = (columnas.rows as Array<{ column_name: string }>).map((c) => c.column_name)
  expect(nombres).toEqual(expect.arrayContaining(['justificacion_critica', 'justificacion_critica_detalle', 'causada_por_id', 'cierre']))
})
```

Verificar la forma de retorno de `crearEjecutorSql(...).execute` en `lib/infraestructura/ge-db.ts` y ajustar `.rows` si el ejecutor devuelve otra propiedad.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run lib/db/seed.test.ts`
Expected: FAIL — `severidadSugerida` undefined / columnas ausentes.

- [ ] **Step 3: Implement**

`lib/db/schema.ts`:

```ts
export const infraMotivo = pgTable('infra_motivo', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  categoria: text('categoria').notNull(),
  orden: integer('orden').notNull().default(0),
  // Gravedad que el wizard marca como "Sugerido" (spec rediseño §4.1).
  // Null = sin sugerido. Nunca restringe: el director elige libremente.
  severidadSugerida: text('severidad_sugerida'),
})
```

En `infraAfectacion`, después de `retiradaEn`:

```ts
    // Justificación obligatoria al elegir Crítica cuando el motivo no la
    // sugería (spec rediseño §4.3). `detalle` sólo con justificación 'otro'.
    justificacionCritica: text('justificacion_critica'),
    justificacionCriticaDetalle: text('justificacion_critica_detalle'),
    // Situación que provocó ésta (spec rediseño §4.4). Sin FK declarada: las
    // afectaciones nunca se borran y la causa puede vivir en otro parte
    // (otro período) de la misma escuela.
    causadaPorId: text('causada_por_id'),
    // Por qué dejó de regir: 'solucionada' | 'retirada'. Null mientras rige.
    cierre: text('cierre'),
```

y en el array de índices: `index('infra_afectacion_causada_por_id_idx').on(t.causadaPorId),`.

Generar: `pnpm exec drizzle-kit generate --name parte-rediseno-modelo`. Renombrar si drizzle-kit no respeta el nombre exacto, manteniendo el `tag` del journal coherente. Agregar al final del SQL generado (mismo estilo que `0006`):

```sql
--> statement-breakpoint
UPDATE "infra_motivo" SET "severidad_sugerida" = 'Crítica' WHERE "id" IN ('inundacion', 'evacuacion-preventiva') AND "severidad_sugerida" IS NULL;
--> statement-breakpoint
UPDATE "infra_motivo" SET "severidad_sugerida" = 'Alta' WHERE "id" IN ('tormenta-severa', 'inaccesibilidad-docentes', 'anegamiento', 'acceso-interrumpido') AND "severidad_sugerida" IS NULL;
--> statement-breakpoint
UPDATE "infra_motivo" SET "severidad_sugerida" = 'Media' WHERE "id" = 'sin-energia-o-agua' AND "severidad_sugerida" IS NULL;
--> statement-breakpoint
UPDATE "infra_afectacion" SET "cierre" = 'retirada' WHERE "retirada_en" IS NOT NULL AND "cierre" IS NULL;
```

En `MOTIVOS_SEED` (`lib/infraestructura/motivos.ts`) agregar `severidadSugerida` a cada entrada con los mismos valores (`null` para los dos comodines), para que una base nueva sembrada después de la migración también los tenga (ver Task 4 para el tipo).

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run lib/db/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/ lib/infraestructura/motivos.ts lib/db/seed.test.ts
git commit -m "feat(parte): columnas de gravedad sugerida, justificación, causa y cierre"
```

### Task 4: Gravedad sugerida en el catálogo y el ABM

**Files:**
- Modify: `lib/infraestructura/motivos.ts` (`MotivoRow` ~7–12, `MOTIVOS_SEED`)
- Modify: `app/api/infraestructura/motivos/route.ts` (POST ~51–108)
- Modify: `components/admin-page.tsx` (`MotivoForm` ~1225–1300, tabla ~1345–1375)
- Test: `app/api/infraestructura/motivos/route.test.ts`

**Interfaces:**
- Consumes (Task 3): columna `severidadSugerida`.
- Produces: `interface MotivoRow { id: string; nombre: string; categoria: CategoriaAfectacion; orden: number; severidadSugerida?: Severidad | null }` y `function esSeveridad(valor: unknown): valor is Severidad` exportada desde `lib/infraestructura/validacion.ts`.

- [ ] **Step 1: Write the failing tests** (`route.test.ts`, dentro del describe de POST)

```ts
it('guarda la gravedad sugerida y la devuelve en GET', async () => {
  vi.mocked(getSessionUser).mockResolvedValue(admin())
  const { POST, GET } = await import('./route')
  const res = await POST(postReq({ id: 'granizo', nombre: 'Granizo', categoria: 'establecimiento', orden: 60, severidadSugerida: 'Alta' }))
  expect(res.status).toBe(200)
  const body = await (await GET()).json()
  expect(body.motivos.find((m: { id: string }) => m.id === 'granizo').severidadSugerida).toBe('Alta')
})

it('acepta sin sugerido (null) y lo persiste como null', async () => {
  vi.mocked(getSessionUser).mockResolvedValue(admin())
  const { POST, GET } = await import('./route')
  await POST(postReq({ id: 'granizo-2', nombre: 'Granizo fuerte', categoria: 'establecimiento', orden: 61, severidadSugerida: null }))
  const body = await (await GET()).json()
  expect(body.motivos.find((m: { id: string }) => m.id === 'granizo-2').severidadSugerida).toBeNull()
})

it('rechaza una gravedad sugerida inválida con 400', async () => {
  vi.mocked(getSessionUser).mockResolvedValue(admin())
  const { POST } = await import('./route')
  const res = await POST(postReq({ id: 'x', nombre: 'X', categoria: 'establecimiento', orden: 1, severidadSugerida: 'Gravísima' }))
  expect(res.status).toBe(400)
  expect((await res.json()).error).toBe('Gravedad sugerida inválida')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run app/api/infraestructura/motivos/route.test.ts`
Expected: FAIL — la inválida devuelve 200 / el campo no se persiste.

- [ ] **Step 3: Implement**

`lib/infraestructura/validacion.ts`:

```ts
export function esSeveridad(valor: unknown): valor is Severidad {
  return typeof valor === 'string' && (SEVERIDADES as readonly string[]).includes(valor)
}
```

`motivos.ts`: `MotivoRow` gana `severidadSugerida?: Severidad | null` (opcional para no romper fixtures de `components/test-utils/parte-formulario.ts`). `listarMotivos` normaliza: `severidadSugerida: esSeveridad(r.severidadSugerida) ? r.severidadSugerida : null`.

POST del route, tras validar categoría:

```ts
  const sugeridaCruda = b.severidadSugerida ?? null
  if (sugeridaCruda !== null && !esSeveridad(sugeridaCruda)) {
    return Response.json({ error: 'Gravedad sugerida inválida' }, { status: 400 })
  }
```

y `row` incluye `severidadSugerida: sugeridaCruda`; el `onConflictDoUpdate.set` también.

`admin-page.tsx` `MotivoForm`: estado `const [severidadSugerida, setSeveridadSugerida] = React.useState<string>(editing?.severidadSugerida ?? '')`, un `SelectField` "Gravedad sugerida" con opciones `[{ value: '', label: 'Sin sugerido' }, ...SEVERIDADES.map((s) => ({ value: s, label: s }))]`, y en el body `severidadSugerida: severidadSugerida === '' ? null : severidadSugerida`. Tabla: columna "Sugerido" que muestra el valor o "—". Si `SelectField` no admite value vacío, usar el sentinel `'ninguna'` y mapearlo a `null`.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run app/api/infraestructura/motivos/route.test.ts && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/infraestructura/validacion.ts lib/infraestructura/motivos.ts app/api/infraestructura/motivos/route.ts app/api/infraestructura/motivos/route.test.ts components/admin-page.tsx
git commit -m "feat(motivos): gravedad sugerida editable desde el ABM"
```

### Task 5: Criterios de gravedad por categoría

**Files:**
- Modify: `lib/infraestructura/severidad.ts`
- Test: `lib/infraestructura/severidad.test.ts` (crear si no existe)

**Interfaces:**
- Produces:
  - `SEVERIDAD_CRITERIOS_POR_CATEGORIA: Record<CategoriaAfectacion, Record<Severidad, string>>`
  - `criterioSeveridad(severidad: string, categoria?: CategoriaAfectacion): string | null` (default `'establecimiento'`)
  - `SEVERIDAD_CRITERIOS` se mantiene como alias de `['establecimiento']` (consumidores actuales intactos hasta la Fase 2).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { SEVERIDAD_CRITERIOS, SEVERIDAD_CRITERIOS_POR_CATEGORIA, criterioSeveridad } from './severidad'

describe('criterios por categoría', () => {
  it('alumnos tiene criterios propios centrados en poder llegar', () => {
    expect(SEVERIDAD_CRITERIOS_POR_CATEGORIA.alumnos.Crítica).toBe(
      'Llegar implica riesgo para los alumnos (cruzar un arroyo crecido, un camino anegado).',
    )
    expect(criterioSeveridad('Baja', 'alumnos')).toBe('Llegan con demora o dificultad, pero asisten.')
  })

  it('establecimiento conserva los criterios acordados y es el default', () => {
    expect(SEVERIDAD_CRITERIOS).toBe(SEVERIDAD_CRITERIOS_POR_CATEGORIA.establecimiento)
    expect(criterioSeveridad('Crítica')).toBe('Impide el funcionamiento o hay riesgo para las personas.')
  })

  it('devuelve null para una gravedad desconocida', () => {
    expect(criterioSeveridad('Gravísima', 'alumnos')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run lib/infraestructura/severidad.test.ts`
Expected: FAIL — export inexistente.

- [ ] **Step 3: Implement** (`severidad.ts`, reemplazando el bloque de criterios; conservar el comentario de contexto y agregarle que los de alumnos se acordaron el 2026-10-04)

```ts
import type { CategoriaAfectacion } from './categorias'

export const SEVERIDAD_CRITERIOS_POR_CATEGORIA: Record<CategoriaAfectacion, Record<Severidad, string>> = {
  establecimiento: {
    Baja: 'Molesta, pero se dicta clase normalmente.',
    Media: 'Condiciona el dictado: algunas secciones o turnos funcionan a medias.',
    Alta: 'Impide dictar clase en parte del establecimiento.',
    Crítica: 'Impide el funcionamiento o hay riesgo para las personas.',
  },
  alumnos: {
    Baja: 'Llegan con demora o dificultad, pero asisten.',
    Media: 'Algunos alumnos faltan algunos días por el acceso.',
    Alta: 'Los alumnos afectados no pueden llegar de forma sostenida.',
    Crítica: 'Llegar implica riesgo para los alumnos (cruzar un arroyo crecido, un camino anegado).',
  },
}

export const SEVERIDAD_CRITERIOS = SEVERIDAD_CRITERIOS_POR_CATEGORIA.establecimiento

export function criterioSeveridad(
  severidad: string,
  categoria: CategoriaAfectacion = 'establecimiento',
): string | null {
  return SEVERIDAD_CRITERIOS_POR_CATEGORIA[categoria][severidad as Severidad] ?? null
}
```

Verificar con `rg -n "export type CategoriaAfectacion" lib/infraestructura/categorias.ts` que las claves son exactamente `establecimiento` y `alumnos`.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run lib/infraestructura/severidad.test.ts components/infraestructura/afectacion-campos.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/infraestructura/severidad.ts lib/infraestructura/severidad.test.ts
git commit -m "feat(parte): criterios de gravedad propios para la categoría alumnos"
```

### Task 6: Justificación obligatoria de Crítica

**Files:**
- Create: `lib/infraestructura/justificacion-critica.ts`, `lib/infraestructura/justificacion-critica.test.ts`
- Modify: `lib/infraestructura/validacion-trayectoria.ts` (`afectacionNuevaInputSchema` ~55–63, `afectacionModificacionInputSchema` ~71–77)
- Modify: `app/api/problematicas/parte/route.ts` (validación ~421–436 y ~498–533; insert ~642–652; update ~656–661)
- Test: `app/api/problematicas/parte/route.test.ts`

**Interfaces:**
- Produces:
  - `JUSTIFICACIONES_CRITICA = ['mas_personas', 'riesgo_fisico', 'se_prolonga', 'combinado', 'otro'] as const`; `type JustificacionCritica`
  - `ETIQUETA_JUSTIFICACION_CRITICA: Record<JustificacionCritica, string>`
  - `requiereJustificacionCritica(severidad: Severidad, sugerida: Severidad | null | undefined): boolean`
  - `validarJustificacionCritica(input: { severidad: Severidad; sugerida: Severidad | null | undefined; justificacion?: JustificacionCritica; detalle?: string }): { ok: true } | { ok: false; error: string }`
  - Zod: `justificacionCritica?: JustificacionCritica`, `justificacionCriticaDetalle?: string` (trim, 1–300) en alta y modificación.

- [ ] **Step 1: Write the failing unit tests** (`justificacion-critica.test.ts`)

```ts
import { describe, expect, it } from 'vitest'
import { requiereJustificacionCritica, validarJustificacionCritica } from './justificacion-critica'

describe('requiereJustificacionCritica', () => {
  it('sólo con Crítica y un sugerido distinto de Crítica o ausente', () => {
    expect(requiereJustificacionCritica('Crítica', 'Media')).toBe(true)
    expect(requiereJustificacionCritica('Crítica', null)).toBe(true)
    expect(requiereJustificacionCritica('Crítica', undefined)).toBe(true)
    expect(requiereJustificacionCritica('Crítica', 'Crítica')).toBe(false)
    expect(requiereJustificacionCritica('Alta', 'Baja')).toBe(false)
  })
})

describe('validarJustificacionCritica', () => {
  it('rechaza Crítica no sugerida sin justificación', () => {
    expect(validarJustificacionCritica({ severidad: 'Crítica', sugerida: 'Media' })).toEqual({
      ok: false,
      error: 'Indique por qué la situación es crítica',
    })
  })
  it('exige detalle con "otro" y lo prohíbe en las demás', () => {
    expect(validarJustificacionCritica({ severidad: 'Crítica', sugerida: 'Media', justificacion: 'otro' }).ok).toBe(false)
    expect(validarJustificacionCritica({ severidad: 'Crítica', sugerida: 'Media', justificacion: 'otro', detalle: 'Cayó un árbol sobre el aula' }).ok).toBe(true)
    expect(validarJustificacionCritica({ severidad: 'Crítica', sugerida: 'Media', justificacion: 'riesgo_fisico', detalle: 'x' }).ok).toBe(false)
  })
  it('rechaza una justificación enviada cuando no corresponde', () => {
    expect(validarJustificacionCritica({ severidad: 'Alta', sugerida: 'Media', justificacion: 'se_prolonga' })).toEqual({
      ok: false,
      error: 'La justificación sólo corresponde a una situación crítica no sugerida',
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run lib/infraestructura/justificacion-critica.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implement `justificacion-critica.ts`**

```ts
import type { Severidad } from './validacion'

// Spec rediseño §4.3: Crítica es la excepción y se justifica cuando el motivo
// no la sugería. Lista cerrada para poder clasificar; 'otro' admite detalle
// libre porque los casos críticos son pocos y conviene que vengan detallados.
export const JUSTIFICACIONES_CRITICA = ['mas_personas', 'riesgo_fisico', 'se_prolonga', 'combinado', 'otro'] as const
export type JustificacionCritica = (typeof JUSTIFICACIONES_CRITICA)[number]

export const ETIQUETA_JUSTIFICACION_CRITICA: Record<JustificacionCritica, string> = {
  mas_personas: 'Afecta a más personas o secciones de lo habitual',
  riesgo_fisico: 'Hay riesgo eléctrico, estructural o sanitario',
  se_prolonga: 'Se prolonga en el tiempo o no tiene fecha de solución',
  combinado: 'Se combina con otro problema activo',
  otro: 'Otro',
}

export function requiereJustificacionCritica(severidad: Severidad, sugerida: Severidad | null | undefined): boolean {
  return severidad === 'Crítica' && sugerida !== 'Crítica'
}

export function validarJustificacionCritica(input: {
  severidad: Severidad
  sugerida: Severidad | null | undefined
  justificacion?: JustificacionCritica
  detalle?: string
}): { ok: true } | { ok: false; error: string } {
  const requiere = requiereJustificacionCritica(input.severidad, input.sugerida)
  if (!requiere) {
    if (input.justificacion !== undefined || input.detalle !== undefined) {
      return { ok: false, error: 'La justificación sólo corresponde a una situación crítica no sugerida' }
    }
    return { ok: true }
  }
  if (input.justificacion === undefined) return { ok: false, error: 'Indique por qué la situación es crítica' }
  if (input.justificacion === 'otro' && !input.detalle) return { ok: false, error: 'Describa por qué la situación es crítica' }
  if (input.justificacion !== 'otro' && input.detalle !== undefined) {
    return { ok: false, error: 'El detalle sólo corresponde a la opción "Otro"' }
  }
  return { ok: true }
}
```

Run: `pnpm exec vitest run lib/infraestructura/justificacion-critica.test.ts` → PASS.

- [ ] **Step 4: Write the failing route tests** (`route.test.ts`)

Agregar `const CUE_O = '1801605-59'` y `const CUE_P = '1801605-60'` a las constantes y al loop de siembra del `beforeAll`. Nuevo describe:

```ts
describe('POST /api/problematicas/parte — justificación de Crítica', () => {
  const base = (cue: string, extra: Record<string, unknown>) => ({
    cue,
    idempotencyKey: crypto.randomUUID(),
    rigeDesde: new Date().toISOString(),
    afectacionesNuevas: [{ motivo: 'Sin energía o agua', secciones: [seccionId(cue, '10')], ...extra }],
  })

  it('rechaza Crítica sobre un motivo que sugiere Media sin justificación', async () => {
    const res = await POST(postReq(base(CUE_O, { severidad: 'Crítica' })))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Indique por qué la situación es crítica')
  })

  it('acepta Crítica justificada y persiste la justificación', async () => {
    const res = await POST(postReq(base(CUE_O, { severidad: 'Crítica', justificacionCritica: 'riesgo_fisico' })))
    expect(res.status).toBe(201)
    const filas = await getDb().select().from(infraAfectacion).where(eq(infraAfectacion.justificacionCritica, 'riesgo_fisico'))
    expect(filas.length).toBe(1)
  })

  it('no pide justificación cuando el motivo ya sugiere Crítica', async () => {
    const res = await POST(postReq({
      cue: CUE_P, idempotencyKey: crypto.randomUUID(), rigeDesde: new Date().toISOString(),
      afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Crítica', secciones: [seccionId(CUE_P, '10')] }],
    }))
    expect(res.status).toBe(201)
  })
})
```

Confirmar el status de éxito real del POST (`rg -n "status: 201|status: 200" app/api/problematicas/parte/route.ts`) y ajustar.

- [ ] **Step 5: Implement schema + route**

`validacion-trayectoria.ts`, en ambos schemas de afectación:

```ts
  justificacionCritica: z.enum(JUSTIFICACIONES_CRITICA).optional(),
  justificacionCriticaDetalle: z.string().trim().min(1).max(300).optional(),
```

`route.ts`, dentro del loop de `afectacionesNuevas` (tras `resolverCategoria`):

```ts
    const sugerida = motivos.find((m) => m.nombre === entrada.motivo)?.severidadSugerida ?? null
    const justificada = validarJustificacionCritica({
      severidad: entrada.severidad,
      sugerida,
      justificacion: entrada.justificacionCritica,
      detalle: entrada.justificacionCriticaDetalle,
    })
    if (!justificada.ok) return jsonError(justificada.error, 400)
```

Para modificaciones con `severidad` definida, después de cargar `existentesPorId` (~509): la sugerida sale de `motivos.find((m) => m.nombre === fila.motivo)?.severidadSugerida ?? null` y se valida igual. Si el motivo fue borrado del catálogo, `sugerida` queda `null` ⇒ se exige justificación (Review Focus #3).

Insert (~642): agregar `justificacionCritica: entrada.justificacionCritica ?? null, justificacionCriticaDetalle: entrada.justificacionCriticaDetalle ?? null`. Update de modificación (~656): si `modificacion.severidad !== undefined`, setear ambos campos (a `null` cuando no corresponde, para no dejar una justificación vieja colgando de una gravedad que ya no es Crítica).

- [ ] **Step 6: Run tests**

Run: `pnpm exec vitest run app/api/problematicas/parte/ lib/infraestructura/`
Expected: PASS. Los tests existentes que mandan `severidad: 'Crítica'` sobre motivos no críticos ahora fallan: agregarles `justificacionCritica: 'riesgo_fisico'` (no cambiar la regla).

- [ ] **Step 7: Commit**

```bash
git add lib/infraestructura/justificacion-critica.ts lib/infraestructura/justificacion-critica.test.ts lib/infraestructura/validacion-trayectoria.ts app/api/problematicas/parte/route.ts app/api/problematicas/parte/route.test.ts
git commit -m "feat(parte): exigir justificación al marcar Crítica una situación no sugerida"
```

### Task 7: Vínculo causal entre situaciones

**Files:**
- Create: `lib/infraestructura/causa-afectacion.ts`, `lib/infraestructura/causa-afectacion.test.ts`
- Modify: `lib/infraestructura/validacion-trayectoria.ts` (`afectacionNuevaInputSchema`)
- Modify: `app/api/problematicas/parte/route.ts` (validación previa a la transacción; insert ~642)
- Test: `app/api/problematicas/parte/route.test.ts`

**Interfaces:**
- Produces:
  - `VENTANA_CAUSA_DIAS = 15`
  - `causaElegible(causa: { cueAnexo: string; retiradaEn: string | null }, cue: string, rigeDesde: string): boolean`
  - Zod: `causadaPorId?: string` en alta.

No hay chequeo de ciclos: `causadaPorId` sólo se fija al **crear** una situación y la causa ya existe, así que una situación nueva nunca puede ser ancestro de sí misma. Si en el futuro se permite editar la causa, agregar el chequeo en ese momento.

- [ ] **Step 1: Write the failing unit test**

```ts
import { describe, expect, it } from 'vitest'
import { causaElegible } from './causa-afectacion'

const RIGE = '2026-10-20T12:00:00.000Z'

describe('causaElegible', () => {
  it('acepta una causa activa de la misma escuela', () => {
    expect(causaElegible({ cueAnexo: 'A', retiradaEn: null }, 'A', RIGE)).toBe(true)
  })
  it('acepta una causa cerrada hace 15 días exactos y rechaza 15 días y un minuto', () => {
    expect(causaElegible({ cueAnexo: 'A', retiradaEn: '2026-10-05T12:00:00.000Z' }, 'A', RIGE)).toBe(true)
    expect(causaElegible({ cueAnexo: 'A', retiradaEn: '2026-10-05T11:59:00.000Z' }, 'A', RIGE)).toBe(false)
  })
  it('rechaza una causa de otra escuela', () => {
    expect(causaElegible({ cueAnexo: 'B', retiradaEn: null }, 'A', RIGE)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm exec vitest run lib/infraestructura/causa-afectacion.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// Spec rediseño §4.4: una situación nueva puede declararse consecuencia de
// otra de la misma escuela que siga activa o que se haya cerrado hace poco
// (la luz puede cortarse justo después de que bajó el agua).
export const VENTANA_CAUSA_DIAS = 15

const MS_POR_DIA = 24 * 60 * 60 * 1000

export function causaElegible(
  causa: { cueAnexo: string; retiradaEn: string | null },
  cue: string,
  rigeDesde: string,
): boolean {
  if (causa.cueAnexo !== cue) return false
  if (causa.retiradaEn === null) return true
  const transcurrido = Date.parse(rigeDesde) - Date.parse(causa.retiradaEn)
  return transcurrido <= VENTANA_CAUSA_DIAS * MS_POR_DIA
}
```

PASS.

- [ ] **Step 4: Write the failing route tests** (agregar `CUE_Q = '1801605-61'` al setup)

```ts
describe('POST /api/problematicas/parte — causa', () => {
  async function crearInundacion(cue: string): Promise<string> {
    await POST(postReq({
      cue, idempotencyKey: crypto.randomUUID(), rigeDesde: new Date().toISOString(),
      afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Crítica', secciones: [seccionId(cue, '10')] }],
    }))
    const [fila] = await getDb().select().from(infraAfectacion).where(eq(infraAfectacion.motivo, 'Inundación'))
    return fila.id
  }

  it('persiste causadaPorId cuando la causa es de la misma escuela y está activa', async () => {
    const causa = await crearInundacion(CUE_Q)
    const res = await POST(postReq({
      cue: CUE_Q, idempotencyKey: crypto.randomUUID(), rigeDesde: new Date().toISOString(),
      afectacionesNuevas: [{ motivo: 'Sin energía o agua', severidad: 'Media', secciones: [seccionId(CUE_Q, '20')], causadaPorId: causa }],
    }))
    expect(res.status).toBe(201)
    const [hija] = await getDb().select().from(infraAfectacion).where(eq(infraAfectacion.causadaPorId, causa))
    expect(hija.motivo).toBe('Sin energía o agua')
  })

  it('rechaza una causa de otra escuela', async () => {
    const ajena = await crearInundacion(CUE_O)
    const res = await POST(postReq({
      cue: CUE_P, idempotencyKey: crypto.randomUUID(), rigeDesde: new Date().toISOString(),
      afectacionesNuevas: [{ motivo: 'Sin energía o agua', severidad: 'Media', secciones: [seccionId(CUE_P, '20')], causadaPorId: ajena }],
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('La situación indicada como causa no es válida')
  })
})
```

Ajustar `crearInundacion` para filtrar también por parte/CUE si el archivo ya tiene otras inundaciones (join con `infraParte.cueAnexo`).

- [ ] **Step 5: Implement**

Zod alta: `causadaPorId: z.string().trim().min(1).optional(),`.

Route, antes de `const ahora = ...` (~536):

```ts
  const idsCausa = [...new Set(input.afectacionesNuevas.flatMap((a) => (a.causadaPorId ? [a.causadaPorId] : [])))]
  if (idsCausa.length > 0) {
    const causas = await db
      .select({ id: infraAfectacion.id, retiradaEn: infraAfectacion.retiradaEn, cueAnexo: infraParte.cueAnexo })
      .from(infraAfectacion)
      .innerJoin(infraParte, eq(infraParte.id, infraAfectacion.parteId))
      .where(inArray(infraAfectacion.id, idsCausa))
    const porId = new Map(causas.map((c) => [c.id, c]))
    for (const id of idsCausa) {
      const causa = porId.get(id)
      if (!causa || !causaElegible(causa, cue.value, input.rigeDesde)) {
        return jsonError('La situación indicada como causa no es válida', 400)
      }
    }
  }
```

Insert: `causadaPorId: entrada.causadaPorId ?? null`.

Revisar `buscarAfectacionEquivalente` (~135): si deduplica altas idénticas, incluir `causadaPorId` en la comparación sólo si su ausencia haría que un replay idempotente pierda el vínculo; si dedupe es por `idempotencyKey`, no tocarla.

- [ ] **Step 6: Run tests** — `pnpm exec vitest run app/api/problematicas/parte/ lib/infraestructura/causa-afectacion.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/infraestructura/causa-afectacion.ts lib/infraestructura/causa-afectacion.test.ts lib/infraestructura/validacion-trayectoria.ts app/api/problematicas/parte/route.ts app/api/problematicas/parte/route.test.ts
git commit -m "feat(parte): vincular una situación nueva con la que la provocó"
```

### Task 8: Cerrar situaciones como "solucionada"

**Files:**
- Modify: `lib/infraestructura/validacion-trayectoria.ts` (`parteActualizacionInputSchema` ~123–158)
- Modify: `app/api/problematicas/parte/route.ts` (`idsReferenciados` ~498; bloque de retiro ~687–692)
- Test: `app/api/problematicas/parte/route.test.ts`, `lib/infraestructura/validacion-trayectoria.test.ts`

**Interfaces:**
- Produces: input `afectacionesSolucionadas: Array<{ id: string; solucionadaEn?: string }>` (default `[]`; `solucionadaEn` con `rigeDesdeSchema`, default `rigeDesde` del envío). Persistencia: `retiradaEn = solucionadaEn`, `cierre = 'solucionada'`. `afectacionesRetiradas` existente pasa a escribir `cierre = 'retirada'`.

- [ ] **Step 1: Write the failing tests**

`validacion-trayectoria.test.ts`:

```ts
it('un envío que sólo soluciona una situación es un cambio válido', () => {
  const r = parseParteActualizacionInput({
    cue: '1801605-41', idempotencyKey: 'k', rigeDesde: new Date().toISOString(),
    afectacionesSolucionadas: [{ id: 'a-1' }],
  })
  expect(r.ok).toBe(true)
})
```

`route.test.ts` (nuevo `CUE_R = '1801605-62'` en el setup):

```ts
it('solucionar una situación la cierra con cierre=solucionada y la fecha indicada', async () => {
  const rige = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  await POST(postReq({
    cue: CUE_R, idempotencyKey: crypto.randomUUID(), rigeDesde: rige,
    afectacionesNuevas: [{ motivo: 'Tormenta severa', severidad: 'Alta', secciones: [seccionId(CUE_R, '10')] }],
  }))
  const [fila] = await getDb().select().from(infraAfectacion).where(eq(infraAfectacion.motivo, 'Tormenta severa'))
  const solucionadaEn = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const res = await POST(postReq({
    cue: CUE_R, idempotencyKey: crypto.randomUUID(), rigeDesde: new Date().toISOString(),
    afectacionesSolucionadas: [{ id: fila.id, solucionadaEn }],
  }))
  expect(res.status).toBe(201)
  const [cerrada] = await getDb().select().from(infraAfectacion).where(eq(infraAfectacion.id, fila.id))
  expect(cerrada.cierre).toBe('solucionada')
  expect(cerrada.retiradaEn).toBe(solucionadaEn)
})
```

- [ ] **Step 2: Run to verify they fail** — FAIL (campo desconocido / refine "Todavía no realizó cambios").

- [ ] **Step 3: Implement**

Schema:

```ts
    afectacionesSolucionadas: z
      .array(z.object({ id: z.string().trim().min(1), solucionadaEn: rigeDesdeSchema.optional() }))
      .default([]),
```

y en el primer `refine` agregar `|| data.afectacionesSolucionadas.length > 0`.

Route: `idsReferenciados` incluye `...input.afectacionesSolucionadas.map((s) => s.id)`. El bloque de retiro existente setea `{ retiradaEn: input.rigeDesde, cierre: 'retirada' }`. Nuevo bloque a continuación:

```ts
      for (const solucionada of input.afectacionesSolucionadas) {
        await tx
          .update(infraAfectacion)
          .set({ retiradaEn: solucionada.solucionadaEn ?? input.rigeDesde, cierre: 'solucionada' })
          .where(eq(infraAfectacion.id, solucionada.id))
      }
```

Confirmar que `snapshotDesde`/`diffParte` registran la situación cerrada en `afectacionesRetiradas` del movimiento (lo hacen por diferencia antes/después); no cambiar el diff en esta fase.

- [ ] **Step 4: Run tests** — `pnpm exec vitest run app/api/problematicas/parte/ lib/infraestructura/validacion-trayectoria.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/infraestructura/validacion-trayectoria.ts lib/infraestructura/validacion-trayectoria.test.ts app/api/problematicas/parte/route.ts app/api/problematicas/parte/route.test.ts
git commit -m "feat(parte): cerrar situaciones como solucionadas con su fecha"
```

### Task 9: Edificio evacuado implica clases suspendidas

**Files:**
- Modify: `lib/infraestructura/validacion-trayectoria.ts` (refines ~136–158)
- Test: `lib/infraestructura/validacion-trayectoria.test.ts`

**Interfaces:**
- Produces: mensaje `'Con el edificio evacuado no puede haber clases con normalidad'`.

- [ ] **Step 1: Write the failing test**

```ts
it('rechaza edificio evacuado con clases normales', () => {
  const r = parseParteActualizacionInput({
    cue: '1801605-41', idempotencyKey: 'k', rigeDesde: new Date().toISOString(),
    estadoEstablecimiento: { estado: 'evacuado' },
    servicioEducativo: { estado: 'normal', alcance: { tipo: 'establecimiento' } },
  })
  expect(r).toEqual({ ok: false, error: 'Con el edificio evacuado no puede haber clases con normalidad' })
})

it('centro de evacuados con clases normales sigue siendo válido', () => {
  const r = parseParteActualizacionInput({
    cue: '1801605-41', idempotencyKey: 'k', rigeDesde: new Date().toISOString(),
    estadoEstablecimiento: { estado: 'centro_evacuados' },
    servicioEducativo: { estado: 'normal', alcance: { tipo: 'establecimiento' } },
  })
  expect(r.ok).toBe(true)
})
```

- [ ] **Step 2: Run** — FAIL en el primero.

- [ ] **Step 3: Implement** — agregar al final de la cadena de `parteActualizacionInputSchema`:

```ts
  .refine(
    (data) => !(data.estadoEstablecimiento?.estado === 'evacuado' && data.servicioEducativo?.estado === 'normal'),
    { message: 'Con el edificio evacuado no puede haber clases con normalidad' },
  )
```

Sólo `evacuado`: la spec acordó la regla para Evacuado; "centro de evacuados" no la tiene.

- [ ] **Step 4: Run** — `pnpm exec vitest run lib/infraestructura/validacion-trayectoria.test.ts app/api/problematicas/parte/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/infraestructura/validacion-trayectoria.ts lib/infraestructura/validacion-trayectoria.test.ts
git commit -m "feat(parte): un edificio evacuado no admite clases con normalidad"
```

### Task 10: Relevancia de situaciones

**Files:**
- Create: `lib/infraestructura/relevancia.ts`, `lib/infraestructura/relevancia.test.ts`

**Interfaces:**
- Produces:
  - `interface SituacionRelevancia { severidad: Severidad; estadoEstablecimiento: EstadoEstablecimiento; rigeDesde: string; creadaEn: string }`
  - `compararRelevancia(a: SituacionRelevancia, b: SituacionRelevancia): number` — negativo si `a` es más relevante (apto para `Array.prototype.sort`).
  - `situacionPrincipal<T extends SituacionRelevancia>(situaciones: T[]): T | null`
- Consumidores: Fase 3 (pantalla Actualizar) y la consulta del mapa; no se cablea en esta fase.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { compararRelevancia, situacionPrincipal, type SituacionRelevancia } from './relevancia'

const s = (o: Partial<SituacionRelevancia>): SituacionRelevancia => ({
  severidad: 'Media', estadoEstablecimiento: 'habitual',
  rigeDesde: '2026-10-01T10:00:00.000Z', creadaEn: '2026-10-01T10:00:00.000Z', ...o,
})

describe('compararRelevancia', () => {
  it('ordena primero por gravedad', () => {
    expect([s({ severidad: 'Media' }), s({ severidad: 'Crítica' })].sort(compararRelevancia)[0].severidad).toBe('Crítica')
  })
  it('a igual gravedad, pesa el estado del edificio', () => {
    const orden = [s({ estadoEstablecimiento: 'parcial' }), s({ estadoEstablecimiento: 'evacuado' }), s({ estadoEstablecimiento: 'centro_evacuados' })]
      .sort(compararRelevancia).map((x) => x.estadoEstablecimiento)
    expect(orden).toEqual(['evacuado', 'centro_evacuados', 'parcial'])
  })
  it('a igual en todo, la más reciente primero, y desempata por creadaEn', () => {
    const vieja = s({ rigeDesde: '2026-09-30T10:00:00.000Z' })
    const nueva = s({ rigeDesde: '2026-10-02T10:00:00.000Z' })
    expect([vieja, nueva].sort(compararRelevancia)[0]).toBe(nueva)
    const a = s({ creadaEn: '2026-10-01T10:00:00.000Z' })
    const b = s({ creadaEn: '2026-10-01T11:00:00.000Z' })
    expect([a, b].sort(compararRelevancia)[0]).toBe(b)
  })
  it('situacionPrincipal devuelve null sin situaciones', () => {
    expect(situacionPrincipal([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run** — FAIL (módulo inexistente).

- [ ] **Step 3: Implement**

```ts
import type { EstadoEstablecimiento } from './trayectoria-tipos'
import type { Severidad } from './validacion'

// Spec rediseño §3.3: única definición de "qué situación pesa más". La usan
// el orden de la pantalla Actualizar y la situación principal del mapa; no
// se redefine por componente.
const PESO_SEVERIDAD: Record<Severidad, number> = { Crítica: 4, Alta: 3, Media: 2, Baja: 1 }
const PESO_EDIFICIO: Record<EstadoEstablecimiento, number> = {
  evacuado: 4,
  centro_evacuados: 3,
  parcial: 2,
  habitual: 1,
}

export interface SituacionRelevancia {
  severidad: Severidad
  estadoEstablecimiento: EstadoEstablecimiento
  rigeDesde: string
  creadaEn: string
}

export function compararRelevancia(a: SituacionRelevancia, b: SituacionRelevancia): number {
  return (
    PESO_SEVERIDAD[b.severidad] - PESO_SEVERIDAD[a.severidad] ||
    PESO_EDIFICIO[b.estadoEstablecimiento] - PESO_EDIFICIO[a.estadoEstablecimiento] ||
    Date.parse(b.rigeDesde) - Date.parse(a.rigeDesde) ||
    Date.parse(b.creadaEn) - Date.parse(a.creadaEn)
  )
}

export function situacionPrincipal<T extends SituacionRelevancia>(situaciones: T[]): T | null {
  return [...situaciones].sort(compararRelevancia)[0] ?? null
}
```

Verificar con `rg -n "export type EstadoEstablecimiento" lib/infraestructura/trayectoria-tipos.ts` que los cuatro valores coinciden.

- [ ] **Step 4: Run** — `pnpm exec vitest run lib/infraestructura/relevancia.test.ts` → PASS. Luego `pnpm test && pnpm lint && pnpm build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/infraestructura/relevancia.ts lib/infraestructura/relevancia.test.ts
git commit -m "feat(parte): criterio único de relevancia entre situaciones"
```

---

## Fuera de este plan (fases siguientes)

- Fase 2 (plan propio): wizard "Iniciar reporte" consume `criterioSeveridad(…, categoria)`, `severidadSugerida`, `ETIQUETA_JUSTIFICACION_CRITICA`, bottom sheets, chips de vigencia, selectores nuevos, etiquetas de "¿Hay clases?/¿Cómo está el edificio?". El borrador por paso ya existe (`borrador-historial.ts` + `guardarBorrador` en el form); la Fase 2 sólo agrega el banner de retoma.
- Fase 3 (plan propio): pantalla Actualizar, recorrido guiado, movimiento `confirmacion` ("Sigue igual" hoy lo rechaza `esDiffVacio` con 409), cascada, línea de tiempo con `causadaPorId` y `cierre`, cableado de `compararRelevancia` en el mapa.
- Fase 4: Background Sync.
