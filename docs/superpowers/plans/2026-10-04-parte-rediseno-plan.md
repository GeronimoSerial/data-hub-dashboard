# Rediseño del flujo de partes — Implementation Plan (todas las fases, por batches)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el rediseño completo de los flujos "Iniciar reporte" y "Actualizar" del parte: estado de envío veraz, modelo de datos (gravedad sugerida, criterios por categoría, justificación de Crítica, vínculo causal, cierre "solucionada", relevancia), wizard mobile-first, recorrido guiado de actualización con línea de tiempo y envío en segundo plano.

**Architecture:** Cinco batches en orden de dependencia. Batch 1 corrige el motor de envío (`lib/infraestructura/parte/envio-offline.ts`). Batch 2 agrega columnas nullable (migración `drizzle/0008_*`), reglas puras en `lib/infraestructura/` y su enforcement en `POST /api/problematicas/parte`. Batch 3 rehace el wizard de reporte inicial sobre primitivas mobile (bottom sheet, chips, selectores separados por categoría). Batch 4 reemplaza el formulario de actualización por un recorrido guiado de dos pasos con lógica pura testeable y una línea de tiempo. Batch 5 mueve la cola a IndexedDB y agrega Background Sync con service worker.

**Tech Stack:** Next.js App Router, TypeScript, Zod v4, `@base-ui/react` (Dialog → `components/ui/sheet.tsx`), drizzle-orm 0.45 + drizzle-kit 0.31 (Postgres/pglite), vitest + @testing-library/react + jsdom, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-04-parte-wizard-redesign-design.md`

## Batches

| Batch | Fase del spec | Tasks | Depende de | Entrega verificable |
|---|---|---|---|---|
| 1 | Fase 0 — estado de envío | 1–2 | — | El bug "Pendiente de envío" con conexión desaparece |
| 2 | Fase 1 — modelo de datos | 3–10 | — | API valida y persiste las reglas nuevas; ABM con gravedad sugerida |
| 3 | Fase 2 — iniciar reporte | 11–19 | 1, 2 | Wizard nuevo de reporte inicial, mobile-first |
| 4 | Fase 3 — actualizar | 20–26 | 2, 3 | Recorrido guiado, cascada, línea de tiempo |
| 5 | Fase 4 — envío en segundo plano | 27–28 | 1 | La cola se envía con la pestaña cerrada (donde haya Background Sync) |

Batches 1 y 2 son independientes entre sí y pueden correr en paralelo (no comparten archivos salvo `route.test.ts`, que sólo toca el Batch 2). Dentro de cada batch las tasks van en orden. Cada batch cierra con `pnpm test && pnpm lint && pnpm build` verde.

## Global Constraints

- Comandos: `pnpm test` (vitest run), `pnpm exec vitest run <archivo>`, `pnpm lint`, `pnpm build`. Migraciones: `pnpm exec drizzle-kit generate --name <nombre>`.
- Todas las columnas nuevas son **nullable** (se agregan por `ALTER` sobre bases pobladas).
- Gravedades válidas: exactamente `Baja | Media | Alta | Crítica` (`SEVERIDADES` en `lib/infraestructura/validacion.ts`).
- Justificaciones de Crítica válidas: `mas_personas | riesgo_fisico | se_prolonga | combinado | otro`; detalle obligatorio solo con `otro`, máx. 300 caracteres.
- Ventana del vínculo causal: la causa está activa o fue cerrada hace **≤ 15 días** respecto del `rigeDesde` del envío; misma escuela (`cue_anexo`).
- Copy de UI en español neutro con el registro **usted** que ya usa el recorrido ("Elija", "Indique"). Los textos del spec escritos con voseo se adaptan a usted manteniendo el sentido (p. ej. "Tenés un parte sin enviar" → "Tiene un parte sin enviar"). Comentarios de código siguen el idioma del archivo (español).
- Mobile-first: áreas táctiles ≥ 44×44 px; confirmaciones y preguntas intermedias **siempre** en `ConfirmSheet` (bottom sheet, Task 11), nunca en modal centrado; barra de acciones fija abajo en pantallas ≤ 480 px; controles nativos `type="date"` / `type="time"`.
- Commits: Conventional Commits, sin atribución de IA.
- No se recalculan gravedades de partes existentes.
- Los componentes nuevos de UI van bajo `components/infraestructura/` (los de "Actualizar" bajo `components/infraestructura/actualizar/`) y siguen el patrón contenedor/presentacional del repo: la lógica de decisión vive en funciones puras de `lib/infraestructura/` con test unitario propio.

## Review Focus — Batches 1–2

1. **Error 5xx persistente estando online** — el director debe ver "El servidor no respondió…", no "sin conexión", y el reintento no puede quedar en loop sin espera (backoff con techo de 30 s). Test en Task 1.
2. **Cola pendiente vieja al reabrir con conexión** — debe reenviarse sola usando los datos de la cola, sin depender de que el wizard esté en el paso final. Test en Task 2.
3. **Motivo sin sugerido o renombrado/borrado** — elegir Crítica exige justificación (se trata como "sin sugerido"), nunca un 500. Test en Task 6.
4. **Causa de otra escuela o cerrada hace más de 15 días** — 400 con mensaje entendible, nada persistido. Test en Task 7.
5. **Admin manda una gravedad sugerida inválida** — 400, no se guarda basura que después rompa el badge. Test en Task 4.

## Review Focus — Batches 3–5

1. **Borrador viejo (de antes del rediseño) al abrir el wizard nuevo** — sin campos `vigencia`, `alcanceEstablecimiento` ni justificación: se restaura con defaults y no rompe ni se descarta en silencio. Test en Task 19.
2. **Director cancela un bottom sheet** (categoría, Crítica, interrupción total, cascada) — la elección anterior queda intacta; nada a medio aplicar. Tests en Tasks 13, 14, 18, 25.
3. **"Hoy, más temprano" con una hora futura o "Otro día" fuera de los 12 meses** — no se puede avanzar y el mensaje dice por qué. Test en Task 12.
4. **Situación activa sin respuesta en el recorrido** — no se puede pasar al paso 2 ni enviar. Test en Task 22.
5. **Navegador sin Background Sync (Safari/iOS) o sin IndexedDB** — el envío sigue funcionando con el reintento en primer plano del Batch 1. Tests en Tasks 27–28.

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
| `components/ui/confirm-sheet.tsx` (nuevo), `app/globals.css` | Bottom sheet de confirmación + reglas mobile | 11 |
| `lib/infraestructura/vigencia-eleccion.ts` (nuevo), `components/infraestructura/vigencia-chips.tsx` (nuevo) | "Desde cuándo" con chips | 12 |
| `components/infraestructura/campo-gravedad.tsx` (nuevo), `afectacion-campos.tsx` | Gravedad con sugerido, criterios y justificación; confirmación de categoría | 13, 14 |
| `lib/infraestructura/red-seguridad.ts` (nuevo), `components/infraestructura/aviso-red-seguridad.tsx` (nuevo) | Avisos no bloqueantes reutilizables | 15 |
| `components/infraestructura/selector-alumnos.tsx` (nuevo) | Alcance para categoría alumnos | 16 |
| `components/infraestructura/selector-establecimiento.tsx` (nuevo) | Alcance para categoría establecimiento | 17 |
| `components/infraestructura/campos-clases-edificio.tsx` (nuevo), `estado-actual-textos.ts` | "¿Hay clases?" / "¿Cómo está el edificio?" | 18 |
| `components/infraestructura/reporte-inicial-form.tsx` | Integración del wizard + banner de retoma | 12–19 |
| `lib/infraestructura/movimiento-diff.ts`, `movimiento-descripcion.ts`, `app/api/problematicas/parte/route.ts` | Confirmaciones, causa y cierre en el historial | 20, 21 |
| `lib/infraestructura/parte/recorrido-actualizacion.ts` (nuevo) | Lógica pura del recorrido guiado | 22 |
| `components/infraestructura/linea-de-tiempo.tsx` (nuevo), `app/api/problematicas/parte/historial/route.ts` | Línea de tiempo | 23 |
| `components/infraestructura/actualizar/*.tsx` (nuevos) | Pantalla de entrada, paso 1, paso 2, contenedor | 24–26 |
| `lib/infraestructura/parte/almacen-indexeddb.ts` (nuevo), `public/sw-parte.js` (nuevo), `lib/infraestructura/parte/registrar-sync.ts` (nuevo) | Cola en IndexedDB + Background Sync | 27, 28 |

---

## BATCH 1 — Fase 0: estado de envío veraz

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

## BATCH 2 — Fase 1: modelo de datos

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

## BATCH 3 — Fase 2: iniciar reporte (mobile-first)

Contexto del código actual que todo el batch necesita:

- `components/infraestructura/reporte-inicial-form.tsx` es el contenedor del wizard. Pasos `1 | 2 | 3 | 4` con títulos en `PASOS` (~57): `'¿Qué pasó?'`, `'¿A quiénes afecta?'`, `'¿Cómo sigue el servicio?'`, `'Confirmar'`. `pasosDe('alumnos')` ya devuelve `[1, 2, 4]` (alumnos omite el paso 3, como pide el spec). Validación por paso en `faltanteDelPaso` (~420). Borrador por paso ya persistido con `crearBorradorStore` bajo la clave `parte-nuevo:draft:<cue>` y validado por `esBorradorParteNuevo` (~92).
- `components/infraestructura/afectacion-campos.tsx`: `AfectacionBorrador` (~15), `crearAfectacionVacia` (~65), `CamposQuePaso` (categoría + motivo + gravedad, ~108–266) y `CamposAQuienAfecta` (~272, usa `SeccionesSelector`).
- `components/infraestructura/secciones-selector.tsx`: selector actual con checkbox maestro de tres estados. Se deja de usar en el wizard en este batch y se elimina en la Task 26 (lo sigue usando `actualizacion-form.tsx` hasta entonces).
- Helpers de test del wizard en `components/infraestructura/reporte-inicial-form.test.tsx` (`renderFormulario`, `completarQuePaso`, `completarAQuienAfecta`, `completarEstadoEstablecimiento`, `llegarAConfirmar`, `guardarReporte`) y fixtures en `components/test-utils/parte-formulario.ts`. Cada task que cambie una interacción actualiza esos helpers en el mismo commit.

### Task 11: Bottom sheet de confirmación y reglas mobile

**Files:**
- Create: `components/ui/confirm-sheet.tsx`, `components/ui/confirm-sheet.test.tsx`
- Modify: `app/globals.css` (bloque `.ui-sheet` ~1360; `.opcion-radio` ~3795; `.asistente__acciones` ~3998)

**Interfaces:**
- Produces:

```ts
export interface ConfirmSheetProps {
  open: boolean
  titulo: string
  children?: React.ReactNode
  confirmarLabel: string
  cancelarLabel?: string // default 'Cancelar'
  confirmarDeshabilitado?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}
export function ConfirmSheet(props: ConfirmSheetProps): JSX.Element
```

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmSheet } from './confirm-sheet'

describe('ConfirmSheet', () => {
  it('muestra título y contenido sólo cuando está abierto', () => {
    const { rerender } = render(
      <ConfirmSheet open={false} titulo="¿Seguro?" confirmarLabel="Sí" onConfirmar={() => {}} onCancelar={() => {}}>
        <p>Detalle</p>
      </ConfirmSheet>,
    )
    expect(screen.queryByText('¿Seguro?')).not.toBeInTheDocument()
    rerender(
      <ConfirmSheet open titulo="¿Seguro?" confirmarLabel="Sí" onConfirmar={() => {}} onCancelar={() => {}}>
        <p>Detalle</p>
      </ConfirmSheet>,
    )
    expect(screen.getByText('¿Seguro?')).toBeInTheDocument()
    expect(screen.getByText('Detalle')).toBeInTheDocument()
  })

  it('confirma y cancela con sus botones', () => {
    const onConfirmar = vi.fn()
    const onCancelar = vi.fn()
    render(<ConfirmSheet open titulo="T" confirmarLabel="Sí" onConfirmar={onConfirmar} onCancelar={onCancelar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sí' }))
    expect(onConfirmar).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancelar).toHaveBeenCalledTimes(1)
  })

  it('cerrar con Escape cuenta como cancelar', () => {
    const onCancelar = vi.fn()
    render(<ConfirmSheet open titulo="T" confirmarLabel="Sí" onConfirmar={() => {}} onCancelar={onCancelar} />)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onCancelar).toHaveBeenCalled()
  })

  it('respeta confirmarDeshabilitado', () => {
    render(<ConfirmSheet open titulo="T" confirmarLabel="Sí" confirmarDeshabilitado onConfirmar={() => {}} onCancelar={() => {}} />)
    expect(screen.getByRole('button', { name: 'Sí' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run** — `pnpm exec vitest run components/ui/confirm-sheet.test.tsx` → FAIL (módulo inexistente).

- [ ] **Step 3: Implement** `components/ui/confirm-sheet.tsx`

```tsx
'use client'

import type { JSX, ReactNode } from 'react'
import { Button } from './button'
import { SheetContent, SheetRoot, SheetTitle } from './sheet'

export interface ConfirmSheetProps {
  open: boolean
  titulo: string
  children?: ReactNode
  confirmarLabel: string
  cancelarLabel?: string
  confirmarDeshabilitado?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

// Confirmación pensada para el celular (spec rediseño §3.1): sale desde abajo,
// al alcance del pulgar, y cerrar por cualquier vía (Escape, fondo, la X)
// equivale a cancelar — nunca deja una elección a medio aplicar.
export function ConfirmSheet({
  open,
  titulo,
  children,
  confirmarLabel,
  cancelarLabel = 'Cancelar',
  confirmarDeshabilitado = false,
  onConfirmar,
  onCancelar,
}: ConfirmSheetProps): JSX.Element {
  return (
    <SheetRoot
      open={open}
      onOpenChange={(abierto) => {
        if (!abierto) onCancelar()
      }}
    >
      <SheetContent side="bottom" className="confirm-sheet">
        <SheetTitle>{titulo}</SheetTitle>
        {children ? <div className="confirm-sheet__cuerpo">{children}</div> : null}
        <div className="confirm-sheet__acciones">
          <Button type="button" variant="secondary" onClick={onCancelar}>
            {cancelarLabel}
          </Button>
          <Button type="button" onClick={onConfirmar} disabled={confirmarDeshabilitado}>
            {confirmarLabel}
          </Button>
        </div>
      </SheetContent>
    </SheetRoot>
  )
}
```

`app/globals.css`, después del bloque `.ui-sheet--bottom`:

```css
.confirm-sheet__cuerpo { padding: var(--s-4) var(--s-5); overflow-y: auto; }
.confirm-sheet__acciones {
  display: flex;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-5) calc(var(--s-4) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
}
.confirm-sheet__acciones > * { flex: 1; min-height: 44px; }
```

Junto a `.opcion-radio`: `.opcion-radio { min-height: 44px; }` (agregar la propiedad al bloque existente). Reemplazar el `@media (max-width: 480px)` de `.asistente__acciones` por:

```css
@media (max-width: 480px) {
  .asistente__acciones {
    flex-direction: column-reverse;
    align-items: stretch;
    position: sticky;
    bottom: 0;
    background: var(--card);
    padding-bottom: calc(var(--s-4) + env(safe-area-inset-bottom));
    z-index: 1;
  }
  .asistente__acciones > * { min-height: 44px; }
}
```

- [ ] **Step 4: Run** — `pnpm exec vitest run components/ui/confirm-sheet.test.tsx` → PASS. Si el test de Escape falla porque base-ui escucha el evento en el popup, disparar el `keyDown` sobre `screen.getByRole('dialog')`.

- [ ] **Step 5: Commit**

```bash
git add components/ui/confirm-sheet.tsx components/ui/confirm-sheet.test.tsx app/globals.css
git commit -m "feat(ui): bottom sheet de confirmación y reglas táctiles mobile"
```

### Task 12: "Desde cuándo" con chips

**Files:**
- Create: `lib/infraestructura/vigencia-eleccion.ts`, `lib/infraestructura/vigencia-eleccion.test.ts`
- Create: `components/infraestructura/vigencia-chips.tsx`, `components/infraestructura/vigencia-chips.test.tsx`
- Modify: `components/infraestructura/reporte-inicial-form.tsx` (estado `rigeDesde` ~180; `VigenciaField` ~580 y ~655; `manejarEnvio`; `BorradorParteNuevo` ~74 y su validador)
- Test: `components/infraestructura/reporte-inicial-form.test.tsx`

**Interfaces:**
- Consumes: `rangoVigencia`, `dentroDeRangoVigencia`, `MENSAJE_FUERA_DE_RANGO_VIGENCIA` de `lib/infraestructura/vigencia-rango.ts`.
- Produces:

```ts
export type EleccionVigencia =
  | { modo: 'ahora' }
  | { modo: 'hoy'; hora: string }               // 'HH:mm'
  | { modo: 'otro'; fecha: string; hora: string } // 'YYYY-MM-DD', 'HH:mm'
export const VIGENCIA_AHORA: EleccionVigencia
export function resolverVigencia(eleccion: EleccionVigencia, ahora?: Date): string | null // ISO o null si incompleta/fuera de rango
export function resumenVigencia(eleccion: EleccionVigencia): string
export function etiquetaVigencia(categoria: CategoriaAfectacion | ''): string
export function esEleccionVigencia(valor: unknown): valor is EleccionVigencia
// componente
export function VigenciaChips(props: { value: EleccionVigencia; onChange: (v: EleccionVigencia) => void; label: string; disabled?: boolean; error?: string | null }): JSX.Element
```

- [ ] **Step 1: Write the failing unit tests** (`vigencia-eleccion.test.ts`)

```ts
import { describe, expect, it } from 'vitest'
import { etiquetaVigencia, resolverVigencia, resumenVigencia } from './vigencia-eleccion'

// 2026-10-04 15:00 en Argentina (UTC-3)
const AHORA = new Date('2026-10-04T18:00:00.000Z')

describe('resolverVigencia', () => {
  it('"ahora" resuelve al instante recibido', () => {
    expect(resolverVigencia({ modo: 'ahora' }, AHORA)).toBe(AHORA.toISOString())
  })
  it('"hoy" combina la fecha de hoy con la hora local elegida', () => {
    const iso = resolverVigencia({ modo: 'hoy', hora: '08:30' }, AHORA)
    const d = new Date(iso!)
    expect(d.getHours()).toBe(8)
    expect(d.getMinutes()).toBe(30)
    expect(d.getDate()).toBe(AHORA.getDate())
  })
  it('"hoy" con una hora futura es inválido', () => {
    const futura = new Date(AHORA.getTime() + 60 * 60 * 1000)
    const hora = `${String(futura.getHours()).padStart(2, '0')}:${String(futura.getMinutes()).padStart(2, '0')}`
    expect(resolverVigencia({ modo: 'hoy', hora }, AHORA)).toBeNull()
  })
  it('"otro" fuera de la ventana de 12 meses es inválido', () => {
    expect(resolverVigencia({ modo: 'otro', fecha: '2025-09-01', hora: '10:00' }, AHORA)).toBeNull()
  })
  it('una elección incompleta es inválida', () => {
    expect(resolverVigencia({ modo: 'otro', fecha: '', hora: '10:00' }, AHORA)).toBeNull()
    expect(resolverVigencia({ modo: 'hoy', hora: '' }, AHORA)).toBeNull()
  })
})

describe('resumenVigencia', () => {
  it('describe cada modo en lenguaje llano', () => {
    expect(resumenVigencia({ modo: 'ahora' })).toBe('Desde ahora')
    expect(resumenVigencia({ modo: 'hoy', hora: '08:30' })).toBe('Desde hoy a las 08:30')
    expect(resumenVigencia({ modo: 'otro', fecha: '2026-10-02', hora: '08:30' })).toBe('Desde el jue 02/10 a las 08:30')
  })
})

describe('etiquetaVigencia', () => {
  it('depende de la categoría', () => {
    expect(etiquetaVigencia('establecimiento')).toBe('¿Desde cuándo ocurre?')
    expect(etiquetaVigencia('alumnos')).toBe('¿Desde cuándo no pueden llegar?')
    expect(etiquetaVigencia('')).toBe('¿Desde cuándo ocurre?')
  })
})
```

Si el entorno de test no corre con `TZ=America/Argentina/Buenos_Aires`, los asserts de `getHours` siguen valiendo porque `resolverVigencia` construye la fecha con la zona local del proceso; no fijar zona en el módulo.

- [ ] **Step 2: Run** — FAIL (módulo inexistente).

- [ ] **Step 3: Implement** `lib/infraestructura/vigencia-eleccion.ts`

```ts
import type { CategoriaAfectacion } from './categorias'
import { dentroDeRangoVigencia } from './vigencia-rango'

// Spec rediseño §5.3: tres chips en vez de un panel de fecha y hora. "Ahora"
// se resuelve al ENVIAR, no al abrir el formulario: un parte que se carga en
// diez minutos tiene que fecharse cuando se manda.
export type EleccionVigencia =
  | { modo: 'ahora' }
  | { modo: 'hoy'; hora: string }
  | { modo: 'otro'; fecha: string; hora: string }

export const VIGENCIA_AHORA: EleccionVigencia = { modo: 'ahora' }

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function combinar(fecha: Date, hora: string): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hora)
  if (!m) return null
  const d = new Date(fecha)
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  return d
}

function fechaLocal(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function resolverVigencia(eleccion: EleccionVigencia, ahora: Date = new Date()): string | null {
  if (eleccion.modo === 'ahora') return ahora.toISOString()
  const base = eleccion.modo === 'hoy' ? ahora : fechaLocal(eleccion.fecha)
  if (!base) return null
  const momento = combinar(base, eleccion.hora)
  if (!momento || !dentroDeRangoVigencia(momento, ahora)) return null
  return momento.toISOString()
}

export function resumenVigencia(eleccion: EleccionVigencia): string {
  if (eleccion.modo === 'ahora') return 'Desde ahora'
  if (eleccion.modo === 'hoy') return eleccion.hora ? `Desde hoy a las ${eleccion.hora}` : 'Elija la hora'
  const fecha = fechaLocal(eleccion.fecha)
  if (!fecha || !eleccion.hora) return 'Elija la fecha y la hora'
  return `Desde el ${DIAS[fecha.getDay()]} ${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)} a las ${eleccion.hora}`
}

export function etiquetaVigencia(categoria: CategoriaAfectacion | ''): string {
  return categoria === 'alumnos' ? '¿Desde cuándo no pueden llegar?' : '¿Desde cuándo ocurre?'
}

export function esEleccionVigencia(valor: unknown): valor is EleccionVigencia {
  if (typeof valor !== 'object' || valor === null) return false
  const v = valor as Record<string, unknown>
  if (v.modo === 'ahora') return true
  if (v.modo === 'hoy') return typeof v.hora === 'string'
  if (v.modo === 'otro') return typeof v.fecha === 'string' && typeof v.hora === 'string'
  return false
}
```

Run unit tests → PASS.

- [ ] **Step 4: Write the failing component test** (`vigencia-chips.test.tsx`)

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'
import { VigenciaChips } from './vigencia-chips'

function Controlado() {
  const [v, setV] = useState<EleccionVigencia>({ modo: 'ahora' })
  return <VigenciaChips value={v} onChange={setV} label="¿Desde cuándo ocurre?" />
}

describe('VigenciaChips', () => {
  it('arranca en "Ahora" sin campos de fecha ni hora', () => {
    render(<Controlado />)
    expect(screen.getByRole('radio', { name: 'Ahora' })).toBeChecked()
    expect(screen.queryByLabelText('Hora')).not.toBeInTheDocument()
    expect(screen.getByText('Desde ahora')).toBeInTheDocument()
  })
  it('"Hoy, más temprano" muestra sólo la hora', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Hoy, más temprano' }))
    expect(screen.getByLabelText('Hora')).toBeInTheDocument()
    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '00:01' } })
    expect(screen.getByText('Desde hoy a las 00:01')).toBeInTheDocument()
  })
  it('"Otro día" muestra fecha y hora', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Otro día' }))
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
    expect(screen.getByLabelText('Hora')).toBeInTheDocument()
  })
  it('muestra el error recibido', () => {
    render(<VigenciaChips value={{ modo: 'ahora' }} onChange={() => {}} label="x" error="La fecha debe estar entre hace 12 meses y el momento actual." />)
    expect(screen.getByRole('alert')).toHaveTextContent('12 meses')
  })
})
```

- [ ] **Step 5: Implement** `components/infraestructura/vigencia-chips.tsx`

```tsx
'use client'

import { useId, type JSX } from 'react'
import { rangoVigencia } from '@/lib/infraestructura/vigencia-rango'
import { resumenVigencia, type EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'

const OPCIONES: Array<{ modo: EleccionVigencia['modo']; etiqueta: string }> = [
  { modo: 'ahora', etiqueta: 'Ahora' },
  { modo: 'hoy', etiqueta: 'Hoy, más temprano' },
  { modo: 'otro', etiqueta: 'Otro día' },
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function fechaInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export interface VigenciaChipsProps {
  value: EleccionVigencia
  onChange: (valor: EleccionVigencia) => void
  label: string
  disabled?: boolean
  error?: string | null
}

export function VigenciaChips({ value, onChange, label, disabled = false, error = null }: VigenciaChipsProps): JSX.Element {
  const id = useId()
  const { min, max } = rangoVigencia()

  function elegir(modo: EleccionVigencia['modo']) {
    if (modo === value.modo) return
    if (modo === 'ahora') onChange({ modo: 'ahora' })
    else if (modo === 'hoy') onChange({ modo: 'hoy', hora: '' })
    else onChange({ modo: 'otro', fecha: '', hora: '' })
  }

  return (
    <fieldset className="vigencia-chips" disabled={disabled}>
      <legend className="afectacion-campos__legend">{label}</legend>
      <div className="vigencia-chips__opciones">
        {OPCIONES.map((o) => (
          <label key={o.modo} className="chip-radio">
            <input type="radio" name={`${id}-modo`} checked={value.modo === o.modo} onChange={() => elegir(o.modo)} />
            <span>{o.etiqueta}</span>
          </label>
        ))}
      </div>

      {value.modo !== 'ahora' && (
        <div className="vigencia-chips__campos">
          {value.modo === 'otro' && (
            <label className="ui-label" htmlFor={`${id}-fecha`}>
              Fecha
              <input
                id={`${id}-fecha`}
                type="date"
                min={fechaInput(min)}
                max={fechaInput(max)}
                value={value.fecha}
                onChange={(e) => onChange({ ...value, fecha: e.target.value })}
              />
            </label>
          )}
          <label className="ui-label" htmlFor={`${id}-hora`}>
            Hora
            <input
              id={`${id}-hora`}
              type="time"
              value={value.hora}
              onChange={(e) => onChange({ ...value, hora: e.target.value })}
            />
          </label>
        </div>
      )}

      <p className="vigencia-chips__resumen" aria-live="polite">{resumenVigencia(value)}</p>
      {error ? <p className="vigencia-field__error" role="alert">{error}</p> : null}
    </fieldset>
  )
}
```

Un `<label>` que envuelve el input y contiene el texto "Hora" da el nombre accesible que usan los tests; el `htmlFor` es redundante pero inofensivo. CSS en `app/globals.css`:

```css
.vigencia-chips__opciones { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.chip-radio { display: inline-flex; align-items: center; min-height: 44px; padding: 0 var(--s-4); border: 1px solid var(--line); border-radius: 999px; cursor: pointer; }
.chip-radio input { position: absolute; opacity: 0; pointer-events: none; }
.chip-radio:has(input:checked) { border-color: var(--ink); background: var(--fill); font-weight: 600; }
.chip-radio:has(input:focus-visible) { outline: 2px solid var(--focus, var(--ink)); outline-offset: 2px; }
.vigencia-chips__campos { display: flex; gap: var(--s-3); margin-top: var(--s-3); }
.vigencia-chips__campos input { min-height: 44px; }
.vigencia-chips__resumen { margin-top: var(--s-2); color: var(--ink-soft); }
```

Run component tests → PASS.

- [ ] **Step 6: Integrar en el wizard (test primero)**

Test nuevo en `reporte-inicial-form.test.tsx`:

```tsx
it('envía rigeDesde resuelto al momento de enviar cuando se deja "Ahora"', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-10-04T18:00:00.000Z'))
  const fetchMock = stubFetch()
  renderFormulario()
  llegarAConfirmar()
  vi.setSystemTime(new Date('2026-10-04T18:10:00.000Z'))
  guardarReporte()
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(JSON.parse(init.body as string).rigeDesde).toBe('2026-10-04T18:10:00.000Z')
  vi.useRealTimers()
})

it('la pregunta de vigencia depende de la categoría', () => {
  renderFormulario()
  completarQuePaso() // establecimiento
  continuar()
  expect(screen.getByText('¿Desde cuándo ocurre?')).toBeInTheDocument()
})
```

Si `stubFetch` no devuelve el mock, cambiarlo para que lo devuelva. Ajustar en qué paso aparece la vigencia según dónde la rendericen hoy las líneas ~580/~655 (paso 2 para alumnos, paso 3 para establecimiento): mantener esa ubicación.

Implementación en `reporte-inicial-form.tsx`:
1. Reemplazar `const [rigeDesde, setRigeDesde] = useState(() => new Date().toISOString())` por `const [vigencia, setVigencia] = useState<EleccionVigencia>(VIGENCIA_AHORA)` y `const [errorVigencia, setErrorVigencia] = useState<string | null>(null)`.
2. En ambos lugares donde está `<VigenciaField …/>`: `<VigenciaChips value={vigencia} onChange={(v) => { setVigencia(v); setErrorVigencia(null) }} label={etiquetaVigencia(afectacion.categoria)} disabled={enviando} error={errorVigencia} />`.
3. En `faltanteDelPaso` del paso donde está la vigencia: `if (vigencia.modo !== 'ahora' && resolverVigencia(vigencia) === null) return MENSAJE_FUERA_DE_RANGO_VIGENCIA` (y además `setErrorVigencia` con el mismo texto en `avanzar`).
4. En `manejarEnvio`: `const rigeDesde = resolverVigencia(vigencia)`; si es `null`, `setError(MENSAJE_FUERA_DE_RANGO_VIGENCIA)` y cortar; usar `rigeDesde` en `datosEnvio`.
5. `armarResumen` recibe `rigeDesde: resolverVigencia(vigencia) ?? new Date().toISOString()`.
6. `BorradorParteNuevo` gana `vigencia?: EleccionVigencia`; se sigue escribiendo `rigeDesde` (resuelto) para compatibilidad. En `esBorradorParteNuevo`: `if (b.vigencia !== undefined && !esEleccionVigencia(b.vigencia)) return false`. Al restaurar: `setVigencia(borrador.vigencia ?? VIGENCIA_AHORA)`.
7. `registrarOtra`: `setVigencia(VIGENCIA_AHORA)`.

Actualizar los tests existentes que interactuaban con "Cambiar" / inputs de `VigenciaField` dentro del wizard para usar los chips. `vigencia-field.tsx` sigue existiendo (lo usa `actualizacion-form.tsx` hasta la Task 26).

- [ ] **Step 7: Run** — `pnpm exec vitest run components/infraestructura/ lib/infraestructura/vigencia-eleccion.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/infraestructura/vigencia-eleccion.ts lib/infraestructura/vigencia-eleccion.test.ts components/infraestructura/vigencia-chips.tsx components/infraestructura/vigencia-chips.test.tsx components/infraestructura/reporte-inicial-form.tsx components/infraestructura/reporte-inicial-form.test.tsx app/globals.css
git commit -m "feat(parte): elegir desde cuándo ocurre con chips Ahora, Hoy u Otro día"
```

### Task 13: Gravedad con sugerido, criterios por categoría y justificación de Crítica

**Files:**
- Create: `components/infraestructura/campo-gravedad.tsx`, `components/infraestructura/campo-gravedad.test.tsx`
- Modify: `components/infraestructura/afectacion-campos.tsx` (`AfectacionBorrador`, `crearAfectacionVacia`, fieldset de gravedad ~232–264 pasa a usar `CampoGravedad`)
- Modify: `components/infraestructura/reporte-inicial-form.tsx` (validador del borrador, `faltanteDelPaso(1)`, `datosEnvio`)
- Test: `components/infraestructura/reporte-inicial-form.test.tsx`

**Interfaces:**
- Consumes: `criterioSeveridad` (Task 5), `requiereJustificacionCritica`, `JUSTIFICACIONES_CRITICA`, `ETIQUETA_JUSTIFICACION_CRITICA`, `type JustificacionCritica` (Task 6), `MotivoRow.severidadSugerida` (Task 4), `ConfirmSheet` (Task 11).
- Produces:

```ts
// afectacion-campos.tsx
export interface AfectacionBorrador {
  clientId: string
  categoria: CategoriaAfectacion | ''
  motivo: string
  severidad: Severidad | ''
  justificacionCritica: JustificacionCritica | ''
  justificacionCriticaDetalle: string
  alcanceEstablecimiento: '' | 'toda' | 'algunas' // lo usa la Task 17
  secciones: number[]
  alumnos: number[]
  descripcion: string
}
// campo-gravedad.tsx
export interface ValorGravedad {
  severidad: Severidad | ''
  justificacionCritica: JustificacionCritica | ''
  justificacionCriticaDetalle: string
}
export function CampoGravedad(props: {
  idPrefijo: string
  categoria: CategoriaAfectacion | ''
  sugerida: Severidad | null
  valor: ValorGravedad
  onCambiar: (valor: ValorGravedad) => void
  disabled?: boolean
}): JSX.Element
export function gravedadCompleta(valor: ValorGravedad, sugerida: Severidad | null): boolean
```

- [ ] **Step 1: Write the failing test** (`campo-gravedad.test.tsx`)

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CampoGravedad, type ValorGravedad } from './campo-gravedad'
import type { Severidad } from '@/lib/infraestructura/validacion'

function Controlado({ sugerida, categoria = 'establecimiento' }: { sugerida: Severidad | null; categoria?: 'establecimiento' | 'alumnos' }) {
  const [v, setV] = useState<ValorGravedad>({ severidad: '', justificacionCritica: '', justificacionCriticaDetalle: '' })
  return (
    <>
      <CampoGravedad idPrefijo="t" categoria={categoria} sugerida={sugerida} valor={v} onCambiar={setV} />
      <output data-testid="valor">{JSON.stringify(v)}</output>
    </>
  )
}
const valor = () => JSON.parse(screen.getByTestId('valor').textContent!)

describe('CampoGravedad', () => {
  it('muestra los 4 niveles y marca el sugerido sin preseleccionarlo', () => {
    render(<Controlado sugerida="Alta" />)
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(within(screen.getByText('Alta').closest('label')!).getByText('Sugerido')).toBeInTheDocument()
    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true)
  })

  it('usa los criterios de la categoría', () => {
    render(<Controlado sugerida={null} categoria="alumnos" />)
    expect(screen.getByText('Llegan con demora o dificultad, pero asisten.')).toBeInTheDocument()
  })

  it('Crítica no sugerida abre el sheet y sólo se aplica al confirmar con una razón', () => {
    render(<Controlado sugerida="Media" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    expect(screen.getByText('¿Por qué es crítica?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'Hay riesgo eléctrico, estructural o sanitario' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(valor()).toEqual({ severidad: 'Crítica', justificacionCritica: 'riesgo_fisico', justificacionCriticaDetalle: '' })
  })

  it('"Otro" exige detalle', () => {
    render(<Controlado sugerida="Media" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Otro' }))
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Describa qué pasa'), { target: { value: 'Cayó un árbol sobre el aula' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(valor().justificacionCriticaDetalle).toBe('Cayó un árbol sobre el aula')
  })

  it('cancelar el sheet deja la gravedad anterior', () => {
    render(<Controlado sugerida="Media" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Media' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(valor().severidad).toBe('Media')
  })

  it('Crítica sugerida no pide justificación', () => {
    render(<Controlado sugerida="Crítica" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    expect(screen.queryByText('¿Por qué es crítica?')).not.toBeInTheDocument()
    expect(valor().severidad).toBe('Crítica')
  })
})
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** `campo-gravedad.tsx`

```tsx
'use client'

import { useState, type JSX } from 'react'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Textarea } from '@/components/ui/textarea'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import type { CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import {
  ETIQUETA_JUSTIFICACION_CRITICA,
  JUSTIFICACIONES_CRITICA,
  requiereJustificacionCritica,
  type JustificacionCritica,
} from '@/lib/infraestructura/justificacion-critica'
import { criterioSeveridad } from '@/lib/infraestructura/severidad'
import { SEVERIDADES, type Severidad } from '@/lib/infraestructura/validacion'

export interface ValorGravedad {
  severidad: Severidad | ''
  justificacionCritica: JustificacionCritica | ''
  justificacionCriticaDetalle: string
}

export function gravedadCompleta(valor: ValorGravedad, sugerida: Severidad | null): boolean {
  if (valor.severidad === '') return false
  if (!requiereJustificacionCritica(valor.severidad, sugerida)) return true
  if (valor.justificacionCritica === '') return false
  return valor.justificacionCritica !== 'otro' || valor.justificacionCriticaDetalle.trim() !== ''
}

export interface CampoGravedadProps {
  idPrefijo: string
  categoria: CategoriaAfectacion | ''
  sugerida: Severidad | null
  valor: ValorGravedad
  onCambiar: (valor: ValorGravedad) => void
  disabled?: boolean
}

// Los 4 niveles se muestran siempre (spec rediseño §5.2): el sugerido orienta,
// nunca restringe. Crítica fuera de lo sugerido pide el porqué en un sheet y
// recién al confirmar se aplica; cancelar deja la gravedad como estaba.
export function CampoGravedad({ idPrefijo, categoria, sugerida, valor, onCambiar, disabled = false }: CampoGravedadProps): JSX.Element {
  const [pidiendoJustificacion, setPidiendoJustificacion] = useState(false)
  const [razon, setRazon] = useState<JustificacionCritica | ''>('')
  const [detalle, setDetalle] = useState('')
  const categoriaCriterio = categoria === '' ? 'establecimiento' : categoria

  function elegir(s: Severidad) {
    if (requiereJustificacionCritica(s, sugerida)) {
      setRazon(valor.justificacionCritica)
      setDetalle(valor.justificacionCriticaDetalle)
      setPidiendoJustificacion(true)
      return
    }
    onCambiar({ severidad: s, justificacionCritica: '', justificacionCriticaDetalle: '' })
  }

  const razonValida = razon !== '' && (razon !== 'otro' || detalle.trim() !== '')

  return (
    <fieldset className="afectacion-campos__grupo" disabled={disabled}>
      <legend className="afectacion-campos__legend">¿Qué tan grave es?</legend>
      <div className="afectacion-campos__opciones">
        {SEVERIDADES.map((s) => (
          <label key={s} className="opcion-radio">
            <input
              type="radio"
              name={`${idPrefijo}-severidad`}
              value={s}
              checked={valor.severidad === s}
              onChange={() => elegir(s)}
              aria-labelledby={`${idPrefijo}-severidad-${s}-nombre`}
              aria-describedby={`${idPrefijo}-severidad-${s}-criterio`}
            />
            <span className="opcion-radio__texto">
              <span className="opcion-radio__titulo" id={`${idPrefijo}-severidad-${s}-nombre`}>
                <EstadoActualSeveridad severidad={s} prefijo={false} marca={false} />
                {sugerida === s ? <span className="badge-sugerido">Sugerido</span> : null}
              </span>
              <span className="opcion-radio__ayuda" id={`${idPrefijo}-severidad-${s}-criterio`}>
                {criterioSeveridad(s, categoriaCriterio)}
              </span>
            </span>
          </label>
        ))}
      </div>

      <ConfirmSheet
        open={pidiendoJustificacion}
        titulo="¿Por qué es crítica?"
        confirmarLabel="Confirmar"
        confirmarDeshabilitado={!razonValida}
        onCancelar={() => setPidiendoJustificacion(false)}
        onConfirmar={() => {
          if (!razonValida) return
          onCambiar({
            severidad: 'Crítica',
            justificacionCritica: razon,
            justificacionCriticaDetalle: razon === 'otro' ? detalle.trim() : '',
          })
          setPidiendoJustificacion(false)
        }}
      >
        <div className="afectacion-campos__opciones">
          {JUSTIFICACIONES_CRITICA.map((j) => (
            <label key={j} className="opcion-radio opcion-radio--compacta">
              <input type="radio" name={`${idPrefijo}-justificacion`} checked={razon === j} onChange={() => setRazon(j)} />
              <span className="opcion-radio__titulo">{ETIQUETA_JUSTIFICACION_CRITICA[j]}</span>
            </label>
          ))}
        </div>
        {razon === 'otro' ? (
          <label className="ui-label">
            Describa qué pasa
            <Textarea maxLength={300} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          </label>
        ) : null}
      </ConfirmSheet>
    </fieldset>
  )
}
```

Nota: el nombre accesible del radio sale de `aria-labelledby` (el título) e incluye el texto "Sugerido" del badge. Si eso rompe `getByRole('radio', { name: 'Alta' })` en tests existentes, mover el badge fuera del span con `id` y dejarlo como hermano. CSS: `.badge-sugerido { margin-left: var(--s-2); font-size: var(--t-small); padding: 0 var(--s-2); border-radius: 999px; background: var(--fill); }`.

- [ ] **Step 4: Integrar** en `afectacion-campos.tsx`

- `AfectacionBorrador` y `crearAfectacionVacia` con los campos nuevos (`justificacionCritica: ''`, `justificacionCriticaDetalle: ''`, `alcanceEstablecimiento: ''`).
- `esAfectacionLista` y `esAfectacionParcial` sin cambios de semántica.
- En `CamposQuePaso`, reemplazar el fieldset de gravedad por:

```tsx
<CampoGravedad
  idPrefijo={idPrefijo}
  categoria={borrador.categoria}
  sugerida={motivos.find((m) => m.nombre === borrador.motivo)?.severidadSugerida ?? null}
  valor={borrador}
  onCambiar={(g) => onChange({ ...borrador, ...g })}
  disabled={disabled}
/>
```

- Al cambiar de motivo (`onChange({ ...borrador, motivo: m.nombre })`) limpiar también la gravedad: `severidad: '', justificacionCritica: '', justificacionCriticaDetalle: ''` (la justificación dependía del sugerido del motivo anterior).

En `reporte-inicial-form.tsx`:
- `esBorradorParteNuevo`: aceptar los tres campos como opcionales (`undefined` o del tipo correcto). Al restaurar, normalizar: `setAfectacion({ ...crearAfectacionVacia(borrador.afectacion.clientId), ...borrador.afectacion })`.
- `faltanteDelPaso(1)`: `const sugerida = motivos.find((m) => m.nombre === afectacion.motivo)?.severidadSugerida ?? null`; completo si categoría, motivo y `gravedadCompleta(afectacion, sugerida)`. Mensaje si falta sólo la justificación: `'Indique por qué la situación es crítica.'`.
- `datosEnvio.afectacionesNuevas[0]` agrega `justificacionCritica: afectacion.justificacionCritica || undefined` y `justificacionCriticaDetalle: afectacion.justificacionCriticaDetalle || undefined`.
- Actualizar `components/test-utils/parte-formulario.ts` si construye `AfectacionBorrador` literales (agregar los campos nuevos).

Test de integración en `reporte-inicial-form.test.tsx`:

```tsx
it('una Crítica justificada viaja al servidor con su justificación', async () => {
  const fetchMock = stubFetch()
  renderFormulario() // motivos del fixture: verificar que "Sin energía o agua" tenga severidadSugerida 'Media'; si no, agregársela
  fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
  // si la Task 14 ya está aplicada, confirmar el sheet de categoría aquí
  fireEvent.click(screen.getByRole('radio', { name: 'Sin energía o agua' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Se prolonga en el tiempo o no tiene fecha de solución' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
  continuar()
  completarAQuienAfecta()
  continuar()
  completarEstadoEstablecimiento()
  continuar()
  guardarReporte()
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  const cuerpo = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
  expect(cuerpo.afectacionesNuevas[0]).toMatchObject({ severidad: 'Crítica', justificacionCritica: 'se_prolonga' })
})
```

- [ ] **Step 5: Run** — `pnpm exec vitest run components/infraestructura/` → PASS (ajustar tests de `afectacion-campos.test.tsx` que buscaban el fieldset viejo; el comportamiento visible es el mismo salvo el badge).

- [ ] **Step 6: Commit**

```bash
git add components/infraestructura/campo-gravedad.tsx components/infraestructura/campo-gravedad.test.tsx components/infraestructura/afectacion-campos.tsx components/infraestructura/afectacion-campos.test.tsx components/infraestructura/reporte-inicial-form.tsx components/infraestructura/reporte-inicial-form.test.tsx components/test-utils/parte-formulario.ts app/globals.css
git commit -m "feat(parte): gravedad con sugerido, criterios por categoría y justificación de Crítica"
```

### Task 14: Confirmar la categoría en un bottom sheet

**Files:**
- Modify: `components/infraestructura/afectacion-campos.tsx` (`cambiarCategoria` ~121; fieldset de categoría ~159–180)
- Test: `components/infraestructura/afectacion-campos.test.tsx`, helpers de `reporte-inicial-form.test.tsx`

**Interfaces:**
- Consumes: `ConfirmSheet` (Task 11), `CATEGORIA_META`.
- Produces: `TEXTO_CONFIRMAR_CATEGORIA: Record<CategoriaAfectacion, string>` exportado desde `afectacion-campos.tsx`.

- [ ] **Step 1: Write the failing test** (`afectacion-campos.test.tsx`, usando el render existente de `CamposQuePaso` del archivo)

```tsx
it('elegir una categoría pide confirmación y cancelar no la aplica', () => {
  const onChange = vi.fn()
  renderCamposQuePaso({ onChange }) // helper existente del archivo; si no existe, render directo con borrador vacío
  fireEvent.click(screen.getByRole('radio', { name: /Inaccesibilidad de alumnos/ }))
  expect(screen.getByText(TEXTO_CONFIRMAR_CATEGORIA.alumnos)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Elegir otra' }))
  expect(onChange).not.toHaveBeenCalled()
})

it('confirmar aplica la categoría y limpia motivo y alumnos', () => {
  const onChange = vi.fn()
  renderCamposQuePaso({ onChange })
  fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categoria: 'establecimiento', motivo: '', alumnos: [] }))
})
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```tsx
export const TEXTO_CONFIRMAR_CATEGORIA: Record<CategoriaAfectacion, string> = {
  establecimiento:
    'Va a marcar las secciones que no pueden funcionar por un problema de la escuela. Si son alumnos puntuales que no pueden llegar, elija "Inaccesibilidad de alumnos".',
  alumnos:
    'Va a marcar sólo a los alumnos que no pueden llegar a la escuela. Si el problema es del edificio o afecta a la escuela, elija "Afecta al establecimiento".',
}
```

En `CamposQuePaso`: `const [categoriaPendiente, setCategoriaPendiente] = useState<CategoriaAfectacion | null>(null)`. El `onChange` del radio de categoría pasa a `setCategoriaPendiente(c)` (si `c === borrador.categoria`, no hace nada). El `checked` sigue reflejando `borrador.categoria` (el pendiente no se marca hasta confirmar). Render:

```tsx
<ConfirmSheet
  open={categoriaPendiente !== null}
  titulo={categoriaPendiente ? CATEGORIA_META[categoriaPendiente].label : ''}
  confirmarLabel="Continuar"
  cancelarLabel="Elegir otra"
  onCancelar={() => setCategoriaPendiente(null)}
  onConfirmar={() => {
    if (categoriaPendiente) cambiarCategoria(categoriaPendiente)
    setCategoriaPendiente(null)
  }}
>
  <p>{categoriaPendiente ? TEXTO_CONFIRMAR_CATEGORIA[categoriaPendiente] : null}</p>
</ConfirmSheet>
```

`cambiarCategoria` también limpia `severidad`, justificación y `alcanceEstablecimiento` (`''`) y `secciones: []`: con selectores distintos por categoría (Tasks 16–17) la selección previa ya no es comparable.

Actualizar el helper `completarQuePaso()` de `reporte-inicial-form.test.tsx` para confirmar el sheet (`fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))` inmediatamente después de elegir la categoría — ojo: el botón del wizard también se llama "Continuar"; usar `within(screen.getByRole('dialog')).getByRole('button', { name: 'Continuar' })`).

- [ ] **Step 4: Run** — `pnpm exec vitest run components/infraestructura/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/infraestructura/afectacion-campos.tsx components/infraestructura/afectacion-campos.test.tsx components/infraestructura/reporte-inicial-form.test.tsx
git commit -m "feat(parte): confirmar el tipo de problema antes de cargar el alcance"
```

### Task 15: Red de seguridad reutilizable

**Files:**
- Create: `lib/infraestructura/red-seguridad.ts`, `lib/infraestructura/red-seguridad.test.ts`
- Create: `components/infraestructura/aviso-red-seguridad.tsx`

**Interfaces:**
- Produces:

```ts
export type AccionRedSeguridad = 'cambiar-a-establecimiento' | 'marcar-toda-la-escuela'
export interface AvisoRedSeguridad { id: 'mayoria-alumnos' | 'todas-las-secciones'; mensaje: string; accion: { etiqueta: string; tipo: AccionRedSeguridad } }
export interface EntradaRedSeguridad {
  categoria: CategoriaAfectacion | ''
  alumnosMarcados: number
  matricula: number
  seccionesMarcadas: number
  seccionesTotales: number
  alcanceEstablecimiento: '' | 'toda' | 'algunas'
}
export const UMBRAL_MAYORIA_ALUMNOS = 0.5
export function evaluarRedesSeguridad(entrada: EntradaRedSeguridad): AvisoRedSeguridad[]
// componente
export function AvisosRedSeguridad(props: { avisos: AvisoRedSeguridad[]; onAccion: (tipo: AccionRedSeguridad) => void }): JSX.Element | null
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { evaluarRedesSeguridad } from './red-seguridad'

const base = { categoria: 'alumnos' as const, alumnosMarcados: 0, matricula: 100, seccionesMarcadas: 0, seccionesTotales: 4, alcanceEstablecimiento: '' as const }

describe('evaluarRedesSeguridad', () => {
  it('avisa cuando en alumnos se marca más de la mitad de la matrícula', () => {
    expect(evaluarRedesSeguridad({ ...base, alumnosMarcados: 51 }).map((a) => a.id)).toEqual(['mayoria-alumnos'])
    expect(evaluarRedesSeguridad({ ...base, alumnosMarcados: 50 })).toEqual([])
  })
  it('avisa cuando en establecimiento se marcaron todas las secciones a mano', () => {
    const avisos = evaluarRedesSeguridad({ ...base, categoria: 'establecimiento', alcanceEstablecimiento: 'algunas', seccionesMarcadas: 4 })
    expect(avisos.map((a) => a.id)).toEqual(['todas-las-secciones'])
    expect(avisos[0].accion.tipo).toBe('marcar-toda-la-escuela')
  })
  it('no avisa con "toda la escuela" ni con matrícula cero', () => {
    expect(evaluarRedesSeguridad({ ...base, categoria: 'establecimiento', alcanceEstablecimiento: 'toda', seccionesMarcadas: 4 })).toEqual([])
    expect(evaluarRedesSeguridad({ ...base, matricula: 0, alumnosMarcados: 0 })).toEqual([])
  })
})
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
import type { CategoriaAfectacion } from './categorias'

// Spec rediseño §3.2: avisos no bloqueantes para elecciones posibles pero
// sospechosas. Una regla nueva se agrega acá, con su test, y la UI la muestra
// sin cambios porque sólo recorre la lista.
export type AccionRedSeguridad = 'cambiar-a-establecimiento' | 'marcar-toda-la-escuela'

export interface AvisoRedSeguridad {
  id: 'mayoria-alumnos' | 'todas-las-secciones'
  mensaje: string
  accion: { etiqueta: string; tipo: AccionRedSeguridad }
}

export interface EntradaRedSeguridad {
  categoria: CategoriaAfectacion | ''
  alumnosMarcados: number
  matricula: number
  seccionesMarcadas: number
  seccionesTotales: number
  alcanceEstablecimiento: '' | 'toda' | 'algunas'
}

export const UMBRAL_MAYORIA_ALUMNOS = 0.5

export function evaluarRedesSeguridad(e: EntradaRedSeguridad): AvisoRedSeguridad[] {
  const avisos: AvisoRedSeguridad[] = []
  if (e.categoria === 'alumnos' && e.matricula > 0 && e.alumnosMarcados / e.matricula > UMBRAL_MAYORIA_ALUMNOS) {
    avisos.push({
      id: 'mayoria-alumnos',
      mensaje: 'Marcó a la mayoría de los alumnos. ¿No será un problema del establecimiento?',
      accion: { etiqueta: 'Cambiar a establecimiento', tipo: 'cambiar-a-establecimiento' },
    })
  }
  if (
    e.categoria === 'establecimiento' &&
    e.alcanceEstablecimiento === 'algunas' &&
    e.seccionesTotales > 0 &&
    e.seccionesMarcadas === e.seccionesTotales
  ) {
    avisos.push({
      id: 'todas-las-secciones',
      mensaje: 'Marcó todas las secciones. ¿Es toda la escuela?',
      accion: { etiqueta: 'Sí, toda la escuela', tipo: 'marcar-toda-la-escuela' },
    })
  }
  return avisos
}
```

`components/infraestructura/aviso-red-seguridad.tsx`:

```tsx
'use client'

import type { JSX } from 'react'
import { Button } from '@/components/ui/button'
import type { AccionRedSeguridad, AvisoRedSeguridad } from '@/lib/infraestructura/red-seguridad'

export function AvisosRedSeguridad({
  avisos,
  onAccion,
}: {
  avisos: AvisoRedSeguridad[]
  onAccion: (tipo: AccionRedSeguridad) => void
}): JSX.Element | null {
  if (avisos.length === 0) return null
  return (
    <div className="aviso-red-seguridad" role="status">
      {avisos.map((a) => (
        <p key={a.id} className="aviso-badge">
          <span className="aviso-badge__texto">{a.mensaje}</span>
          <Button type="button" variant="secondary" onClick={() => onAccion(a.accion.tipo)}>
            {a.accion.etiqueta}
          </Button>
        </p>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/infraestructura/red-seguridad.ts lib/infraestructura/red-seguridad.test.ts components/infraestructura/aviso-red-seguridad.tsx
git commit -m "feat(parte): avisos no bloqueantes ante elecciones sospechosas"
```

### Task 16: Selector de alumnos afectados

**Files:**
- Create: `components/infraestructura/selector-alumnos.tsx`, `components/infraestructura/selector-alumnos.test.tsx`
- Modify: `components/infraestructura/afectacion-campos.tsx` (`CamposAQuienAfecta` ~272–313)
- Modify: `app/api/problematicas/parte/route.ts` (loop de `afectacionesNuevas` ~426–436)
- Test: `app/api/problematicas/parte/route.test.ts`

**Interfaces:**
- Consumes: `TurnoContexto`, `SeccionContexto` (`lib/infraestructura/contexto.ts`; cada sección tiene `geSectionId`, `curso`, `division`, `matricula`, `alumnos: { gePersonId, apellido, nombre }[]`), `evaluarRedesSeguridad`, `AvisosRedSeguridad` (Task 15), `obtenerMembresiaSecciones(client, { corteId, geSectionIds }): Promise<Map<number, Set<number>>>` (`lib/infraestructura/impacto.ts:51`).
- Produces:

```ts
export function SelectorAlumnos(props: {
  turnos: TurnoContexto[]
  alumnosSeleccionados: number[]
  onCambiar: (secciones: number[], alumnos: number[]) => void
  disabled?: boolean
}): JSX.Element
export function seccionesDeAlumnos(turnos: TurnoContexto[], alumnos: number[]): number[]
```

- [ ] **Step 1: Write the failing component test**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario' // usar el fixture de turnos que ya exporte el archivo; si tiene otro nombre, ajustar
import { SelectorAlumnos } from './selector-alumnos'

function Controlado() {
  const [estado, setEstado] = useState<{ secciones: number[]; alumnos: number[] }>({ secciones: [], alumnos: [] })
  return (
    <>
      <SelectorAlumnos turnos={TURNOS_FIXTURE} alumnosSeleccionados={estado.alumnos} onCambiar={(secciones, alumnos) => setEstado({ secciones, alumnos })} />
      <output data-testid="estado">{JSON.stringify(estado)}</output>
    </>
  )
}

describe('SelectorAlumnos', () => {
  it('las secciones son agrupadores sin checkbox', () => {
    render(<Controlado />)
    const primera = TURNOS_FIXTURE[0].niveles[0].secciones[0]
    expect(screen.queryByRole('checkbox', { name: new RegExp(`${primera.curso}`) })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(`${primera.curso}`) })).toHaveAttribute('aria-expanded', 'false')
  })

  it('marcar un alumno muestra el badge "1 de N seleccionados" y emite alumnos explícitos', () => {
    render(<Controlado />)
    const seccion = TURNOS_FIXTURE[0].niveles[0].secciones[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${seccion.curso}`) }))
    const alumno = seccion.alumnos[0]
    fireEvent.click(screen.getByRole('checkbox', { name: `${alumno.apellido}, ${alumno.nombre}` }))
    expect(screen.getByText(`1 de ${seccion.alumnos.length} seleccionados`)).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('estado').textContent!)).toEqual({ secciones: [seccion.geSectionId], alumnos: [alumno.gePersonId] })
  })

  it('marcar a todos los alumnos de una sección sigue emitiendo la lista explícita', () => {
    render(<Controlado />)
    const seccion = TURNOS_FIXTURE[0].niveles[0].secciones[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${seccion.curso}`) }))
    for (const a of seccion.alumnos) fireEvent.click(screen.getByRole('checkbox', { name: `${a.apellido}, ${a.nombre}` }))
    expect(JSON.parse(screen.getByTestId('estado').textContent!).alumnos).toHaveLength(seccion.alumnos.length)
  })

  it('resume alumnos y secciones', () => {
    render(<Controlado />)
    const seccion = TURNOS_FIXTURE[0].niveles[0].secciones[0]
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${seccion.curso}`) }))
    fireEvent.click(screen.getByRole('checkbox', { name: `${seccion.alumnos[0].apellido}, ${seccion.alumnos[0].nombre}` }))
    expect(screen.getByText('1 alumno afectado en 1 sección')).toBeInTheDocument()
  })
})
```

Si el fixture no tiene al menos una sección con 2+ alumnos, agregarla en `components/test-utils/parte-formulario.ts`.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** `selector-alumnos.tsx`

```tsx
'use client'

import { useState, type JSX } from 'react'
import { ChevronDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'

export function seccionesDeAlumnos(turnos: TurnoContexto[], alumnos: number[]): number[] {
  const marcados = new Set(alumnos)
  return turnos.flatMap((t) =>
    t.niveles.flatMap((n) =>
      n.secciones.filter((s) => s.alumnos.some((a) => marcados.has(a.gePersonId))).map((s) => s.geSectionId),
    ),
  )
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

// Categoría alumnos (spec rediseño §5.4): se eligen personas, no secciones.
// La sección sólo agrupa; no existe "toda la sección" porque eso describe un
// problema del establecimiento, no de acceso. Siempre emite la lista explícita
// de alumnos, aunque estén todos: así una sección guardada nunca se lee como
// "sección completa".
export function SelectorAlumnos({
  turnos,
  alumnosSeleccionados,
  onCambiar,
  disabled = false,
}: {
  turnos: TurnoContexto[]
  alumnosSeleccionados: number[]
  onCambiar: (secciones: number[], alumnos: number[]) => void
  disabled?: boolean
}): JSX.Element {
  const marcados = new Set(alumnosSeleccionados)
  const [abiertas, setAbiertas] = useState<Set<number>>(() => new Set(seccionesDeAlumnos(turnos, alumnosSeleccionados)))

  function alternarAlumno(gePersonId: number, marcar: boolean) {
    const siguiente = marcar ? [...alumnosSeleccionados, gePersonId] : alumnosSeleccionados.filter((id) => id !== gePersonId)
    onCambiar(seccionesDeAlumnos(turnos, siguiente), siguiente)
  }

  function alternarSeccion(id: number) {
    setAbiertas((actual) => {
      const s = new Set(actual)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  const totalSecciones = seccionesDeAlumnos(turnos, alumnosSeleccionados).length

  return (
    <div className="selector-alumnos">
      {turnos.map((turno) => (
        <section key={turno.turno} className="secciones-selector__turno">
          <h3>{turno.turno}</h3>
          {turno.niveles.flatMap((nivel) =>
            nivel.secciones.map((seccion) => {
              const elegidos = seccion.alumnos.filter((a) => marcados.has(a.gePersonId)).length
              const abierta = abiertas.has(seccion.geSectionId)
              const panelId = `selector-alumnos-${seccion.geSectionId}`
              return (
                <div key={seccion.geSectionId} className="selector-alumnos__seccion">
                  <button
                    type="button"
                    className="selector-alumnos__cabecera"
                    aria-expanded={abierta}
                    aria-controls={panelId}
                    onClick={() => alternarSeccion(seccion.geSectionId)}
                    disabled={disabled}
                  >
                    <span>{`${seccion.curso} "${seccion.division}" · ${nivel.nivel}`}</span>
                    {elegidos > 0 ? <span className="badge-seleccion">{`${elegidos} de ${seccion.alumnos.length} seleccionados`}</span> : null}
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  <div id={panelId} hidden={!abierta} className="selector-alumnos__lista">
                    {seccion.alumnos.map((a) => (
                      <Checkbox
                        key={a.gePersonId}
                        label={`${a.apellido}, ${a.nombre}`}
                        checked={marcados.has(a.gePersonId)}
                        onCheckedChange={(checked: boolean) => alternarAlumno(a.gePersonId, checked)}
                        disabled={disabled}
                      />
                    ))}
                  </div>
                </div>
              )
            }),
          )}
        </section>
      ))}
      <p className="afectacion-borrador__resumen" aria-live="polite">
        {`${plural(alumnosSeleccionados.length, 'alumno afectado', 'alumnos afectados')} en ${plural(totalSecciones, 'sección', 'secciones')}`}
      </p>
    </div>
  )
}
```

CSS: `.selector-alumnos__cabecera { display: flex; align-items: center; gap: var(--s-2); width: 100%; min-height: 44px; justify-content: space-between; background: none; border: 0; border-bottom: 1px solid var(--line); text-align: left; }` y `.badge-seleccion { font-size: var(--t-small); padding: 0 var(--s-2); border-radius: 999px; background: var(--fill); }`.

En `CamposAQuienAfecta`: si `borrador.categoria === 'alumnos'`, renderizar `<Label>Alumnos afectados</Label>` + `<SelectorAlumnos turnos={turnos} alumnosSeleccionados={borrador.alumnos} onCambiar={(secciones, alumnos) => onChange({ ...borrador, secciones, alumnos })} disabled={disabled} />` + `<AvisosRedSeguridad avisos={evaluarRedesSeguridad({ categoria: 'alumnos', alumnosMarcados: borrador.alumnos.length, matricula: matriculaDisponible, seccionesMarcadas: borrador.secciones.length, seccionesTotales: seccionesDisponibles.length, alcanceEstablecimiento: '' })} onAccion={(tipo) => { if (tipo === 'cambiar-a-establecimiento') onChange({ ...borrador, categoria: 'establecimiento', motivo: '', severidad: '', justificacionCritica: '', justificacionCriticaDetalle: '', alumnos: [], secciones: [], alcanceEstablecimiento: '' }) }} />`. Ese cambio de categoría vuelve al paso 1 a elegir motivo: el contenedor (`reporte-inicial-form.tsx`) detecta `motivo === ''` en el paso 2 y hace `setPaso(1)` con el mensaje `'Elija el motivo del problema del establecimiento.'`.

- [ ] **Step 4: Server rule (test primero)** en `route.test.ts`:

```ts
it('en categoría alumnos rechaza una sección sin alumnos explícitos', async () => {
  const res = await POST(postReq({
    cue: CUE_O, idempotencyKey: crypto.randomUUID(), rigeDesde: new Date().toISOString(),
    afectacionesNuevas: [{ motivo: 'Anegamiento', severidad: 'Alta', secciones: [seccionId(CUE_O, '10'), seccionId(CUE_O, '20')], alumnos: alumnoIds(CUE_O, '000', 2) }],
  }))
  expect(res.status).toBe(400)
  expect((await res.json()).error).toBe('Cada sección elegida debe incluir al menos un alumno')
})
```

En el route, dentro del loop de `afectacionesNuevas`, después de `validarAlumnosPermitidos`, si `resuelto.categoria === 'alumnos'` acumular la entrada; tras resolver `client` y `corteId` (ya disponibles más abajo, junto a `seccionesCueSet`), validar:

```ts
  for (const { input: entrada, categoria } of nuevasConCategoria) {
    if (categoria !== 'alumnos') continue
    const membresia = await obtenerMembresiaSecciones(client, { corteId, geSectionIds: entrada.secciones })
    const alumnos = new Set(entrada.alumnos ?? [])
    const todasConAlumno = entrada.secciones.every((s) => [...(membresia.get(s) ?? [])].some((id) => alumnos.has(id)))
    if (!todasConAlumno) return jsonError('Cada sección elegida debe incluir al menos un alumno', 400)
  }
```

Revisar tests existentes que crean afectaciones de alumnos con secciones sin alumnos y agregarles alumnos explícitos.

- [ ] **Step 5: Run** — `pnpm exec vitest run components/infraestructura/ app/api/problematicas/parte/` → PASS.

- [ ] **Step 6: Commit**

```bash
git add components/infraestructura/selector-alumnos.tsx components/infraestructura/selector-alumnos.test.tsx components/infraestructura/afectacion-campos.tsx components/infraestructura/reporte-inicial-form.tsx components/test-utils/parte-formulario.ts app/api/problematicas/parte/route.ts app/api/problematicas/parte/route.test.ts app/globals.css
git commit -m "feat(parte): elegir alumnos afectados sin seleccionar secciones enteras"
```

### Task 17: Selector de alcance del establecimiento

**Files:**
- Create: `components/infraestructura/selector-establecimiento.tsx`, `components/infraestructura/selector-establecimiento.test.tsx`
- Modify: `components/infraestructura/afectacion-campos.tsx` (`CamposAQuienAfecta`), `components/infraestructura/reporte-inicial-form.tsx` (`faltanteDelPaso(2)`, `marcaTodasLasSecciones`)

**Interfaces:**
- Produces:

```ts
export interface ValorAlcanceEstablecimiento { alcance: '' | 'toda' | 'algunas'; secciones: number[] }
export function SelectorEstablecimiento(props: {
  turnos: TurnoContexto[]
  valor: ValorAlcanceEstablecimiento
  onCambiar: (valor: ValorAlcanceEstablecimiento) => void
  disabled?: boolean
}): JSX.Element
```

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { SelectorEstablecimiento, type ValorAlcanceEstablecimiento } from './selector-establecimiento'

const todas = TURNOS_FIXTURE.flatMap((t) => t.niveles.flatMap((n) => n.secciones))

function Controlado() {
  const [v, setV] = useState<ValorAlcanceEstablecimiento>({ alcance: '', secciones: [] })
  return (
    <>
      <SelectorEstablecimiento turnos={TURNOS_FIXTURE} valor={v} onCambiar={setV} />
      <output data-testid="v">{JSON.stringify(v)}</output>
    </>
  )
}
const v = () => JSON.parse(screen.getByTestId('v').textContent!)

describe('SelectorEstablecimiento', () => {
  it('no tiene checkbox maestro de tres estados', () => {
    render(<Controlado />)
    expect(screen.queryByRole('checkbox', { name: /Todas las secciones/ })).not.toBeInTheDocument()
  })
  it('"Toda la escuela" selecciona todas las secciones', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    expect(v()).toEqual({ alcance: 'toda', secciones: todas.map((s) => s.geSectionId) })
  })
  it('"Algunas secciones" muestra checkboxes simples y marcar una no marca "Toda la escuela"', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Algunas secciones' }))
    const s = todas[0]
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`^${s.curso} "${s.division}"`) }))
    expect(v()).toEqual({ alcance: 'algunas', secciones: [s.geSectionId] })
    expect(screen.getByRole('radio', { name: 'Toda la escuela' })).not.toBeChecked()
  })
  it('marcar una sección despliega sus alumnos en sólo lectura', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Algunas secciones' }))
    const s = todas.find((x) => x.alumnos.length > 0)!
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`^${s.curso} "${s.division}"`) }))
    expect(screen.getByText(`${s.alumnos[0].apellido}, ${s.alumnos[0].nombre}`)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: `${s.alumnos[0].apellido}, ${s.alumnos[0].nombre}` })).not.toBeInTheDocument()
  })
  it('"Todo el turno" marca las secciones del turno', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Algunas secciones' }))
    const turno = TURNOS_FIXTURE[0]
    fireEvent.click(screen.getByRole('checkbox', { name: `Todo el turno ${turno.turno}` }))
    const ids = turno.niveles.flatMap((n) => n.secciones.map((s) => s.geSectionId))
    expect(v().secciones).toEqual(ids)
  })
})
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** `selector-establecimiento.tsx`

```tsx
'use client'

import { useId, type JSX } from 'react'
import { Check } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'

export interface ValorAlcanceEstablecimiento {
  alcance: '' | 'toda' | 'algunas'
  secciones: number[]
}

function idsDe(turnos: TurnoContexto[]): number[] {
  return turnos.flatMap((t) => t.niveles.flatMap((n) => n.secciones.map((s) => s.geSectionId)))
}

// Categoría establecimiento (spec rediseño §5.5): primero una decisión
// explícita "toda / algunas". No hay checkbox maestro de tres estados: era el
// que se ponía parcial y hacía creer que se había marcado todo.
export function SelectorEstablecimiento({
  turnos,
  valor,
  onCambiar,
  disabled = false,
}: {
  turnos: TurnoContexto[]
  valor: ValorAlcanceEstablecimiento
  onCambiar: (valor: ValorAlcanceEstablecimiento) => void
  disabled?: boolean
}): JSX.Element {
  const id = useId()
  const marcadas = new Set(valor.secciones)

  function alternar(ids: number[], marcar: boolean) {
    const resto = valor.secciones.filter((s) => !ids.includes(s))
    onCambiar({ alcance: 'algunas', secciones: marcar ? [...resto, ...ids] : resto })
  }

  return (
    <div className="selector-establecimiento">
      <div className="vigencia-chips__opciones" role="radiogroup">
        <label className="chip-radio">
          <input type="radio" name={`${id}-alcance`} checked={valor.alcance === 'toda'} onChange={() => onCambiar({ alcance: 'toda', secciones: idsDe(turnos) })} disabled={disabled} />
          <span>Toda la escuela</span>
        </label>
        <label className="chip-radio">
          <input type="radio" name={`${id}-alcance`} checked={valor.alcance === 'algunas'} onChange={() => onCambiar({ alcance: 'algunas', secciones: [] })} disabled={disabled} />
          <span>Algunas secciones</span>
        </label>
      </div>

      {valor.alcance === 'algunas' &&
        turnos.map((turno) => {
          const idsTurno = turno.niveles.flatMap((n) => n.secciones.map((s) => s.geSectionId))
          const turnoCompleto = idsTurno.length > 0 && idsTurno.every((s) => marcadas.has(s))
          return (
            <section key={turno.turno} className="secciones-selector__turno">
              <Checkbox
                label={`Todo el turno ${turno.turno}`}
                checked={turnoCompleto}
                onCheckedChange={(checked: boolean) => alternar(idsTurno, checked)}
                disabled={disabled}
              />
              {turno.niveles.flatMap((nivel) =>
                nivel.secciones.map((s) => {
                  const marcada = marcadas.has(s.geSectionId)
                  return (
                    <div key={s.geSectionId} className="selector-establecimiento__seccion">
                      <Checkbox
                        label={`${s.curso} "${s.division}" · ${nivel.nivel} — ${s.matricula} alumnos`}
                        checked={marcada}
                        onCheckedChange={(checked: boolean) => alternar([s.geSectionId], checked)}
                        disabled={disabled}
                      />
                      {marcada && s.alumnos.length > 0 ? (
                        <ul className="selector-establecimiento__alumnos" aria-label={`Alumnos de ${s.curso} "${s.division}"`}>
                          {s.alumnos.map((a) => (
                            <li key={a.gePersonId}>
                              <Check size={14} aria-hidden="true" /> {`${a.apellido}, ${a.nombre}`}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )
                }),
              )}
            </section>
          )
        })}
    </div>
  )
}
```

La lista de alumnos se puede plegar con un `<details open>` envolviendo el `<ul>` si el contenido es largo; mantener `open` por defecto al marcar.

En `CamposAQuienAfecta`, rama `establecimiento`: `<Label>¿A quién afecta?</Label>`, `<SelectorEstablecimiento turnos={turnos} valor={{ alcance: borrador.alcanceEstablecimiento, secciones: borrador.secciones }} onCambiar={(v) => onChange({ ...borrador, alcanceEstablecimiento: v.alcance, secciones: v.secciones, alumnos: [] })} />` y `<AvisosRedSeguridad avisos={evaluarRedesSeguridad({ categoria: 'establecimiento', alumnosMarcados: 0, matricula: matriculaDisponible, seccionesMarcadas: borrador.secciones.length, seccionesTotales: seccionesDisponibles.length, alcanceEstablecimiento: borrador.alcanceEstablecimiento })} onAccion={(tipo) => { if (tipo === 'marcar-toda-la-escuela') onChange({ ...borrador, alcanceEstablecimiento: 'toda' }) }} />`. `SeccionesSelector` deja de importarse en `afectacion-campos.tsx`.

En `reporte-inicial-form.tsx`: `faltanteDelPaso(2)` para establecimiento exige `afectacion.alcanceEstablecimiento !== ''` y `secciones.length > 0`; `marcaTodasLasSecciones` pasa a `afectacion.alcanceEstablecimiento === 'toda'`. Actualizar el helper `completarAQuienAfecta()` del test (elegir "Toda la escuela" o "Algunas secciones" + una sección según el caso que cubra).

- [ ] **Step 4: Run** — `pnpm exec vitest run components/infraestructura/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/infraestructura/selector-establecimiento.tsx components/infraestructura/selector-establecimiento.test.tsx components/infraestructura/afectacion-campos.tsx components/infraestructura/reporte-inicial-form.tsx components/infraestructura/reporte-inicial-form.test.tsx
git commit -m "feat(parte): alcance del establecimiento como toda la escuela o algunas secciones"
```

### Task 18: "¿Hay clases?" y "¿Cómo está el edificio?"

**Files:**
- Create: `components/infraestructura/campos-clases-edificio.tsx`, `components/infraestructura/campos-clases-edificio.test.tsx`
- Modify: `components/infraestructura/estado-actual-textos.ts` (`ETIQUETA_ESTABLECIMIENTO` ~99–104; nueva `ETIQUETA_CLASES`)
- Modify: `components/infraestructura/reporte-inicial-form.tsx` (`PASOS[2]`; bloque del paso 3 ~590–640; `confirmarInterrupcionTotal`; `faltanteDelPaso(3)`)
- Test: `components/infraestructura/reporte-inicial-form.test.tsx` + cualquier test que afirme las etiquetas viejas (`rg -n "Funcionamiento habitual|Funcionamiento parcial|Funcionamiento escolar normal|Funcionamiento escolar interrumpido" --glob '*.test.*'`)

**Interfaces:**
- Produces:

```ts
// estado-actual-textos.ts
export const ETIQUETA_CLASES: Record<'normal' | 'suspendido', string> // { normal: 'Sí, con normalidad', suspendido: 'No, se suspendieron' }
// ETIQUETA_ESTABLECIMIENTO pasa a:
// { habitual: 'Sin daños / en uso normal', parcial: 'Uso parcial', evacuado: 'Evacuado', centro_evacuados: 'Usado como centro de evacuados' }
// campos-clases-edificio.tsx
export interface ValorClasesEdificio { servicioEstado: '' | 'normal' | 'suspendido'; estadoEstablecimiento: '' | EstadoEstablecimiento }
export function CamposClasesEdificio(props: {
  valor: ValorClasesEdificio
  onCambiar: (valor: ValorClasesEdificio) => void
  alcanceParcial: boolean          // true si el alcance declarado no es toda la escuela
  onInterrumpirTodaLaEscuela: () => void // el contenedor pasa el alcance a "toda"
  disabled?: boolean
}): JSX.Element
```

`ETIQUETA_SERVICIO` (lecturas del estado: "Funcionamiento escolar normal/parcialmente interrumpido/interrumpido") no cambia en este batch: describe el estado calculado, no la pregunta de carga.

- [ ] **Step 1: Write the failing test** (`campos-clases-edificio.test.tsx`)

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CamposClasesEdificio, type ValorClasesEdificio } from './campos-clases-edificio'

function Controlado({ alcanceParcial = false, onInterrumpir = vi.fn() }: { alcanceParcial?: boolean; onInterrumpir?: () => void }) {
  const [v, setV] = useState<ValorClasesEdificio>({ servicioEstado: '', estadoEstablecimiento: '' })
  return (
    <>
      <CamposClasesEdificio valor={v} onCambiar={setV} alcanceParcial={alcanceParcial} onInterrumpirTodaLaEscuela={onInterrumpir} />
      <output data-testid="v">{JSON.stringify(v)}</output>
    </>
  )
}
const v = () => JSON.parse(screen.getByTestId('v').textContent!)

describe('CamposClasesEdificio', () => {
  it('no usa la palabra "funcionamiento"', () => {
    render(<Controlado />)
    expect(screen.queryByText(/funcionamiento/i)).not.toBeInTheDocument()
    expect(screen.getByText('¿Hay clases?')).toBeInTheDocument()
    expect(screen.getByText('¿Cómo está el edificio?')).toBeInTheDocument()
  })
  it('Evacuado fuerza "No, se suspendieron" y bloquea la pregunta de clases', () => {
    render(<Controlado />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, con normalidad' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Evacuado' }))
    expect(v()).toEqual({ servicioEstado: 'suspendido', estadoEstablecimiento: 'evacuado' })
    expect(screen.getByRole('radio', { name: 'Sí, con normalidad' })).toBeDisabled()
    expect(screen.getByText('El edificio está evacuado')).toBeInTheDocument()
  })
  it('con alcance parcial, evacuar pide confirmación; cancelar no aplica', () => {
    const onInterrumpir = vi.fn()
    render(<Controlado alcanceParcial onInterrumpir={onInterrumpir} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Evacuado' }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText(/interrumpe toda la escuela/)).toBeInTheDocument()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(v().estadoEstablecimiento).toBe('')
    expect(onInterrumpir).not.toHaveBeenCalled()
  })
  it('confirmar la interrupción aplica el estado y pide pasar a toda la escuela', () => {
    const onInterrumpir = vi.fn()
    render(<Controlado alcanceParcial onInterrumpir={onInterrumpir} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Usado como centro de evacuados' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, toda la escuela' }))
    expect(onInterrumpir).toHaveBeenCalledTimes(1)
    expect(v().estadoEstablecimiento).toBe('centro_evacuados')
  })
})
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`estado-actual-textos.ts`:

```ts
// Respuestas de la pregunta de carga "¿Hay clases?" (spec rediseño §5.6).
export const ETIQUETA_CLASES: Record<'normal' | 'suspendido', string> = {
  normal: 'Sí, con normalidad',
  suspendido: 'No, se suspendieron',
}

// spec §3.5 + rediseño §5.6: sin la palabra "funcionamiento", que se
// confundía con el estado de las clases.
export const ETIQUETA_ESTABLECIMIENTO: Record<EstadoEstablecimiento, string> = {
  habitual: 'Sin daños / en uso normal',
  parcial: 'Uso parcial',
  evacuado: 'Evacuado',
  centro_evacuados: 'Usado como centro de evacuados',
}
```

`campos-clases-edificio.tsx`:

```tsx
'use client'

import { useState, type JSX } from 'react'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { ETIQUETA_CLASES, ETIQUETA_ESTABLECIMIENTO } from '@/components/infraestructura/estado-actual-textos'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'

export interface ValorClasesEdificio {
  servicioEstado: '' | 'normal' | 'suspendido'
  estadoEstablecimiento: '' | EstadoEstablecimiento
}

const INTERRUMPE_TODO: EstadoEstablecimiento[] = ['evacuado', 'centro_evacuados']

export function CamposClasesEdificio({
  valor,
  onCambiar,
  alcanceParcial,
  onInterrumpirTodaLaEscuela,
  disabled = false,
}: {
  valor: ValorClasesEdificio
  onCambiar: (valor: ValorClasesEdificio) => void
  alcanceParcial: boolean
  onInterrumpirTodaLaEscuela: () => void
  disabled?: boolean
}): JSX.Element {
  const [pendiente, setPendiente] = useState<EstadoEstablecimiento | null>(null)
  const evacuado = valor.estadoEstablecimiento === 'evacuado'

  function aplicarEdificio(estado: EstadoEstablecimiento) {
    // Evacuado ⇒ sin clases (spec rediseño §5.6): la combinación contraria es
    // imposible, así que se fija sola y se bloquea.
    onCambiar({ estadoEstablecimiento: estado, servicioEstado: estado === 'evacuado' ? 'suspendido' : valor.servicioEstado })
  }

  function elegirEdificio(estado: EstadoEstablecimiento) {
    if (INTERRUMPE_TODO.includes(estado) && alcanceParcial) {
      setPendiente(estado)
      return
    }
    aplicarEdificio(estado)
  }

  return (
    <>
      <fieldset className="afectacion-campos__grupo" disabled={disabled}>
        <legend className="afectacion-campos__legend">¿Hay clases?</legend>
        <div className="afectacion-campos__opciones">
          {(['normal', 'suspendido'] as const).map((estado) => (
            <label key={estado} className="opcion-radio opcion-radio--compacta">
              <input
                type="radio"
                name="servicio-educativo"
                value={estado}
                checked={valor.servicioEstado === estado}
                onChange={() => onCambiar({ ...valor, servicioEstado: estado })}
                disabled={disabled || evacuado}
              />
              <span className="opcion-radio__titulo">{ETIQUETA_CLASES[estado]}</span>
            </label>
          ))}
        </div>
        {evacuado ? <p className="afectacion-campos__espera">El edificio está evacuado</p> : null}
      </fieldset>

      <fieldset className="afectacion-campos__grupo" disabled={disabled}>
        <legend className="afectacion-campos__legend">¿Cómo está el edificio?</legend>
        <div className="afectacion-campos__opciones">
          {(Object.keys(ETIQUETA_ESTABLECIMIENTO) as EstadoEstablecimiento[]).map((estado) => (
            <label key={estado} className="opcion-radio opcion-radio--compacta">
              <input
                type="radio"
                name="estado-establecimiento"
                value={estado}
                checked={valor.estadoEstablecimiento === estado}
                onChange={() => elegirEdificio(estado)}
              />
              <span className="opcion-radio__titulo">{ETIQUETA_ESTABLECIMIENTO[estado]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <ConfirmSheet
        open={pendiente !== null}
        titulo="¿Pasamos el alcance a toda la escuela?"
        confirmarLabel="Sí, toda la escuela"
        onCancelar={() => setPendiente(null)}
        onConfirmar={() => {
          if (pendiente) {
            aplicarEdificio(pendiente)
            onInterrumpirTodaLaEscuela()
          }
          setPendiente(null)
        }}
      >
        <p>Esto interrumpe toda la escuela, pero marcó sólo algunas secciones.</p>
      </ConfirmSheet>
    </>
  )
}
```

`reporte-inicial-form.tsx`:
- `PASOS[2]` → `'Clases y edificio'`.
- Reemplazar los dos fieldsets viejos del paso 3 y el bloque `requiereConfirmarInterrupcion` (texto + checkbox) por `<CamposClasesEdificio valor={{ servicioEstado, estadoEstablecimiento }} onCambiar={(x) => { setServicioEstado(x.servicioEstado); setEstadoEstablecimiento(x.estadoEstablecimiento) }} alcanceParcial={afectacion.alcanceEstablecimiento !== 'toda'} onInterrumpirTodaLaEscuela={() => { setAfectacion((a) => ({ ...a, alcanceEstablecimiento: 'toda', secciones: aplanarSecciones(turnos).map((s) => s.geSectionId) })); setConfirmarInterrupcionTotal(true) }} disabled={enviando} />`. El fieldset de asistencia pedagógica queda debajo, igual que hoy.
- `faltanteDelPaso(3)`: quitar la rama de `requiereConfirmarInterrupcion`; agregar `if (servicioEstado === '') return 'Indique si hay clases.'`.
- `datosEnvio.confirmarInterrupcionTotal`: `confirmarInterrupcionTotal || (evacuaEstablecimiento && afectacion.alcanceEstablecimiento === 'toda')`.

- [ ] **Step 4: Run** — `pnpm exec vitest run components/ app/` → PASS tras actualizar los asserts de etiquetas viejas a las nuevas.

- [ ] **Step 5: Commit**

```bash
git add components/infraestructura/campos-clases-edificio.tsx components/infraestructura/campos-clases-edificio.test.tsx components/infraestructura/estado-actual-textos.ts components/infraestructura/reporte-inicial-form.tsx components/infraestructura/reporte-inicial-form.test.tsx
git commit -m "feat(parte): preguntar por clases y edificio sin mezclar la palabra funcionamiento"
```

(Agregar al `git add` los tests de lecturas que se hayan ajustado por las etiquetas.)

### Task 19: Retomar un parte sin enviar

**Files:**
- Modify: `components/infraestructura/reporte-inicial-form.tsx` (efecto de restauración ~212–234; render)
- Test: `components/infraestructura/reporte-inicial-form.test.tsx` (tests del issue #32 que hoy esperan restauración automática)

**Interfaces:**
- Produces: `MENSAJE_BORRADOR_PENDIENTE = 'Tiene un parte sin enviar. Puede continuar donde lo dejó.'` exportado desde el form.

- [ ] **Step 1: Write the failing tests**

```tsx
it('al volver con un borrador sin enviar ofrece continuar o descartar', async () => {
  sembrarBorradorWizard({ paso: 2 }) // helper nuevo: escribe en localStorage `parte-nuevo:draft:<cue>` un BorradorParteNuevo válido en el paso 2
  renderFormulario()
  expect(await screen.findByText(MENSAJE_BORRADOR_PENDIENTE)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar donde lo dejé' }))
  expect(screen.getByText('¿A quiénes afecta?', { selector: 'h3' })).toBeInTheDocument()
})

it('descartar pide confirmación y arranca de cero', async () => {
  sembrarBorradorWizard({ paso: 2 })
  renderFormulario()
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, descartar' }))
  expect(screen.queryByText(MENSAJE_BORRADOR_PENDIENTE)).not.toBeInTheDocument()
  expect(screen.getByText('¿Qué pasó?', { selector: 'h3' })).toBeInTheDocument()
  expect(localStorage.getItem(`parte-nuevo:draft:${props.cue}`)).toBeNull()
})

it('un borrador viejo sin los campos nuevos se restaura con valores por defecto', async () => {
  sembrarBorradorWizard({ paso: 2, sinCamposNuevos: true })
  renderFormulario()
  fireEvent.click(await screen.findByRole('button', { name: 'Continuar donde lo dejé' }))
  expect(screen.getByRole('radio', { name: 'Ahora' })).toBeChecked() // la vigencia vuelve a "Ahora" (si el paso 2 la muestra)
})
```

`sembrarBorradorWizard` escribe con el mismo formato que `borradorStore.guardar` (leer `lib/infraestructura/parte/borrador-historial.ts` `crearBorradorStore` para el envoltorio exacto). Reescribir los tests de #32 que esperaban restauración inmediata para que primero toquen "Continuar donde lo dejé".

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

1. Extraer el cuerpo actual de restauración (los `set…` de ~218–229 y `sincronizarHistorialTrasRestaurar`) a `function aplicarBorrador(borrador: BorradorParteNuevo)`, normalizando campos opcionales nuevos (`vigencia ?? VIGENCIA_AHORA`, afectación con `crearAfectacionVacia` como base).
2. El efecto de montaje, en lugar de aplicar, hace `setBorradorPendiente(borrador)` (estado nuevo `useState<BorradorParteNuevo | null>(null)`), salvo que el borrador esté en el paso 1 sin ningún dato (`!esAfectacionParcial(borrador.afectacion) && !esAfectacionLista(borrador.afectacion)`), en cuyo caso se aplica directo sin banner.
3. Mientras `borradorPendiente !== null`, el efecto de escritura del borrador no debe pisarlo: agregar `if (borradorPendiente) return` al inicio de ese efecto.
4. Render, arriba del progreso:

```tsx
{borradorPendiente ? (
  <div className="aviso-retoma" role="status">
    <p>{MENSAJE_BORRADOR_PENDIENTE}</p>
    <div className="asistente__acciones">
      <Button type="button" variant="secondary" onClick={() => setConfirmarDescarte(true)}>Descartar</Button>
      <Button type="button" onClick={() => { aplicarBorrador(borradorPendiente); setBorradorPendiente(null) }}>Continuar donde lo dejé</Button>
    </div>
  </div>
) : null}
<ConfirmSheet
  open={confirmarDescarte}
  titulo="¿Descartar el parte sin enviar?"
  confirmarLabel="Sí, descartar"
  onCancelar={() => setConfirmarDescarte(false)}
  onConfirmar={() => { void limpiarBorrador(claveBorrador); setBorradorPendiente(null); setConfirmarDescarte(false) }}
>
  <p>Se pierde lo que cargó y no se envía nada.</p>
</ConfirmSheet>
```

Mientras haya banner, el cuerpo del wizard no se muestra (evita cargar encima del borrador).
5. El estado de la cola de envío (`leerColaEnvio` al montar) se mantiene: un parte **enviado pero sin confirmar** se ve con el indicador de estado del Batch 1, distinto del banner de borrador.

- [ ] **Step 4: Run** — `pnpm exec vitest run components/infraestructura/reporte-inicial-form.test.tsx` → PASS. Cierre de batch: `pnpm test && pnpm lint && pnpm build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/infraestructura/reporte-inicial-form.tsx components/infraestructura/reporte-inicial-form.test.tsx app/globals.css
git commit -m "feat(parte): ofrecer continuar o descartar un parte sin enviar"
```

---

## BATCH 4 — Fase 3: actualizar

Contexto del código actual:

- La página `app/problematicas/parte/actualizar/page.tsx` renderiza `ActualizacionForm` (`components/infraestructura/actualizacion-form.tsx`, 933 líneas, formulario único con inventario de afectaciones). Este batch lo reemplaza por `RecorridoActualizacion` y elimina el formulario viejo en la Task 26.
- `GET /api/problematicas/parte?cue=` devuelve `EstadoActualRespuesta` (`components/infraestructura/estado-actual-textos.ts:63`): `parte`, `servicio`, `afectaciones: AfectacionVigente[]` (`id, motivo, categoria, severidad, descripcion, rigeDesde, secciones, totales`), `secciones`, `ultimaActualizacion`.
- `GET /api/problematicas/parte/historial?cue=` devuelve movimientos `MovimientoHistorial` (`components/infraestructura/historial-movimiento.tsx:15`: `id, tipo, rol, creadaEn, rigeDesde, cambios: string[]`), con `cambios` armados por `describirMovimiento` (`lib/infraestructura/movimiento-descripcion.ts:56`) a partir del `DiffParte` guardado en `infra_movimiento.resumen`.
- El POST rechaza con 409 un envío cuyo diff está vacío (`esDiffVacio`, ~808): "Sigue igual" necesita la Task 20.

### Task 20: El historial registra "sigue igual", "se solucionó" y "causado por"

**Files:**
- Modify: `lib/infraestructura/movimiento-diff.ts` (`DiffAfectacionAgregada` ~30, `DiffAfectacionRetirada` ~39, `DiffParte`, `esDiffVacio`)
- Modify: `lib/infraestructura/movimiento-descripcion.ts` (`describirMovimiento`)
- Modify: `lib/infraestructura/validacion-trayectoria.ts` (`afectacionesConfirmadas`)
- Modify: `app/api/problematicas/parte/route.ts` (`idsReferenciados` ~498; después de `diffParte` ~771; inserción del movimiento ~781; chequeo de diff vacío ~808)
- Test: `lib/infraestructura/movimiento-descripcion.test.ts` (crear si no existe), `app/api/problematicas/parte/route.test.ts`

**Interfaces:**
- Produces:

```ts
export interface DiffAfectacionAgregada { afectacionId: string; motivo: string; categoria: Categoria; severidad: Severidad; secciones: number; alumnos: number; causadaPor?: { afectacionId: string; motivo: string } }
export interface DiffAfectacionRetirada { afectacionId: string; motivo: string; cierre?: 'solucionada' | 'retirada' }
export interface DiffAfectacionConfirmada { afectacionId: string; motivo: string }
export interface DiffParte { /* campos actuales */ afectacionesConfirmadas?: DiffAfectacionConfirmada[] }
// input
afectacionesConfirmadas: string[] // ids, default []
// tipo de movimiento nuevo: 'confirmacion' (sólo confirmaciones, sin otros cambios)
```

- [ ] **Step 1: Write the failing tests**

`movimiento-descripcion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { describirMovimiento } from './movimiento-descripcion'
import type { DiffParte } from './movimiento-diff'

const vacio: DiffParte = {
  afectacionesAgregadas: [], afectacionesRetiradas: [], severidadesCambiadas: [], alcancesCambiados: [],
  datosCambiados: [], serviciosCambiados: [], establecimientoCambiado: null,
} as DiffParte

describe('describirMovimiento — rediseño', () => {
  it('describe una confirmación', () => {
    expect(describirMovimiento({ ...vacio, afectacionesConfirmadas: [{ afectacionId: 'a', motivo: 'Inundación' }] })).toContain('Sigue igual: "Inundación"')
  })
  it('distingue solucionada de retirada', () => {
    expect(describirMovimiento({ ...vacio, afectacionesRetiradas: [{ afectacionId: 'a', motivo: 'Inundación', cierre: 'solucionada' }] })).toContain('Se solucionó "Inundación"')
    expect(describirMovimiento({ ...vacio, afectacionesRetiradas: [{ afectacionId: 'a', motivo: 'Inundación' }] })).toContain('Se resolvió "Inundación"')
  })
  it('agrega el vínculo causal', () => {
    const lineas = describirMovimiento({
      ...vacio,
      afectacionesAgregadas: [{ afectacionId: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', secciones: 1, alumnos: 0, causadaPor: { afectacionId: 'a', motivo: 'Inundación' } }],
    })
    expect(lineas).toContain('Causado por "Inundación"')
  })
})
```

Completar `vacio` con los campos reales de `DiffParte` (leer la interfaz completa, incluye `asistenciaPedagogicaCambiada` u otros) para que compile sin `as`.

`route.test.ts` (nuevo `CUE_S = '1801605-63'` en el setup):

```ts
it('"sigue igual" registra un movimiento de confirmación aunque no cambie nada', async () => {
  await POST(postReq({
    cue: CUE_S, idempotencyKey: crypto.randomUUID(), rigeDesde: new Date().toISOString(),
    afectacionesNuevas: [{ motivo: 'Tormenta severa', severidad: 'Alta', secciones: [seccionId(CUE_S, '10')] }],
  }))
  const [fila] = await getDb().select().from(infraAfectacion).innerJoin(infraParte, eq(infraParte.id, infraAfectacion.parteId)).where(eq(infraParte.cueAnexo, CUE_S))
  const res = await POST(postReq({
    cue: CUE_S, idempotencyKey: crypto.randomUUID(), rigeDesde: new Date().toISOString(),
    afectacionesConfirmadas: [fila.infra_afectacion.id],
  }))
  expect(res.status).toBe(201)
  const movimientos = await getDb().select().from(infraMovimiento).where(eq(infraMovimiento.parteId, fila.infra_parte.id))
  const ultimo = movimientos.sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))[0]
  expect(ultimo.tipo).toBe('confirmacion')
  expect((ultimo.resumen as { afectacionesConfirmadas: unknown[] }).afectacionesConfirmadas).toEqual([{ afectacionId: fila.infra_afectacion.id, motivo: 'Tormenta severa' }])
})
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`movimiento-diff.ts`: extender las interfaces como en **Interfaces**; `esDiffVacio(diff)` devuelve `false` si `(diff.afectacionesConfirmadas?.length ?? 0) > 0`.

`movimiento-descripcion.ts`, en `describirMovimiento`:

```ts
  for (const confirmada of diff.afectacionesConfirmadas ?? []) {
    lineas.push(`Sigue igual: "${confirmada.motivo}"`)
  }
```

(al principio, antes de servicios); en el loop de retiradas: `lineas.push(retirada.cierre === 'solucionada' ? \`Se solucionó "${retirada.motivo}"\` : \`Se resolvió "${retirada.motivo}"\`)`; en agregadas, después de la línea principal (en ambas ramas, inicial y no inicial): `if (agregada.causadaPor) lineas.push(\`Causado por "${agregada.causadaPor.motivo}"\`)`.

`validacion-trayectoria.ts`: `afectacionesConfirmadas: z.array(z.string().trim().min(1)).default([]),` y sumarlo al primer `refine`.

`route.ts`:
- `idsReferenciados` incluye `...input.afectacionesConfirmadas`.
- Tras `const diff = diffParte(antes, despues)`, enriquecer antes de persistir:

```ts
      const motivoPorId = new Map(afectacionesActuales.map((a) => [a.id, a.motivo]))
      diff.afectacionesConfirmadas = input.afectacionesConfirmadas.map((id) => ({ afectacionId: id, motivo: motivoPorId.get(id) ?? '' }))
      const solucionadas = new Set(input.afectacionesSolucionadas.map((s) => s.id))
      diff.afectacionesRetiradas = diff.afectacionesRetiradas.map((r) => ({ ...r, cierre: solucionadas.has(r.afectacionId) ? 'solucionada' : 'retirada' }))
      const causaPorNuevaId = new Map<string, string>() // afectacionId nueva → causadaPorId; poblarlo en el loop de inserción de nuevas (Task 7)
      diff.afectacionesAgregadas = diff.afectacionesAgregadas.map((a) => {
        const causaId = causaPorNuevaId.get(a.afectacionId)
        return causaId ? { ...a, causadaPor: { afectacionId: causaId, motivo: motivoPorId.get(causaId) ?? motivoCausaExterna.get(causaId) ?? '' } } : a
      })
```

`causaPorNuevaId` se declara antes del loop de inserción de nuevas y se completa con `causaPorNuevaId.set(id, entrada.causadaPorId)` cuando hay causa. `motivoCausaExterna` es un `Map<string, string>` con el motivo de las causas cargadas en la validación de la Task 7 (agregar `motivo: infraAfectacion.motivo` a ese `select`), para causas de otro período.
- El tipo del movimiento: si no hubo altas, modificaciones, retiros, solucionadas ni cambios de servicio/edificio/asistencia y sí confirmaciones → `'confirmacion'`; resto, como hoy. Actualizar el comentario de `infraMovimiento.tipo` en `lib/db/schema.ts` con el valor nuevo.

- [ ] **Step 4: Run** — `pnpm exec vitest run lib/infraestructura/ app/api/problematicas/parte/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/infraestructura/movimiento-diff.ts lib/infraestructura/movimiento-descripcion.ts lib/infraestructura/movimiento-descripcion.test.ts lib/infraestructura/validacion-trayectoria.ts lib/db/schema.ts app/api/problematicas/parte/route.ts app/api/problematicas/parte/route.test.ts
git commit -m "feat(parte): registrar confirmaciones, soluciones y causas en el historial"
```

### Task 21: El estado actual trae causa, situaciones recientes y última carga

**Files:**
- Modify: `lib/infraestructura/parte-consulta.ts` (`cargarAfectaciones` ~130–160: mapear `causadaPorId`; nueva `listarSituacionesRecientes`)
- Modify: `app/api/problematicas/parte/route.ts` (`GET` ~166–257)
- Modify: `components/infraestructura/estado-actual-textos.ts` (`AfectacionVigente`, `EstadoActualRespuesta`)
- Test: `app/api/problematicas/parte/route.test.ts`

**Interfaces:**
- Produces:

```ts
export interface AfectacionVigente { /* actuales */ creadaEn: string; causadaPorId: string | null }
export interface SituacionReciente { id: string; motivo: string; severidad: Severidad; retiradaEn: string; cierre: 'solucionada' | 'retirada' | null }
export interface EstadoActualRespuesta { /* actuales */ recientes?: SituacionReciente[]; ultimaCarga?: { creadaEn: string; cambios: string[] } | null }
export async function listarSituacionesRecientes(cueAnexo: string, ahora?: Date): Promise<SituacionReciente[]> // cerradas hace ≤ VENTANA_CAUSA_DIAS, cualquier período, más nueva primero
```

- [ ] **Step 1: Write the failing test**

```ts
it('GET devuelve recientes cerradas y la última carga', async () => {
  // Reutiliza CUE_R de la Task 8: tiene una "Tormenta severa" solucionada.
  const res = await GET(getReq(CUE_R))
  const body = await res.json()
  expect(body.recientes.map((r: { motivo: string }) => r.motivo)).toContain('Tormenta severa')
  expect(body.recientes[0].cierre).toBe('solucionada')
  expect(body.ultimaCarga.cambios.join(' ')).toMatch(/Se solucionó "Tormenta severa"/)
  expect(typeof body.ultimaCarga.creadaEn).toBe('string')
})

it('GET expone causadaPorId en las afectaciones vigentes', async () => {
  const body = await (await GET(getReq(CUE_Q))).json()
  const hija = body.afectaciones.find((a: { motivo: string }) => a.motivo === 'Sin energía o agua')
  expect(hija.causadaPorId).toEqual(expect.any(String))
})
```

Si el orden de ejecución de los describe no garantiza los datos de CUE_R/CUE_Q, crear los datos dentro del test con un CUE nuevo agregado al setup.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`parte-consulta.ts`: en el `return` de `cargarAfectaciones` agregar `causadaPorId: fila.causadaPorId` (y al tipo `Afectacion` de `trayectoria-tipos.ts` como `causadaPorId?: string | null`). Nueva función:

```ts
export async function listarSituacionesRecientes(cueAnexo: string, ahora: Date = new Date()): Promise<SituacionReciente[]> {
  const desde = new Date(ahora.getTime() - VENTANA_CAUSA_DIAS * 24 * 60 * 60 * 1000).toISOString()
  const filas = await getDb()
    .select({ id: infraAfectacion.id, motivo: infraAfectacion.motivo, severidad: infraAfectacion.severidad, retiradaEn: infraAfectacion.retiradaEn, cierre: infraAfectacion.cierre })
    .from(infraAfectacion)
    .innerJoin(infraParte, eq(infraParte.id, infraAfectacion.parteId))
    .where(and(eq(infraParte.cueAnexo, cueAnexo), isNotNull(infraAfectacion.retiradaEn), gte(infraAfectacion.retiradaEn, desde)))
    .orderBy(desc(infraAfectacion.retiradaEn))
  return filas.map((f) => ({ ...f, severidad: f.severidad as Severidad, retiradaEn: f.retiradaEn!, cierre: (f.cierre as SituacionReciente['cierre']) ?? null }))
}
```

(`SituacionReciente` se define en `trayectoria-tipos.ts` y se re-exporta desde `estado-actual-textos.ts`; importar `isNotNull, gte, desc` de `drizzle-orm`.)

`GET` del route: agregar `recientes: await listarSituacionesRecientes(cue.value)` y `ultimaCarga` = primer elemento de `await listarMovimientosDescritos(cue.value, corteId)` mapeado a `{ creadaEn, cambios }` (verificar el orden que devuelve esa función: si es ascendente, tomar el último), o `null`. Cada afectación vigente de la respuesta incluye `creadaEn` y `causadaPorId`.

- [ ] **Step 4: Run** — `pnpm exec vitest run app/api/problematicas/parte/ components/infraestructura/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/infraestructura/parte-consulta.ts lib/infraestructura/trayectoria-tipos.ts components/infraestructura/estado-actual-textos.ts app/api/problematicas/parte/route.ts app/api/problematicas/parte/route.test.ts
git commit -m "feat(parte): exponer causa, situaciones recientes y última carga del parte"
```

### Task 22: Lógica pura del recorrido guiado

**Files:**
- Create: `lib/infraestructura/parte/recorrido-actualizacion.ts`, `lib/infraestructura/parte/recorrido-actualizacion.test.ts`

**Interfaces:**
- Consumes: `ParteActualizacionInput` (Zod), `JustificacionCritica`, `Severidad`, `compararRelevancia` (Task 10).
- Produces:

```ts
export type AspectoCambio = 'gravedad' | 'alcance' | 'clases-edificio'
export interface CambioSituacion {
  aspectos: AspectoCambio[]
  severidad?: Severidad
  justificacionCritica?: JustificacionCritica
  justificacionCriticaDetalle?: string
  secciones?: number[]
  alumnos?: number[]
}
export type RespuestaSituacion =
  | { tipo: 'sigue' }
  | { tipo: 'cambio'; cambio: CambioSituacion }
  | { tipo: 'solucionada'; solucionadaEn: string }
export interface SituacionRecorrido { id: string; motivo: string; categoria: CategoriaAfectacion; severidad: Severidad; rigeDesde: string; creadaEn: string; causadaPorId: string | null }
export interface NuevaSituacion {
  causadaPorId: string | null
  motivo: string
  severidad: Severidad
  justificacionCritica?: JustificacionCritica
  justificacionCriticaDetalle?: string
  secciones: number[]
  alumnos?: number[]
  descripcion?: string
}
export interface EstadoRecorrido {
  respuestas: Record<string, RespuestaSituacion>
  nueva: NuevaSituacion | null
  clasesEdificio: { servicioEstado: 'normal' | 'suspendido'; estadoEstablecimiento: EstadoEstablecimiento; confirmarInterrupcionTotal: boolean } | null
}
export const RECORRIDO_INICIAL: EstadoRecorrido
export function ordenarSituaciones(situaciones: SituacionRecorrido[], estadoEstablecimiento: EstadoEstablecimiento): SituacionRecorrido[]
export function situacionesSinRespuesta(situaciones: SituacionRecorrido[], estado: EstadoRecorrido): string[]
export function consecuenciasActivas(situaciones: SituacionRecorrido[], causaId: string, estado: EstadoRecorrido): SituacionRecorrido[] // hijas directas aún no solucionadas
export function situacionConMismoMotivo(situaciones: SituacionRecorrido[], motivo: string, estado: EstadoRecorrido): SituacionRecorrido | null // activa y no solucionada en este recorrido
export function responder(estado: EstadoRecorrido, id: string, respuesta: RespuestaSituacion): EstadoRecorrido
export function construirEnvio(situaciones: SituacionRecorrido[], estado: EstadoRecorrido): Pick<ParteActualizacionInput, 'afectacionesConfirmadas' | 'afectacionesModificadas' | 'afectacionesSolucionadas' | 'afectacionesNuevas' | 'servicioEducativo' | 'estadoEstablecimiento' | 'confirmarInterrupcionTotal'>
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  RECORRIDO_INICIAL,
  consecuenciasActivas,
  construirEnvio,
  ordenarSituaciones,
  responder,
  situacionConMismoMotivo,
  situacionesSinRespuesta,
  type SituacionRecorrido,
} from './recorrido-actualizacion'

const inundacion: SituacionRecorrido = { id: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Crítica', rigeDesde: '2026-10-02T10:00:00.000Z', creadaEn: '2026-10-02T10:00:00.000Z', causadaPorId: null }
const luz: SituacionRecorrido = { id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a' }
const situaciones = [luz, inundacion]

describe('recorrido de actualización', () => {
  it('ordena por relevancia', () => {
    expect(ordenarSituaciones(situaciones, 'habitual').map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('exige responder todas las situaciones activas', () => {
    const e = responder(RECORRIDO_INICIAL, 'a', { tipo: 'sigue' })
    expect(situacionesSinRespuesta(situaciones, e)).toEqual(['b'])
  })

  it('las consecuencias activas de una causa son sus hijas no solucionadas', () => {
    expect(consecuenciasActivas(situaciones, 'a', RECORRIDO_INICIAL).map((s) => s.id)).toEqual(['b'])
    const e = responder(RECORRIDO_INICIAL, 'b', { tipo: 'solucionada', solucionadaEn: '2026-10-04T12:00:00.000Z' })
    expect(consecuenciasActivas(situaciones, 'a', e)).toEqual([])
  })

  it('detecta una situación activa con el mismo motivo, salvo que ya se haya solucionado en este recorrido', () => {
    expect(situacionConMismoMotivo(situaciones, 'Sin energía o agua', RECORRIDO_INICIAL)?.id).toBe('b')
    const e = responder(RECORRIDO_INICIAL, 'b', { tipo: 'solucionada', solucionadaEn: '2026-10-04T12:00:00.000Z' })
    expect(situacionConMismoMotivo(situaciones, 'Sin energía o agua', e)).toBeNull()
  })

  it('arma un único envío con todas las respuestas', () => {
    let e = responder(RECORRIDO_INICIAL, 'a', { tipo: 'solucionada', solucionadaEn: '2026-10-04T12:00:00.000Z' })
    e = responder(e, 'b', { tipo: 'cambio', cambio: { aspectos: ['gravedad'], severidad: 'Alta' } })
    e = { ...e, nueva: { causadaPorId: 'a', motivo: 'Tormenta severa', severidad: 'Alta', secciones: [10] } }
    expect(construirEnvio(situaciones, e)).toEqual({
      afectacionesConfirmadas: [],
      afectacionesModificadas: [{ id: 'b', severidad: 'Alta' }],
      afectacionesSolucionadas: [{ id: 'a', solucionadaEn: '2026-10-04T12:00:00.000Z' }],
      afectacionesNuevas: [{ motivo: 'Tormenta severa', severidad: 'Alta', secciones: [10], causadaPorId: 'a' }],
      servicioEducativo: undefined,
      estadoEstablecimiento: undefined,
      confirmarInterrupcionTotal: undefined,
    })
  })

  it('un cambio sólo de gravedad no manda alcance, y uno de alcance no manda gravedad', () => {
    let e = responder(RECORRIDO_INICIAL, 'a', { tipo: 'cambio', cambio: { aspectos: ['alcance'], secciones: [10, 20] } })
    e = responder(e, 'b', { tipo: 'sigue' })
    expect(construirEnvio(situaciones, e).afectacionesModificadas).toEqual([{ id: 'a', secciones: [10, 20] }])
    expect(construirEnvio(situaciones, e).afectacionesConfirmadas).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
import type { CategoriaAfectacion } from '../categorias'
import type { JustificacionCritica } from '../justificacion-critica'
import { compararRelevancia } from '../relevancia'
import type { EstadoEstablecimiento } from '../trayectoria-tipos'
import type { Severidad } from '../validacion'
import type { ParteActualizacionInput } from '../validacion-trayectoria'

// Spec rediseño §6.2: el recorrido guiado es una máquina de respuestas sin UI.
// Toda decisión (qué falta, qué preguntar en cascada, qué mandar) vive acá,
// testeada; los componentes sólo muestran y recogen respuestas.

export type AspectoCambio = 'gravedad' | 'alcance' | 'clases-edificio'

export interface CambioSituacion {
  aspectos: AspectoCambio[]
  severidad?: Severidad
  justificacionCritica?: JustificacionCritica
  justificacionCriticaDetalle?: string
  secciones?: number[]
  alumnos?: number[]
}

export type RespuestaSituacion =
  | { tipo: 'sigue' }
  | { tipo: 'cambio'; cambio: CambioSituacion }
  | { tipo: 'solucionada'; solucionadaEn: string }

export interface SituacionRecorrido {
  id: string
  motivo: string
  categoria: CategoriaAfectacion
  severidad: Severidad
  rigeDesde: string
  creadaEn: string
  causadaPorId: string | null
}

export interface NuevaSituacion {
  causadaPorId: string | null
  motivo: string
  severidad: Severidad
  justificacionCritica?: JustificacionCritica
  justificacionCriticaDetalle?: string
  secciones: number[]
  alumnos?: number[]
  descripcion?: string
}

export interface EstadoRecorrido {
  respuestas: Record<string, RespuestaSituacion>
  nueva: NuevaSituacion | null
  clasesEdificio: {
    servicioEstado: 'normal' | 'suspendido'
    estadoEstablecimiento: EstadoEstablecimiento
    confirmarInterrupcionTotal: boolean
  } | null
}

export const RECORRIDO_INICIAL: EstadoRecorrido = { respuestas: {}, nueva: null, clasesEdificio: null }

export function ordenarSituaciones(situaciones: SituacionRecorrido[], estadoEstablecimiento: EstadoEstablecimiento): SituacionRecorrido[] {
  return [...situaciones].sort((a, b) =>
    compararRelevancia({ ...a, estadoEstablecimiento }, { ...b, estadoEstablecimiento }),
  )
}

export function situacionesSinRespuesta(situaciones: SituacionRecorrido[], estado: EstadoRecorrido): string[] {
  return situaciones.filter((s) => !estado.respuestas[s.id]).map((s) => s.id)
}

function solucionada(estado: EstadoRecorrido, id: string): boolean {
  return estado.respuestas[id]?.tipo === 'solucionada'
}

export function consecuenciasActivas(situaciones: SituacionRecorrido[], causaId: string, estado: EstadoRecorrido): SituacionRecorrido[] {
  return situaciones.filter((s) => s.causadaPorId === causaId && !solucionada(estado, s.id))
}

export function situacionConMismoMotivo(situaciones: SituacionRecorrido[], motivo: string, estado: EstadoRecorrido): SituacionRecorrido | null {
  return situaciones.find((s) => s.motivo === motivo && !solucionada(estado, s.id)) ?? null
}

export function responder(estado: EstadoRecorrido, id: string, respuesta: RespuestaSituacion): EstadoRecorrido {
  return { ...estado, respuestas: { ...estado.respuestas, [id]: respuesta } }
}

type Envio = Pick<
  ParteActualizacionInput,
  | 'afectacionesConfirmadas'
  | 'afectacionesModificadas'
  | 'afectacionesSolucionadas'
  | 'afectacionesNuevas'
  | 'servicioEducativo'
  | 'estadoEstablecimiento'
  | 'confirmarInterrupcionTotal'
>

export function construirEnvio(situaciones: SituacionRecorrido[], estado: EstadoRecorrido): Envio {
  const confirmadas: string[] = []
  const modificadas: Envio['afectacionesModificadas'] = []
  const solucionadas: Envio['afectacionesSolucionadas'] = []

  for (const s of situaciones) {
    const r = estado.respuestas[s.id]
    if (!r) continue
    if (r.tipo === 'sigue') confirmadas.push(s.id)
    else if (r.tipo === 'solucionada') solucionadas.push({ id: s.id, solucionadaEn: r.solucionadaEn })
    else {
      const m: Envio['afectacionesModificadas'][number] = { id: s.id }
      if (r.cambio.aspectos.includes('gravedad') && r.cambio.severidad) {
        m.severidad = r.cambio.severidad
        if (r.cambio.justificacionCritica) m.justificacionCritica = r.cambio.justificacionCritica
        if (r.cambio.justificacionCriticaDetalle) m.justificacionCriticaDetalle = r.cambio.justificacionCriticaDetalle
      }
      if (r.cambio.aspectos.includes('alcance')) {
        if (r.cambio.secciones) m.secciones = r.cambio.secciones
        if (r.cambio.alumnos) m.alumnos = r.cambio.alumnos
      }
      if (Object.keys(m).length > 1) modificadas.push(m)
      else confirmadas.push(s.id) // "Cambió" sólo en clases/edificio: la situación en sí sigue igual
    }
  }

  const nuevas: Envio['afectacionesNuevas'] = []
  if (estado.nueva) {
    const { causadaPorId, ...resto } = estado.nueva
    nuevas.push({ ...resto, ...(causadaPorId ? { causadaPorId } : {}) })
  }

  const ce = estado.clasesEdificio
  return {
    afectacionesConfirmadas: confirmadas,
    afectacionesModificadas: modificadas,
    afectacionesSolucionadas: solucionadas,
    afectacionesNuevas: nuevas,
    servicioEducativo: ce ? { estado: ce.servicioEstado, alcance: { tipo: 'establecimiento' } } : undefined,
    estadoEstablecimiento: ce ? { estado: ce.estadoEstablecimiento } : undefined,
    confirmarInterrupcionTotal: ce ? ce.confirmarInterrupcionTotal || undefined : undefined,
  }
}
```

`toEqual` ignora las propiedades con valor `undefined`, así que el test de "arma un único envío" pasa con las claves `undefined` explícitas. `ParteActualizacionInput['afectacionesNuevas'][number]` exige `descripcion` opcional y los campos de Tasks 6–7: el tipo debe compilar sin casts.

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/infraestructura/parte/recorrido-actualizacion.ts lib/infraestructura/parte/recorrido-actualizacion.test.ts
git commit -m "feat(parte): lógica pura del recorrido guiado de actualización"
```

### Task 23: Línea de tiempo

**Files:**
- Create: `components/infraestructura/linea-de-tiempo.tsx`, `components/infraestructura/linea-de-tiempo.test.tsx`
- Modify: `app/api/problematicas/parte/historial/route.ts` (agregar `severidad` por movimiento), `components/infraestructura/historial-movimiento.tsx` (tipo `MovimientoHistorial.severidad?: Severidad | null`), `components/infraestructura/historial-parte.tsx` (~142: la lista pasa a `LineaDeTiempo`)
- Test: `app/api/problematicas/parte/historial/route.test.ts`

**Interfaces:**
- Consumes: `colorSeveridad` (`lib/infraestructura/severidad.ts`).
- Produces:

```ts
export function severidadDelMovimiento(resumen: DiffParte): Severidad | null // máx. entre agregadas.severidad y severidadesCambiadas.a; null si ninguna
export function agruparPorDia(movimientos: MovimientoHistorial[], ahora?: Date): Array<{ dia: string; movimientos: MovimientoHistorial[] }> // dia: 'Hoy, sáb 04/10' | 'Ayer, vie 03/10' | 'jue 02/10'
export function LineaDeTiempo(props: { movimientos: MovimientoHistorial[]; limite?: number }): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

`linea-de-tiempo.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LineaDeTiempo, agruparPorDia } from './linea-de-tiempo'
import type { MovimientoHistorial } from './historial-movimiento'

const AHORA = new Date('2026-10-04T18:00:00.000Z')
const mov = (id: string, creadaEn: string, cambios: string[], severidad: MovimientoHistorial['severidad'] = null): MovimientoHistorial => ({
  id, tipo: 'actualizacion', rol: 'director', creadaEn, rigeDesde: creadaEn, cambios, severidad,
})
const movimientos = [
  mov('3', '2026-10-04T13:42:00.000Z', ['Se agregó "Evacuación preventiva" · Severidad Crítica'], 'Crítica'),
  mov('2', '2026-10-04T12:15:00.000Z', ['Sigue igual: "Inundación"']),
  mov('1', '2026-10-02T11:00:00.000Z', ['Se inició el reporte por "Inundación"'], 'Crítica'),
]

describe('agruparPorDia', () => {
  it('agrupa por día local con "Hoy" y "Ayer"', () => {
    expect(agruparPorDia(movimientos, AHORA).map((g) => g.dia)).toEqual(['Hoy, sáb 04/10', 'jue 02/10'])
  })
})

describe('LineaDeTiempo', () => {
  it('con límite muestra las últimas N y pliega el resto', () => {
    render(<LineaDeTiempo movimientos={movimientos} limite={2} />)
    expect(screen.getByText('Sigue igual: "Inundación"')).toBeInTheDocument()
    expect(screen.queryByText('Se inició el reporte por "Inundación"')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver 1 movimiento anterior' }))
    expect(screen.getByText('Se inició el reporte por "Inundación"')).toBeInTheDocument()
  })
  it('muestra la hora de cada entrada', () => {
    render(<LineaDeTiempo movimientos={movimientos} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByText(/^\d{2}:\d{2}$/)).toHaveLength(3)
  })
})
```

Correr con `TZ=America/Argentina/Buenos_Aires` si `vitest.config.ts` no la fija (verificar; si no, formatear en el componente con `timeZone: 'America/Argentina/Buenos_Aires'`, como hace `estado-actual-textos.ts` con `ZONA_HORARIA`, y entonces el test es determinista).

`historial/route.test.ts`: un movimiento con agregada Crítica devuelve `severidad: 'Crítica'`; una confirmación devuelve `severidad: null`.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** `linea-de-tiempo.tsx`

```tsx
'use client'

import { useState, type JSX } from 'react'
import type { DiffParte } from '@/lib/infraestructura/movimiento-diff'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { SEVERIDADES, type Severidad } from '@/lib/infraestructura/validacion'
import type { MovimientoHistorial } from './historial-movimiento'

const ZONA = 'America/Argentina/Buenos_Aires'
const fmtDia = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'short', day: '2-digit', month: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false })
const fmtClave = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' })

export function severidadDelMovimiento(resumen: DiffParte): Severidad | null {
  const candidatas = [
    ...resumen.afectacionesAgregadas.map((a) => a.severidad),
    ...resumen.severidadesCambiadas.map((c) => c.a),
  ]
  if (candidatas.length === 0) return null
  return candidatas.reduce((peor, s) => (SEVERIDADES.indexOf(s) > SEVERIDADES.indexOf(peor) ? s : peor))
}

function etiquetaDia(fecha: Date, ahora: Date): string {
  const clave = fmtClave.format(fecha)
  const texto = fmtDia.format(fecha).replace(',', '').replace('.', '')
  if (clave === fmtClave.format(ahora)) return `Hoy, ${texto}`
  if (clave === fmtClave.format(new Date(ahora.getTime() - 86_400_000))) return `Ayer, ${texto}`
  return texto
}

export function agruparPorDia(movimientos: MovimientoHistorial[], ahora: Date = new Date()) {
  const grupos: Array<{ dia: string; movimientos: MovimientoHistorial[] }> = []
  const ordenados = [...movimientos].sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
  for (const m of ordenados) {
    const dia = etiquetaDia(new Date(m.creadaEn), ahora)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.dia === dia) ultimo.movimientos.push(m)
    else grupos.push({ dia, movimientos: [m] })
  }
  return grupos
}

// Spec rediseño §6.5: lo más nuevo arriba, agrupado por día, con la hora de
// cada carga y un punto del color de la gravedad involucrada.
export function LineaDeTiempo({ movimientos, limite }: { movimientos: MovimientoHistorial[]; limite?: number }): JSX.Element {
  const [expandida, setExpandida] = useState(false)
  const ordenados = [...movimientos].sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
  const visibles = limite !== undefined && !expandida ? ordenados.slice(0, limite) : ordenados
  const ocultos = ordenados.length - visibles.length

  return (
    <div className="linea-de-tiempo">
      {agruparPorDia(visibles).map((grupo) => (
        <section key={grupo.dia}>
          <h3 className="linea-de-tiempo__dia">{grupo.dia}</h3>
          <ol className="linea-de-tiempo__lista">
            {grupo.movimientos.map((m) => (
              <li key={m.id} className="linea-de-tiempo__entrada">
                <span className="linea-de-tiempo__punto" aria-hidden="true" style={{ background: m.severidad ? colorSeveridad(m.severidad) : 'var(--line)' }} />
                <time dateTime={m.creadaEn} className="linea-de-tiempo__hora">{fmtHora.format(new Date(m.creadaEn))}</time>
                <ul className="linea-de-tiempo__cambios">
                  {m.cambios.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {ocultos > 0 ? (
        <button type="button" className="linea-de-tiempo__mas" onClick={() => setExpandida(true)}>
          {ocultos === 1 ? 'Ver 1 movimiento anterior' : `Ver ${ocultos} movimientos anteriores`}
        </button>
      ) : null}
    </div>
  )
}
```

Ojo: `<ul>` de cambios anidado agrega `listitem`s; para que el test de "3 listitems" valga, renderizar los cambios como `<p>` por línea en vez de `<ul>/<li>`. CSS:

```css
.linea-de-tiempo__lista { list-style: none; margin: 0; padding: 0 0 0 var(--s-4); border-left: 2px solid var(--line); }
.linea-de-tiempo__entrada { position: relative; padding: 0 0 var(--s-3) var(--s-3); }
.linea-de-tiempo__punto { position: absolute; left: calc(-1 * var(--s-4) - 6px); top: 6px; width: 10px; height: 10px; border-radius: 50%; }
.linea-de-tiempo__dia { font-size: var(--t-small); text-transform: uppercase; color: var(--ink-soft); margin: var(--s-3) 0 var(--s-2); }
.linea-de-tiempo__hora { font-weight: 600; }
.linea-de-tiempo__mas { min-height: 44px; background: none; border: 0; color: var(--ink-soft); text-decoration: underline; }
```

`historial/route.ts`: al mapear cada movimiento, agregar `severidad: severidadDelMovimiento(fila.resumen as DiffParte)` (tolerar resúmenes viejos: si falta `afectacionesAgregadas` o `severidadesCambiadas`, tratarlos como `[]`). `historial-parte.tsx`: reemplazar el `<ol className="historial-lista">…</ol>` por `<LineaDeTiempo movimientos={movimientos} />`.

- [ ] **Step 4: Run** — `pnpm exec vitest run components/infraestructura/ app/api/problematicas/parte/ app/problematicas/parte/` → PASS (ajustar `historial-parte`/`historial` page tests que buscaban la lista vieja).

- [ ] **Step 5: Commit**

```bash
git add components/infraestructura/linea-de-tiempo.tsx components/infraestructura/linea-de-tiempo.test.tsx components/infraestructura/historial-movimiento.tsx components/infraestructura/historial-parte.tsx app/api/problematicas/parte/historial/ app/globals.css
git commit -m "feat(parte): historial como línea de tiempo agrupada por día"
```

### Task 24: Pantalla de entrada de "Actualizar"

**Files:**
- Create: `components/infraestructura/actualizar/entrada-actualizar.tsx`, `components/infraestructura/actualizar/entrada-actualizar.test.tsx`

**Interfaces:**
- Consumes: `situacionPrincipal` (Task 10), `ordenarSituaciones`, `SituacionRecorrido` (Task 22), `LineaDeTiempo` (Task 23), `EstadoActualSeveridad`, `ETIQUETA_ESTABLECIMIENTO`, `ETIQUETA_SERVICIO`.
- Produces:

```ts
export interface EntradaActualizarProps {
  situaciones: SituacionRecorrido[]
  estadoEstablecimiento: EstadoEstablecimiento
  estadoServicio: EstadoServicioGeneral
  ultimaCarga: { creadaEn: string; cambios: string[] } | null
  historial: MovimientoHistorial[]
  onActualizar: () => void
}
export function EntradaActualizar(props: EntradaActualizarProps): JSX.Element
```

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EntradaActualizar } from './entrada-actualizar'

const situaciones = [
  { id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento' as const, severidad: 'Media' as const, rigeDesde: '2026-09-30T11:05:00.000Z', creadaEn: '2026-09-30T11:05:00.000Z', causadaPorId: null },
  { id: 'a', motivo: 'Evacuación preventiva', categoria: 'establecimiento' as const, severidad: 'Crítica' as const, rigeDesde: '2026-10-04T12:15:00.000Z', creadaEn: '2026-10-04T12:15:00.000Z', causadaPorId: null },
]

describe('EntradaActualizar', () => {
  it('muestra la última carga con hora, la principal destacada y las demás en orden', () => {
    render(
      <EntradaActualizar
        situaciones={situaciones}
        estadoEstablecimiento="evacuado"
        estadoServicio="suspendido"
        ultimaCarga={{ creadaEn: '2026-10-04T13:42:00.000Z', cambios: ['Se agregó "Evacuación preventiva" · Severidad Crítica'] }}
        historial={[]}
        onActualizar={() => {}}
      />,
    )
    expect(screen.getByText(/Su última carga/)).toHaveTextContent('10:42')
    const principal = screen.getByRole('region', { name: 'Situación principal' })
    expect(within(principal).getByText('Evacuación preventiva')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'También activas' })).getByText('Sin energía o agua')).toBeInTheDocument()
  })

  it('el botón principal inicia el recorrido', () => {
    const onActualizar = vi.fn()
    render(<EntradaActualizar situaciones={situaciones} estadoEstablecimiento="habitual" estadoServicio="normal" ultimaCarga={null} historial={[]} onActualizar={onActualizar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar situación' }))
    expect(onActualizar).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```tsx
'use client'

import type { JSX } from 'react'
import { Button } from '@/components/ui/button'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { ETIQUETA_ESTABLECIMIENTO, ETIQUETA_SERVICIO } from '@/components/infraestructura/estado-actual-textos'
import { LineaDeTiempo } from '@/components/infraestructura/linea-de-tiempo'
import type { MovimientoHistorial } from '@/components/infraestructura/historial-movimiento'
import { ordenarSituaciones, type SituacionRecorrido } from '@/lib/infraestructura/parte/recorrido-actualizacion'
import type { EstadoEstablecimiento, EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'

const ZONA = 'America/Argentina/Buenos_Aires'
const fmt = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

export interface EntradaActualizarProps {
  situaciones: SituacionRecorrido[]
  estadoEstablecimiento: EstadoEstablecimiento
  estadoServicio: EstadoServicioGeneral
  ultimaCarga: { creadaEn: string; cambios: string[] } | null
  historial: MovimientoHistorial[]
  onActualizar: () => void
}

// Layout A del spec rediseño §6.1: qué cargó por última vez, qué es lo más
// grave, qué más sigue activo y las dos últimas entradas del historial.
export function EntradaActualizar({ situaciones, estadoEstablecimiento, estadoServicio, ultimaCarga, historial, onActualizar }: EntradaActualizarProps): JSX.Element {
  const [principal, ...otras] = ordenarSituaciones(situaciones, estadoEstablecimiento)

  return (
    <div className="entrada-actualizar">
      {ultimaCarga ? (
        <p className="entrada-actualizar__ultima">
          Su última carga: <strong>{fmt.format(new Date(ultimaCarga.creadaEn))}</strong>
          {ultimaCarga.cambios[0] ? ` · ${ultimaCarga.cambios[0]}` : null}
        </p>
      ) : null}

      {principal ? (
        <section aria-label="Situación principal" className="entrada-actualizar__principal">
          <p className="entrada-actualizar__etiqueta">Situación principal</p>
          <p className="entrada-actualizar__motivo">
            <strong>{principal.motivo}</strong> <EstadoActualSeveridad severidad={principal.severidad} prefijo={false} />
          </p>
          <p className="entrada-actualizar__detalle">
            {`${ETIQUETA_ESTABLECIMIENTO[estadoEstablecimiento]} · ${ETIQUETA_SERVICIO[estadoServicio]} · desde ${fmt.format(new Date(principal.rigeDesde))}`}
          </p>
        </section>
      ) : null}

      {otras.length > 0 ? (
        <section aria-label="También activas" className="entrada-actualizar__otras">
          <p className="entrada-actualizar__etiqueta">También activas</p>
          <ul>
            {otras.map((s) => (
              <li key={s.id}>
                <span>{s.motivo}</span> <EstadoActualSeveridad severidad={s.severidad} prefijo={false} />
                <span className="entrada-actualizar__detalle">{` · desde ${fmt.format(new Date(s.rigeDesde))}`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Historial">
        <p className="entrada-actualizar__etiqueta">Historial</p>
        <LineaDeTiempo movimientos={historial} limite={2} />
      </section>

      <div className="asistente__acciones">
        <Button type="button" onClick={onActualizar}>Actualizar situación</Button>
      </div>
    </div>
  )
}
```

Verificar en `estado-actual-severidad.tsx` las props reales (`prefijo`, `marca`) antes de usarlas. CSS: `.entrada-actualizar__principal { border: 2px solid var(--sev-critica, currentColor); border-radius: var(--r-lg); padding: var(--s-4); }`, `.entrada-actualizar__etiqueta { font-size: var(--t-small); text-transform: uppercase; color: var(--ink-soft); }`, `.entrada-actualizar__ultima { background: var(--fill); border-radius: var(--r-sm); padding: var(--s-3); }`.

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Commit**

```bash
git add components/infraestructura/actualizar/entrada-actualizar.tsx components/infraestructura/actualizar/entrada-actualizar.test.tsx app/globals.css
git commit -m "feat(parte): pantalla de entrada de actualizar con situación principal y última carga"
```

### Task 25: Paso 1 — revisar cada situación activa

**Files:**
- Create: `components/infraestructura/actualizar/revisar-situacion.tsx`, `components/infraestructura/actualizar/revisar-situacion.test.tsx`

**Interfaces:**
- Consumes: `CampoGravedad`, `gravedadCompleta` (Task 13), `SelectorAlumnos` (16), `SelectorEstablecimiento` (17), `CamposClasesEdificio` (18), `VigenciaChips`, `resolverVigencia`, `VIGENCIA_AHORA` (12), `ConfirmSheet` (11), `RespuestaSituacion`, `CambioSituacion`, `AspectoCambio`, `SituacionRecorrido`, `consecuenciasActivas` (22).
- Produces:

```ts
export interface RevisarSituacionProps {
  situacion: SituacionRecorrido & { secciones: number[]; alumnos: number[] }
  turnos: TurnoContexto[]
  sugerida: Severidad | null
  respuesta: RespuestaSituacion | undefined
  consecuencias: SituacionRecorrido[]                 // activas causadas por ésta
  clasesEdificio: ValorClasesEdificio                 // valor vigente del parte
  onResponder: (respuesta: RespuestaSituacion) => void
  onCambiarClasesEdificio: (valor: ValorClasesEdificio & { confirmarInterrupcionTotal: boolean }) => void
  onCascada: (consecuenciaId: string, solucionadaEn: string) => void
  posicion: { actual: number; total: number }
}
export function RevisarSituacion(props: RevisarSituacionProps): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { RevisarSituacion, type RevisarSituacionProps } from './revisar-situacion'

const base = (over: Partial<RevisarSituacionProps> = {}): RevisarSituacionProps => ({
  situacion: { id: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Alta', rigeDesde: '2026-10-02T10:00:00.000Z', creadaEn: '2026-10-02T10:00:00.000Z', causadaPorId: null, secciones: [], alumnos: [] },
  turnos: TURNOS_FIXTURE,
  sugerida: 'Crítica',
  respuesta: undefined,
  consecuencias: [],
  clasesEdificio: { servicioEstado: 'normal', estadoEstablecimiento: 'habitual' },
  onResponder: vi.fn(),
  onCambiarClasesEdificio: vi.fn(),
  onCascada: vi.fn(),
  posicion: { actual: 1, total: 2 },
  ...over,
})

describe('RevisarSituacion', () => {
  it('"Sigue igual" responde de inmediato', () => {
    const p = base()
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    expect(p.onResponder).toHaveBeenCalledWith({ tipo: 'sigue' })
  })

  it('"Cambió" pregunta qué cambió y muestra sólo esos bloques', () => {
    const p = base()
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    const sheet = screen.getByRole('dialog')
    fireEvent.click(within(sheet).getByRole('checkbox', { name: 'La gravedad' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText('¿Qué tan grave es?')).toBeInTheDocument()
    expect(screen.queryByText('¿Hay clases?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Crítica' }))
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(p.onResponder).toHaveBeenCalledWith({ tipo: 'cambio', cambio: { aspectos: ['gravedad'], severidad: 'Crítica' } })
  })

  it('"Se solucionó" pide cuándo y después pregunta en cascada por cada consecuencia', () => {
    const p = base({ consecuencias: [{ id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a' }] })
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Se solucionó' }))
    expect(screen.getByText('¿Cuándo se solucionó?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(p.onResponder).toHaveBeenCalledWith({ tipo: 'solucionada', solucionadaEn: expect.any(String) })
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText(/Sin energía o agua \(causado por Inundación\)/)).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sí, también se solucionó' }))
    expect(p.onCascada).toHaveBeenCalledWith('b', expect.any(String))
  })

  it('en la cascada "No, sigue activo" no cierra la consecuencia', () => {
    const p = base({ consecuencias: [{ id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a' }] })
    render(<RevisarSituacion {...p} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Se solucionó' }))
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'No, sigue activo' }))
    expect(p.onCascada).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** `revisar-situacion.tsx`

Estructura (un componente con estado local de edición; nada se reporta hasta "Listo"):

```tsx
'use client'

import { useState, type JSX } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { CampoGravedad, gravedadCompleta, type ValorGravedad } from '@/components/infraestructura/campo-gravedad'
import { CamposClasesEdificio, type ValorClasesEdificio } from '@/components/infraestructura/campos-clases-edificio'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { SelectorAlumnos } from '@/components/infraestructura/selector-alumnos'
import { SelectorEstablecimiento, type ValorAlcanceEstablecimiento } from '@/components/infraestructura/selector-establecimiento'
import { VigenciaChips } from '@/components/infraestructura/vigencia-chips'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { AspectoCambio, CambioSituacion, RespuestaSituacion, SituacionRecorrido } from '@/lib/infraestructura/parte/recorrido-actualizacion'
import type { Severidad } from '@/lib/infraestructura/validacion'
import { VIGENCIA_AHORA, resolverVigencia, type EleccionVigencia } from '@/lib/infraestructura/vigencia-eleccion'

const ASPECTOS: Array<{ id: AspectoCambio; etiqueta: string }> = [
  { id: 'gravedad', etiqueta: 'La gravedad' },
  { id: 'alcance', etiqueta: 'A quién afecta (secciones / alumnos)' },
  { id: 'clases-edificio', etiqueta: 'Las clases o el edificio' },
]

type Modo = 'eligiendo' | 'cambio' | 'solucion'

export interface RevisarSituacionProps { /* ver Interfaces */ }

export function RevisarSituacion(p: RevisarSituacionProps): JSX.Element {
  const [modo, setModo] = useState<Modo>('eligiendo')
  const [preguntandoAspectos, setPreguntandoAspectos] = useState(false)
  const [aspectos, setAspectos] = useState<AspectoCambio[]>([])
  const [gravedad, setGravedad] = useState<ValorGravedad>({ severidad: p.situacion.severidad, justificacionCritica: '', justificacionCriticaDetalle: '' })
  const [alcance, setAlcance] = useState<{ secciones: number[]; alumnos: number[]; alcanceEstablecimiento: ValorAlcanceEstablecimiento['alcance'] }>({
    secciones: p.situacion.secciones, alumnos: p.situacion.alumnos, alcanceEstablecimiento: 'algunas',
  })
  const [clases, setClases] = useState<ValorClasesEdificio>(p.clasesEdificio)
  const [interrumpeTodo, setInterrumpeTodo] = useState(false)
  const [cuando, setCuando] = useState<EleccionVigencia>(VIGENCIA_AHORA)
  const [cascada, setCascada] = useState<{ pendientes: SituacionRecorrido[]; solucionadaEn: string } | null>(null)

  function elegir(tipo: 'sigue' | 'cambio' | 'solucionada') {
    if (tipo === 'sigue') { setModo('eligiendo'); p.onResponder({ tipo: 'sigue' }); return }
    if (tipo === 'cambio') { setPreguntandoAspectos(true); return }
    setModo('solucion')
  }

  function listoCambio() {
    const cambio: CambioSituacion = { aspectos }
    if (aspectos.includes('gravedad') && gravedad.severidad !== '') {
      cambio.severidad = gravedad.severidad
      if (gravedad.justificacionCritica) cambio.justificacionCritica = gravedad.justificacionCritica
      if (gravedad.justificacionCriticaDetalle) cambio.justificacionCriticaDetalle = gravedad.justificacionCriticaDetalle
    }
    if (aspectos.includes('alcance')) {
      cambio.secciones = alcance.secciones
      if (p.situacion.categoria === 'alumnos') cambio.alumnos = alcance.alumnos
    }
    if (aspectos.includes('clases-edificio')) p.onCambiarClasesEdificio({ ...clases, confirmarInterrupcionTotal: interrumpeTodo })
    p.onResponder({ tipo: 'cambio', cambio })
    setModo('eligiendo')
  }

  function listoSolucion() {
    const solucionadaEn = resolverVigencia(cuando)
    if (!solucionadaEn) return
    p.onResponder({ tipo: 'solucionada', solucionadaEn })
    if (p.consecuencias.length > 0) setCascada({ pendientes: p.consecuencias, solucionadaEn })
    setModo('eligiendo')
  }

  const actual = cascada?.pendientes[0]
  const tipoRespondido = p.respuesta?.tipo
  const cambioListo = aspectos.length > 0 && (!aspectos.includes('gravedad') || gravedadCompleta(gravedad, p.sugerida))

  return (
    <section className="revisar-situacion" aria-label={`Situación ${p.posicion.actual} de ${p.posicion.total}`}>
      <p className="asistente__contador">{`Lo que ya reportó · ${p.posicion.actual} de ${p.posicion.total}`}</p>
      <h3>{p.situacion.motivo} <EstadoActualSeveridad severidad={p.situacion.severidad} prefijo={false} /></h3>

      <fieldset className="afectacion-campos__grupo">
        <legend className="afectacion-campos__legend">¿Cómo sigue?</legend>
        {(['sigue', 'cambio', 'solucionada'] as const).map((t) => (
          <label key={t} className="opcion-radio opcion-radio--compacta">
            <input type="radio" name={`revisar-${p.situacion.id}`} checked={tipoRespondido === t || (modo === 'solucion' && t === 'solucionada') || (modo === 'cambio' && t === 'cambio')} onChange={() => elegir(t)} />
            <span className="opcion-radio__titulo">{t === 'sigue' ? 'Sigue igual' : t === 'cambio' ? 'Cambió' : 'Se solucionó'}</span>
          </label>
        ))}
      </fieldset>

      {modo === 'cambio' && (
        <div className="revisar-situacion__bloques">
          {aspectos.includes('gravedad') && (
            <CampoGravedad idPrefijo={`rev-${p.situacion.id}`} categoria={p.situacion.categoria} sugerida={p.sugerida} valor={gravedad} onCambiar={setGravedad} />
          )}
          {aspectos.includes('alcance') && (p.situacion.categoria === 'alumnos'
            ? <SelectorAlumnos turnos={p.turnos} alumnosSeleccionados={alcance.alumnos} onCambiar={(secciones, alumnos) => setAlcance((a) => ({ ...a, secciones, alumnos }))} />
            : <SelectorEstablecimiento turnos={p.turnos} valor={{ alcance: alcance.alcanceEstablecimiento, secciones: alcance.secciones }} onCambiar={(v) => setAlcance((a) => ({ ...a, alcanceEstablecimiento: v.alcance, secciones: v.secciones }))} />)}
          {aspectos.includes('clases-edificio') && (
            <CamposClasesEdificio valor={clases} onCambiar={setClases} alcanceParcial={alcance.alcanceEstablecimiento !== 'toda'} onInterrumpirTodaLaEscuela={() => setInterrumpeTodo(true)} />
          )}
          <div className="asistente__acciones">
            <Button type="button" onClick={listoCambio} disabled={!cambioListo}>Listo</Button>
          </div>
        </div>
      )}

      {modo === 'solucion' && (
        <div className="revisar-situacion__bloques">
          <VigenciaChips value={cuando} onChange={setCuando} label="¿Cuándo se solucionó?" />
          <div className="asistente__acciones">
            <Button type="button" onClick={listoSolucion}>Listo</Button>
          </div>
        </div>
      )}

      <ConfirmSheet
        open={preguntandoAspectos}
        titulo={`¿Qué cambió en ${p.situacion.motivo}?`}
        confirmarLabel="Continuar"
        confirmarDeshabilitado={aspectos.length === 0}
        onCancelar={() => setPreguntandoAspectos(false)}
        onConfirmar={() => { setPreguntandoAspectos(false); setModo('cambio') }}
      >
        {ASPECTOS.map((a) => (
          <Checkbox key={a.id} label={a.etiqueta} checked={aspectos.includes(a.id)} onCheckedChange={(c: boolean) => setAspectos((x) => (c ? [...x, a.id] : x.filter((y) => y !== a.id)))} />
        ))}
      </ConfirmSheet>

      <ConfirmSheet
        open={actual !== undefined}
        titulo={`${p.situacion.motivo} se solucionó`}
        confirmarLabel="Sí, también se solucionó"
        cancelarLabel="No, sigue activo"
        onCancelar={() => setCascada((c) => (c ? { ...c, pendientes: c.pendientes.slice(1) } : null))}
        onConfirmar={() => {
          if (actual && cascada) p.onCascada(actual.id, cascada.solucionadaEn)
          setCascada((c) => (c ? { ...c, pendientes: c.pendientes.slice(1) } : null))
        }}
      >
        <p>{actual ? `${actual.motivo} (causado por ${p.situacion.motivo}), ¿también?` : null}</p>
      </ConfirmSheet>
    </section>
  )
}
```

`RevisarSituacionProps` se declara exactamente como en **Interfaces** (importando `TurnoContexto`, `Severidad`, `ValorClasesEdificio`). La recursión de la cascada (consecuencias de la consecuencia) la resuelve el contenedor (Task 26): `onCascada` responde `solucionada` para esa consecuencia y, si ella tiene a su vez consecuencias activas, el contenedor encola otra `RevisarSituacion`-cascada mostrando el mismo sheet. Ajustar `alcanceEstablecimiento` inicial a `'toda'` si `p.situacion.secciones` cubre todas las secciones de `turnos`.

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Commit**

```bash
git add components/infraestructura/actualizar/revisar-situacion.tsx components/infraestructura/actualizar/revisar-situacion.test.tsx
git commit -m "feat(parte): revisar cada situación activa con sigue, cambió o se solucionó"
```

### Task 26: Paso 2, contenedor del recorrido y reemplazo del formulario viejo

**Files:**
- Create: `components/infraestructura/actualizar/algo-nuevo.tsx`, `components/infraestructura/actualizar/recorrido-actualizacion.tsx`, `components/infraestructura/actualizar/recorrido-actualizacion.test.tsx`
- Modify: `app/problematicas/parte/actualizar/page.tsx` (renderizar `RecorridoActualizacion`), `app/problematicas/parte/actualizar/page.test.tsx`
- Delete (tras confirmar con `rg` que nadie más los importa): `components/infraestructura/actualizacion-form.tsx`, `actualizacion-form.test.tsx`, `afectacion-borrador.tsx` (+ test si existe), `secciones-selector.tsx`, `secciones-selector.test.tsx`, `vigencia-field.tsx`, `vigencia-field.test.tsx`, `lib/infraestructura/actualizacion-parte.ts` (+ test) si queda sin importadores. La aprobación de este plan autoriza estas eliminaciones; cualquier otro archivo sin importadores se reporta, no se borra.

**Interfaces:**
- Consumes: todo lo de Tasks 11–25; `intentarEnviar`, `reenviarCola`, `esEstadoReintentable`, `programarReintento`, `MENSAJES_ESTADO` (Task 1); `crearBorradorStore` (`lib/infraestructura/parte/borrador-historial.ts`).
- Produces:

```ts
// algo-nuevo.tsx
export function AlgoNuevo(props: {
  candidatasCausa: Array<{ id: string; motivo: string; fecha: string; activa: boolean }>
  situacionesActivas: SituacionRecorrido[]
  estado: EstadoRecorrido
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
  onTerminar: (nueva: NuevaSituacion | null) => void
  onActualizarExistente: (id: string) => void // "Sigue igual: es la misma, quiero actualizarla"
  onSolucionarExistente: (id: string, solucionadaEn: string) => void
}): JSX.Element
// recorrido-actualizacion.tsx
export function RecorridoActualizacion(props: { cue: string; turnos: TurnoContexto[]; motivos: MotivoRow[] }): JSX.Element
```

- [ ] **Step 1: Write the failing integration test** (`recorrido-actualizacion.test.tsx`)

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOTIVOS_FIXTURE, TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { RecorridoActualizacion } from './recorrido-actualizacion'

const CUE = '1801605-41'
function estadoActual() {
  return {
    ok: true,
    periodo: { id: 'p', nombre: 'ENOS' },
    parte: { id: 'parte', cueAnexo: CUE, estadoEstablecimiento: 'habitual', estadoEstablecimientoRigeDesde: '2026-10-02T10:00:00.000Z', actualizadaEn: '2026-10-03T10:00:00.000Z' },
    servicio: { estadoGeneral: 'normal', alcanceVigente: [] },
    afectaciones: [
      { id: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Crítica', descripcion: null, rigeDesde: '2026-10-02T10:00:00.000Z', creadaEn: '2026-10-02T10:00:00.000Z', causadaPorId: null, secciones: [], totales: { secciones: 0, alumnos: 0 } },
      { id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', descripcion: null, rigeDesde: '2026-10-03T10:00:00.000Z', creadaEn: '2026-10-03T10:00:00.000Z', causadaPorId: 'a', secciones: [], totales: { secciones: 0, alumnos: 0 } },
    ],
    recientes: [],
    ultimaCarga: { creadaEn: '2026-10-03T10:00:00.000Z', cambios: ['Se agregó "Sin energía o agua" · Severidad Media'] },
  }
}

function stub(respuestaPost = { ok: true, movimientoId: 'm1' }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method !== 'POST') {
      const body = url.includes('/historial') ? { ok: true, movimientos: [] } : estadoActual()
      return new Response(JSON.stringify(body), { status: 200 })
    }
    return new Response(JSON.stringify(respuestaPost), { status: 201 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

describe('RecorridoActualizacion', () => {
  it('solucionar la causa pregunta por la consecuencia y envía un único POST', async () => {
    const fetchMock = stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar situación' }))

    // Paso 1: la principal (Inundación) primero.
    fireEvent.click(screen.getByRole('radio', { name: 'Se solucionó' }))
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, también se solucionó' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    // La consecuencia ya quedó respondida por la cascada: se saltea y va al paso 2.
    expect(screen.getByText('¿Pasó algo nuevo?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'No, nada nuevo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1))
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!
    const cuerpo = JSON.parse(init!.body as string)
    expect(cuerpo.afectacionesSolucionadas.map((s: { id: string }) => s.id).sort()).toEqual(['a', 'b'])
  })

  it('no deja pasar al paso 2 con situaciones sin responder', async () => {
    stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar situación' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Indique cómo sigue cada situación')
  })

  it('un problema nuevo siempre pregunta si es consecuencia de algo anterior', async () => {
    const fetchMock = stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar situación' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, hay un problema nuevo' }))
    expect(screen.getByText('¿Es consecuencia de algo anterior?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /De Inundación/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    elegirCategoriaEstablecimiento()
    fireEvent.click(screen.getByRole('radio', { name: 'Tormenta severa' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    const cuerpo = await cuerpoDelPost(fetchMock)
    expect(cuerpo.afectacionesNuevas[0]).toMatchObject({ motivo: 'Tormenta severa', severidad: 'Alta', causadaPorId: 'a' })
    expect(cuerpo.afectacionesConfirmadas.sort()).toEqual(['a', 'b'])
  })

  it('cargar un motivo igual a uno activo pregunta qué pasó con el anterior', async () => {
    const fetchMock = stub()
    render(<RecorridoActualizacion cue={CUE} turnos={TURNOS_FIXTURE} motivos={MOTIVOS_FIXTURE} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar situación' }))
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('radio', { name: 'Sigue igual' }))
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, hay un problema nuevo' }))
    fireEvent.click(screen.getByRole('radio', { name: 'No, es independiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    elegirCategoriaEstablecimiento()
    fireEvent.click(screen.getByRole('radio', { name: 'Sin energía o agua' }))

    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText(/Ya tiene activa "Sin energía o agua" desde el/)).toBeInTheDocument()
    expect(within(sheet).getByRole('radio', { name: 'Sigue igual: es la misma, quiero actualizarla' })).toBeInTheDocument()
    expect(within(sheet).getByRole('radio', { name: 'Se solucionó y esto es un problema nuevo' })).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Son dos problemas distintos a la vez' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continuar' }))

    fireEvent.click(screen.getByRole('radio', { name: 'Media' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Toda la escuela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    const cuerpo = await cuerpoDelPost(fetchMock)
    expect(cuerpo.afectacionesNuevas[0]).toMatchObject({ motivo: 'Sin energía o agua' })
    expect(cuerpo.afectacionesNuevas[0].causadaPorId).toBeUndefined()
    expect(cuerpo.afectacionesSolucionadas).toEqual([])
  })
})

function elegirCategoriaEstablecimiento() {
  fireEvent.click(screen.getByRole('radio', { name: /Afecta al establecimiento/ }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Continuar' }))
}

async function cuerpoDelPost(fetchMock: ReturnType<typeof vi.fn>) {
  await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'POST')).toBe(true))
  const [, init] = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'POST')!
  return JSON.parse((init as RequestInit).body as string)
}
```

Verificar los nombres reales de los fixtures de motivos y turnos en `components/test-utils/parte-formulario.ts` y que sus motivos incluyan "Tormenta severa" y "Sin energía o agua" con la categoría `establecimiento`; si no, agregarlos al fixture en este mismo commit.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement `algo-nuevo.tsx`**

Sub-pasos internos (estado local `etapa: 'pregunta' | 'causa' | 'datos'`):
1. `'pregunta'`: fieldset "¿Pasó algo nuevo?" con "No, nada nuevo" / "Sí, hay un problema nuevo". "No" → `onTerminar(null)` (el contenedor pasa a `'resumen'`, que tiene el botón "Enviar").
2. `'causa'` (se muestra en la misma pantalla apenas se elige "Sí, hay un problema nuevo"): fieldset "¿Es consecuencia de algo anterior?" con un radio por `candidatasCausa` (`De ${motivo} (${fecha})`, activas primero, luego recientes) y "No, es independiente". Guarda `causadaPorId`. Botón "Siguiente" (deshabilitado hasta elegir) pasa a `'datos'`.
3. `'datos'`: reutiliza `CamposQuePaso` (categoría con sheet, motivo, `CampoGravedad`), `CamposAQuienAfecta` (selector por categoría) y `VigenciaChips`. Al elegir motivo, si `situacionConMismoMotivo(situacionesActivas, motivo, estado)` devuelve una situación, abrir `ConfirmSheet` "Ya tiene activa \"{motivo}\" desde el {fecha}. ¿Qué pasó con esa?" con tres radios dentro del cuerpo y confirmar:
   - "Sigue igual: es la misma, quiero actualizarla" → `onActualizarExistente(id)` (el contenedor vuelve al paso 1 sobre esa situación con modo "Cambió").
   - "Se solucionó y esto es un problema nuevo" → muestra `VigenciaChips` "¿Cuándo se solucionó?" dentro del sheet; al confirmar `onSolucionarExistente(id, iso)` y sigue cargando la nueva.
   - "Son dos problemas distintos a la vez" → sigue cargando la nueva.
4. "Listo" construye `NuevaSituacion` (con `secciones`, `alumnos` si categoría alumnos, `justificacion*` si aplica) y llama `onTerminar(nueva)`. Validación: mismas reglas que `faltanteDelPaso` del wizard (Tasks 13, 16, 17).

- [ ] **Step 4: Implement `recorrido-actualizacion.tsx` (contenedor)**

- Carga en paralelo `GET /api/problematicas/parte?cue=` y `GET /api/problematicas/parte/historial?cue=` (mismo manejo de errores que `obtenerEstado` del formulario viejo: 401 → `MENSAJE_ACCESO_VENCIDO`, 503 → `MENSAJE_SIN_CORTE`, otro → `MENSAJE_ERROR_LECTURA`; sin parte → `MENSAJE_SIN_SITUACION`).
- Mapea `afectaciones` a `SituacionRecorrido & { secciones: number[]; alumnos: number[] }` (secciones = `a.secciones.map((s) => s.geSectionId)`; alumnos = los de secciones con `seccionCompleta === false`).
- Estado: `etapa: 'entrada' | { revisar: number } | 'nuevo' | 'resumen' | 'enviado'`, `recorrido: EstadoRecorrido` (con `responder`), `error`.
- `'entrada'` → `EntradaActualizar` (`onActualizar` → `{ revisar: 0 }`).
- `{ revisar: i }` → `RevisarSituacion` con la i-ésima de `ordenarSituaciones`, `consecuencias={consecuenciasActivas(sit, id, recorrido)}`, `onCascada={(cid, iso) => { setRecorrido((r) => responder(r, cid, { tipo: 'solucionada', solucionadaEn: iso })); encolarCascada(cid, iso) }}` donde `encolarCascada` agrega a una cola local las `consecuenciasActivas` de `cid` para mostrarlas con el mismo `ConfirmSheet` de cascada (componente `CascadaPendiente`, mismo markup que en Task 25). Botones "Atrás" / "Siguiente"; "Siguiente" en la última o con todas respondidas → `'nuevo'`; si quedan sin respuesta (`situacionesSinRespuesta`), `setError('Indique cómo sigue cada situación antes de continuar.')`. Las ya solucionadas por cascada se saltean al avanzar.
- `'nuevo'` → `AlgoNuevo` con `candidatasCausa` = activas (no solucionadas en este recorrido) + `recientes`. `onTerminar` guarda `recorrido.nueva` y pasa a `'resumen'`.
- `'resumen'` → lista legible (reutilizar `describirMovimiento` no aplica porque no hay diff: armar líneas desde `construirEnvio`: "Sigue igual: X", "Se solucionó X (hora)", "Cambió X: …", "Nuevo: X (causado por Y)") + botón "Enviar".
- Envío: `intentarEnviar({ cue, rigeDesde: new Date().toISOString(), ...construirEnvio(sit, recorrido) }, opcionesEnvio())` con `tipo: 'actualizacion'` y el mismo patrón de `opcionesEnvio`, indicador de estado y reintento (`esEstadoReintentable`, `programarReintento`, `reenviarCola`) que la Task 2. Éxito → `'enviado'` con el mensaje `MENSAJE_GUARDADO` del formulario viejo y los botones "Volver al panel" / "Registrar otra novedad" (este último recarga el estado).
- Borrador del recorrido: `crearBorradorStore` con clave `parte-actualizar:draft:<cue>` guardando `{ generacion, etapa, recorrido }`; al montar, si existe, banner "Tiene una actualización sin enviar. Puede continuar donde la dejó." con "Continuar donde lo dejé" / "Descartar" (mismo patrón que Task 19). Si las situaciones activas cambiaron desde que se guardó (ids distintos), descartar el borrador con aviso "La situación cambió desde que empezó; vuelva a revisarla."

`app/problematicas/parte/actualizar/page.tsx`: reemplazar `<ActualizacionForm …/>` por `<RecorridoActualizacion cue={escuela.cueAnexo} turnos={turnos} motivos={motivos} />`; actualizar `page.test.tsx` (mock del componente nuevo si el test lo mockeaba).

- [ ] **Step 5: Eliminar el formulario viejo**

```bash
rg -n "actualizacion-form|afectacion-borrador|secciones-selector|vigencia-field|actualizacion-parte" app components lib --glob '!*.test.*'
```

Expected: sólo referencias entre los propios archivos a eliminar. Entonces:

```bash
git rm components/infraestructura/actualizacion-form.tsx components/infraestructura/actualizacion-form.test.tsx components/infraestructura/afectacion-borrador.tsx components/infraestructura/secciones-selector.tsx components/infraestructura/secciones-selector.test.tsx components/infraestructura/vigencia-field.tsx components/infraestructura/vigencia-field.test.tsx
```

más `afectacion-borrador.test.tsx` y `lib/infraestructura/actualizacion-parte.ts` (+ test) si existen y quedaron sin importadores. Si algún otro módulo los importa, NO borrar ese archivo y reportarlo. Quitar del CSS las reglas `.secciones-selector__*` que ya no use nadie (`rg -n "secciones-selector" components` vacío) — `.secciones-selector__turno` lo reutilizan los selectores nuevos: mantenerla.

- [ ] **Step 6: Run** — `pnpm test && pnpm lint && pnpm build` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A components/infraestructura/actualizar app/problematicas/parte/actualizar app/globals.css
git commit -m "feat(parte): recorrido guiado de actualización en reemplazo del formulario único"
```

(Los `git rm` del Step 5 ya quedan en el índice y entran en este commit.)

---

## BATCH 5 — Fase 4: envío en segundo plano

### Task 27: Cola de envío en IndexedDB

**Files:**
- Create: `lib/infraestructura/parte/almacen-indexeddb.ts`, `lib/infraestructura/parte/almacen-indexeddb.test.ts`
- Modify: `lib/infraestructura/parte/envio-offline.ts` (`BorradorParte` gana `url?` y `cuerpo?`; `intentarEnviar` los persiste), `components/infraestructura/reporte-inicial-form.tsx`, `components/infraestructura/actualizar/recorrido-actualizacion.tsx` (usar `crearAlmacenParte()`)
- Modify: `package.json` (devDependency `fake-indexeddb`)

**Interfaces:**
- Produces:

```ts
export const NOMBRE_DB_PARTE = 'parte-offline'
export const STORE_PARTE = 'kv'
export function crearAlmacenIndexedDb(nombre?: string): AlmacenClaveValor
export async function crearAlmacenParte(): Promise<AlmacenClaveValor> // IndexedDB si existe (migrando claves 'parte:' de localStorage), si no localStorage
// BorradorParte<T> agrega: url?: string; cuerpo?: unknown
```

Por qué: el service worker (Task 28) no puede leer `localStorage`; la cola tiene que vivir en IndexedDB y guardar el cuerpo ya armado para poder reenviarlo sin el código del formulario.

- [ ] **Step 1: Install** — `pnpm add -D fake-indexeddb`.

- [ ] **Step 2: Write the failing tests**

```ts
// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { crearAlmacenIndexedDb, crearAlmacenParte } from './almacen-indexeddb'
import { crearAlmacenMemoria, intentarEnviar, leerBorrador } from './envio-offline'

beforeEach(() => localStorage.clear())

describe('crearAlmacenIndexedDb', () => {
  it('guarda, lee y elimina', async () => {
    const a = crearAlmacenIndexedDb(`t-${crypto.randomUUID()}`)
    await a.guardar('k', 'v')
    expect(await a.obtener('k')).toBe('v')
    await a.eliminar('k')
    expect(await a.obtener('k')).toBeNull()
  })
})

describe('crearAlmacenParte', () => {
  it('migra la cola de localStorage a IndexedDB una sola vez', async () => {
    localStorage.setItem('parte:nuevo:123', '{"x":1}')
    localStorage.setItem('otra-cosa', 'no se migra')
    const a = await crearAlmacenParte()
    expect(await a.obtener('parte:nuevo:123')).toBe('{"x":1}')
    expect(localStorage.getItem('parte:nuevo:123')).toBeNull()
    expect(localStorage.getItem('otra-cosa')).toBe('no se migra')
  })
})

describe('la cola guarda url y cuerpo listos para reenviar', () => {
  it('un envío fallido deja url y cuerpo en el borrador', async () => {
    const almacen = crearAlmacenMemoria()
    await intentarEnviar({ a: 1 }, {
      almacen, tipo: 'nuevo', cue: 'c', url: '/api/x',
      fetchImpl: async () => { throw new TypeError('offline') },
      construirCuerpo: (d, k) => ({ ...d, idempotencyKey: k }),
    })
    const b = await leerBorrador(almacen, 'nuevo', 'c')
    expect(b?.url).toBe('/api/x')
    expect(b?.cuerpo).toEqual({ a: 1, idempotencyKey: b?.idempotencyKey })
  })
})
```

- [ ] **Step 3: Run** — FAIL.

- [ ] **Step 4: Implement** `almacen-indexeddb.ts`

```ts
import { crearAlmacenNavegador, type AlmacenClaveValor } from './envio-offline'

export const NOMBRE_DB_PARTE = 'parte-offline'
export const STORE_PARTE = 'kv'
const PREFIJO_COLA = 'parte:'
const MARCA_MIGRACION = 'parte-offline:migrado'

function abrir(nombre: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(nombre, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_PARTE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function enStore<T>(db: IDBDatabase, modo: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = op(db.transaction(STORE_PARTE, modo).objectStore(STORE_PARTE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// La cola vive en IndexedDB para que el service worker (public/sw-parte.js)
// pueda leerla con la pestaña cerrada: localStorage no existe en un worker.
export function crearAlmacenIndexedDb(nombre: string = NOMBRE_DB_PARTE): AlmacenClaveValor {
  const db = abrir(nombre)
  return {
    async obtener(clave) {
      const v = await enStore(await db, 'readonly', (s) => s.get(clave))
      return typeof v === 'string' ? v : null
    },
    async guardar(clave, valor) {
      await enStore(await db, 'readwrite', (s) => s.put(valor, clave))
    },
    async eliminar(clave) {
      await enStore(await db, 'readwrite', (s) => s.delete(clave))
    },
  }
}

export async function crearAlmacenParte(): Promise<AlmacenClaveValor> {
  if (typeof indexedDB === 'undefined') return crearAlmacenNavegador()
  try {
    const almacen = crearAlmacenIndexedDb()
    if (typeof localStorage !== 'undefined' && localStorage.getItem(MARCA_MIGRACION) === null) {
      for (const clave of Object.keys(localStorage)) {
        if (!clave.startsWith(PREFIJO_COLA)) continue
        const valor = localStorage.getItem(clave)
        if (valor !== null) await almacen.guardar(clave, valor)
        localStorage.removeItem(clave)
      }
      localStorage.setItem(MARCA_MIGRACION, '1')
    }
    return almacen
  } catch {
    return crearAlmacenNavegador()
  }
}
```

`envio-offline.ts`: `BorradorParte<T>` agrega `url?: string` y `cuerpo?: unknown`. En `completarEnvio`, antes del `fetch`, calcular `cuerpo` (ya se hace) y en `registrarPendiente`/`registrarError` persistir `{ ...borrador, url: opciones.url, cuerpo }` (pasar `cuerpo` como parámetro nuevo de ambas funciones).

Formularios: hoy hacen `const almacenParte = crearAlmacenNavegador()` a nivel de módulo. Cambiar a un hook mínimo en cada uno:

```tsx
const almacenRef = useRef<Promise<AlmacenClaveValor> | null>(null)
function almacen(): Promise<AlmacenClaveValor> {
  almacenRef.current ??= crearAlmacenParte()
  return almacenRef.current
}
```

y `await almacen()` donde se usaba `almacenParte` para la **cola** (`intentarEnviar`, `reenviarCola`, `leerColaEnvio`). El borrador del wizard (`parte-nuevo:draft:` / `parte-actualizar:draft:`) sigue en `crearAlmacenNavegador()`: no lo necesita el service worker. Ajustar los tests del Batch 1 que sembraban la cola en `localStorage` para importar `fake-indexeddb/auto` y sembrar con `crearAlmacenParte()`.

- [ ] **Step 5: Run** — `pnpm exec vitest run lib/infraestructura/parte/ components/infraestructura/` → PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/infraestructura/parte/ components/infraestructura/reporte-inicial-form.tsx components/infraestructura/reporte-inicial-form.test.tsx components/infraestructura/actualizar/recorrido-actualizacion.tsx components/infraestructura/actualizar/recorrido-actualizacion.test.tsx
git commit -m "feat(parte): mover la cola de envío a IndexedDB con migración desde localStorage"
```

### Task 28: Background Sync con service worker

**Files:**
- Create: `public/sw-parte.js`, `lib/infraestructura/parte/sw-parte.test.ts`
- Create: `lib/infraestructura/parte/registrar-sync.ts`, `lib/infraestructura/parte/registrar-sync.test.ts`
- Modify: `components/infraestructura/reporte-inicial-form.tsx`, `components/infraestructura/actualizar/recorrido-actualizacion.tsx` (registrar SW al montar; pedir sync al quedar pendiente; escuchar el mensaje de envío completado)

**Interfaces:**
- Produces:

```ts
// public/sw-parte.js (JS plano; exporta para tests vía globalThis.__swParte)
procesarColaSync(abrirDb: () => Promise<IDBDatabase>, fetchImpl: typeof fetch): Promise<{ enviados: string[]; pendientes: string[] }>
// registrar-sync.ts
export const TAG_SYNC_PARTE = 'parte-envio'
export async function registrarServiceWorkerParte(): Promise<ServiceWorkerRegistration | null> // null si no hay soporte
export async function pedirSyncParte(): Promise<boolean> // true si se registró el sync; false → queda el reintento en primer plano
export function alEnviarEnSegundoPlano(callback: (clave: string) => void): () => void // escucha postMessage { tipo: 'parte-enviado', clave }
```

- [ ] **Step 1: Write the failing tests**

`sw-parte.test.ts`:

```ts
// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { crearAlmacenIndexedDb } from './almacen-indexeddb'

async function cargarSw() {
  const listeners: Record<string, (e: unknown) => void> = {}
  ;(globalThis as Record<string, unknown>).self = { addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f }, clients: { matchAll: async () => [] } }
  await import('../../../public/sw-parte.js')
  return (globalThis as unknown as { __swParte: { procesarColaSync: Function } }).__swParte
}

describe('sw-parte procesarColaSync', () => {
  it('reenvía sólo los pendientes y borra los que el servidor confirmó', async () => {
    const nombre = `sw-${crypto.randomUUID()}`
    const almacen = crearAlmacenIndexedDb(nombre)
    await almacen.guardar('parte:nuevo:1', JSON.stringify({ estado: 'pendiente-envio', url: '/api/problematicas/parte', cuerpo: { a: 1 } }))
    await almacen.guardar('parte:nuevo:2', JSON.stringify({ estado: 'error', url: '/api/problematicas/parte', cuerpo: { a: 2 } }))
    await almacen.guardar('parte:nuevo:3', JSON.stringify({ estado: 'error-servidor', url: '/api/problematicas/parte', cuerpo: { a: 3 } }))
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      const cuerpo = JSON.parse(init.body as string)
      return new Response(JSON.stringify(cuerpo.a === 1 ? { ok: true, movimientoId: 'm' } : { error: 'x' }), { status: cuerpo.a === 1 ? 201 : 503 })
    })
    const sw = await cargarSw()
    const abrir = () => new Promise<IDBDatabase>((res) => { const r = indexedDB.open(nombre, 1); r.onsuccess = () => res(r.result) })
    const r = await sw.procesarColaSync(abrir, fetchImpl)
    expect(r).toEqual({ enviados: ['parte:nuevo:1'], pendientes: ['parte:nuevo:3'] })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(await almacen.obtener('parte:nuevo:1')).toBeNull()
    expect(await almacen.obtener('parte:nuevo:2')).not.toBeNull()
  })
})
```

`registrar-sync.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pedirSyncParte, registrarServiceWorkerParte } from './registrar-sync'

afterEach(() => vi.unstubAllGlobals())

describe('registrar-sync', () => {
  it('sin serviceWorker devuelve null/false y no lanza', async () => {
    vi.stubGlobal('navigator', {})
    expect(await registrarServiceWorkerParte()).toBeNull()
    expect(await pedirSyncParte()).toBe(false)
  })
  it('sin SyncManager (Safari) no registra sync', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn(async () => ({})), ready: Promise.resolve({}) } })
    expect(await pedirSyncParte()).toBe(false)
  })
  it('con SyncManager registra el tag', async () => {
    const register = vi.fn(async () => {})
    vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn(async () => ({})), ready: Promise.resolve({ sync: { register } }) } })
    expect(await pedirSyncParte()).toBe(true)
    expect(register).toHaveBeenCalledWith('parte-envio')
  })
})
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** `public/sw-parte.js`

```js
// Service worker del parte (spec rediseño §7.4): reenvía la cola guardada en
// IndexedDB cuando el navegador recupera conectividad, aunque la pestaña esté
// cerrada. Sólo existe donde hay Background Sync; en el resto el reintento en
// primer plano del formulario sigue siendo el mecanismo.
const DB = 'parte-offline'
const STORE = 'kv'
const PREFIJO = 'parte:'
const REINTENTABLES = ['pendiente-envio', 'error-servidor']

function abrirDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function op(db, modo, fn) {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, modo).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function procesarColaSync(abrir, fetchImpl) {
  const db = await abrir()
  const claves = (await op(db, 'readonly', (s) => s.getAllKeys())).filter((k) => typeof k === 'string' && k.startsWith(PREFIJO))
  const enviados = []
  const pendientes = []
  for (const clave of claves) {
    let entrada
    try {
      entrada = JSON.parse(await op(db, 'readonly', (s) => s.get(clave)))
    } catch {
      continue
    }
    if (!entrada || !REINTENTABLES.includes(entrada.estado) || !entrada.url || entrada.cuerpo === undefined) continue
    try {
      const res = await fetchImpl(entrada.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entrada.cuerpo),
        credentials: 'same-origin',
      })
      const json = res.ok ? await res.json().catch(() => null) : null
      if (res.ok && json && json.ok === true && typeof json.movimientoId === 'string') {
        await op(db, 'readwrite', (s) => s.delete(clave))
        enviados.push(clave)
      } else {
        pendientes.push(clave)
      }
    } catch {
      pendientes.push(clave)
    }
  }
  return { enviados, pendientes }
}

self.addEventListener('sync', (evento) => {
  if (evento.tag !== 'parte-envio') return
  evento.waitUntil(
    procesarColaSync(abrirDb, fetch).then(async ({ enviados, pendientes }) => {
      const clientes = await self.clients.matchAll({ includeUncontrolled: true })
      for (const c of clientes) for (const clave of enviados) c.postMessage({ tipo: 'parte-enviado', clave })
      // Un pendiente hace fallar el sync para que el navegador lo reprograme.
      if (pendientes.length > 0) throw new Error('quedan envíos pendientes')
    }),
  )
})

globalThis.__swParte = { procesarColaSync }
```

Un 4xx (no reintentable) queda como `pendientes` en este bosquejo y haría reintentar para siempre: diferenciarlo — si `res.status` está entre 400 y 499 (no 401/403/410), reescribir la entrada con `estado: 'error'` y no contarla como pendiente. Agregar ese caso al test (cuerpo `a: 4` con 422 → no queda en `pendientes` y su estado pasa a `'error'`).

`lib/infraestructura/parte/registrar-sync.ts`:

```ts
export const TAG_SYNC_PARTE = 'parte-envio'

interface RegistroConSync extends ServiceWorkerRegistration {
  sync?: { register(tag: string): Promise<void> }
}

export async function registrarServiceWorkerParte(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw-parte.js', { scope: '/problematicas/parte' })
  } catch {
    return null
  }
}

export async function pedirSyncParte(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const registro = (await navigator.serviceWorker.ready) as RegistroConSync
    if (!registro.sync) return false
    await registro.sync.register(TAG_SYNC_PARTE)
    return true
  } catch {
    return false
  }
}

export function alEnviarEnSegundoPlano(callback: (clave: string) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const manejar = (e: MessageEvent) => {
    const d = e.data as { tipo?: string; clave?: string } | null
    if (d?.tipo === 'parte-enviado' && typeof d.clave === 'string') callback(d.clave)
  }
  navigator.serviceWorker.addEventListener('message', manejar)
  return () => navigator.serviceWorker.removeEventListener('message', manejar)
}
```

Formularios (`reporte-inicial-form.tsx`, `recorrido-actualizacion.tsx`):
- `useEffect(() => { void registrarServiceWorkerParte() }, [])`.
- En `onCambioEstado`, cuando el estado nuevo es reintentable: `void pedirSyncParte()` (si devuelve `false`, no hace falta nada más: el reintento en primer plano del Batch 1 ya está programado).
- `useEffect(() => alEnviarEnSegundoPlano((clave) => { if (clave === claveBorrador(tipo, cue)) mostrarEnviado() }), [cue])`, donde `mostrarEnviado` deja la UI en estado "Enviado" (reporte inicial: `setGuardado({ movimientoId: '' })` con el mensaje de éxito; recorrido: etapa `'enviado'`).

Encabezado `Service-Worker-Allowed` no hace falta: el scope pedido (`/problematicas/parte`) está bajo la ubicación del script (`/`). Verificar que `next.config` no reescriba `/sw-parte.js` ni le aplique un `Content-Security-Policy` que lo bloquee (`rg -n "headers|Content-Security-Policy" next.config.*`).

- [ ] **Step 4: Run** — `pnpm exec vitest run lib/infraestructura/parte/` → PASS. Cierre: `pnpm test && pnpm lint && pnpm build` → PASS.

- [ ] **Step 5: Manual mobile check** (no automatizable): Chrome Android o DevTools con dispositivo móvil, viewport 360×740: cargar un parte en modo avión, cerrar la pestaña, volver a conectar; verificar en `chrome://serviceworker-internals` que corrió el sync `parte-envio` y que el parte aparece en el historial. En Safari iOS: verificar que el parte se envía al volver a abrir la página (reintento en primer plano). Anotar el resultado en el documento de seguimiento de la feature.

- [ ] **Step 6: Commit**

```bash
git add public/sw-parte.js lib/infraestructura/parte/sw-parte.test.ts lib/infraestructura/parte/registrar-sync.ts lib/infraestructura/parte/registrar-sync.test.ts components/infraestructura/reporte-inicial-form.tsx components/infraestructura/actualizar/recorrido-actualizacion.tsx
git commit -m "feat(parte): enviar partes pendientes en segundo plano con Background Sync"
```

---

## Cobertura del spec

| Spec | Tasks |
|---|---|
| §3.1 Mobile-first | 11, 12, 16, 17, 23, 24 |
| §3.2 Red de seguridad | 15, 16, 17 |
| §3.3 Relevancia | 10, 22, 24 |
| §4.1 Gravedad sugerida | 3, 4 |
| §4.2 Criterios por categoría | 5, 13 |
| §4.3 Justificación de Crítica | 6, 13, 25 |
| §4.4 Vínculo causal | 7, 20, 21, 26 |
| §4.5 Cierre | 3, 8, 20 |
| §4.6 Movimientos | 20, 23 (el `resumen` sigue siendo el `DiffParte` existente, extendido; no se reemplaza el formato) |
| §4.7 Migraciones | 3 |
| §5.1 Pasos y confirmación de categoría | 14, 18 |
| §5.2 Gravedad | 13 |
| §5.3 Desde cuándo | 12 |
| §5.4 Alcance alumnos | 16 |
| §5.5 Alcance establecimiento | 17 |
| §5.6 Clases y edificio | 9, 18 |
| §5.7 Borrador y retoma | 19, 26 |
| §6.1 Pantalla de entrada | 21, 24 |
| §6.2 Recorrido guiado | 22, 25, 26 |
| §6.3 "Cambió" | 22, 25 |
| §6.4 Cascada | 22, 25, 26 |
| §6.5 Línea de tiempo | 20, 23 |
| §7.1 Bug | 1, 2 |
| §7.2–7.3 Estados y reintento | 1, 2 |
| §7.4 Background Sync | 27, 28 |
| §9 Datos existentes | 3 (backfill `cierre`), 19 (borradores viejos), 20 (resúmenes viejos con `?? []`), 23 |

Desvíos deliberados respecto del spec, a validar en la revisión del plan:
- §7.2 "Enviado ✓ 10:42": el reporte inicial ya muestra una pantalla de éxito; no se agrega un indicador aparte.
- §6.1 "situación principal en el mapa": el mapa ya usa la peor gravedad (`parte-mapa.ts:422`), que coincide con el primer criterio de relevancia; no se cambia el mapa.
