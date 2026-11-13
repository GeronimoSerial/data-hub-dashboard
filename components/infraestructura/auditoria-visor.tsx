'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import { useRegion } from '@/lib/infraestructura/region/region-provider'

// Visor de solo lectura de la auditoría (A4). Carga al abrirse, filtra y pagina
// por cursor opaco que devuelve el servidor. Las fechas de los filtros se leen
// en el huso de la región y viajan en ISO con desplazamiento.

const ENDPOINT = '/api/infraestructura/auditoria'
const LIMITE = 50
const RESULTADOS = ['pendiente', 'exito', 'rechazado', 'invalido', 'conflicto', 'repetido', 'sin_cambio', 'error'] as const
// Valor del ítem "Todos": el Select no admite un ítem con valor vacío.
const TODOS = 'todos'
const LONGITUD_MAXIMA_METADATO = 120
const METADATOS_MAXIMOS = 20

export type Filtros = {
  actorId: string
  accion: string
  cueAnexo: string
  objetoId: string
  resultado: string
  desde: string
  hasta: string
}

const FILTROS_VACIOS: Filtros = { actorId: '', accion: '', cueAnexo: '', objetoId: '', resultado: '', desde: '', hasta: '' }

export type EventoVisible = {
  id: string
  requestId: string
  ocurridoEn: string
  actorTipo: string
  actorId: string | null
  actorRol: string | null
  viaAcceso: string
  accion: string
  metodo: string
  rutaPlantilla: string
  objetoTipo: string | null
  objetoId: string | null
  cueAnexo: string | null
  resultado: string
  httpStatus: number | null
  duracionMs: number
  metadatos: Record<string, unknown> | null
}

type Pagina = { items: EventoVisible[]; nextCursor: string | null }

type ErrorCarga = 'permiso' | 'sesion' | 'filtros' | 'carga'

class ErrorHttp extends Error {
  status: number

  constructor(status: number) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

// Milisegundos que el huso suma a la hora UTC de `instante` (Corrientes: -10800000).
function desplazamientoMs(instante: number, zona: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instante))
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value ?? 0)
  const comoUtc = Date.UTC(valor('year'), valor('month') - 1, valor('day'), valor('hour'), valor('minute'), valor('second'))
  return comoUtc - instante
}

/** Convierte la hora de pared de `datetime-local` en la zona dada a ISO con Z. Null si no es una fecha completa. */
export function fechaLocalAIso(valor: string, zona: string): string | null {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valor)
  if (!coincidencia) return null
  const comoUtc = Date.UTC(
    Number(coincidencia[1]),
    Number(coincidencia[2]) - 1,
    Number(coincidencia[3]),
    Number(coincidencia[4]),
    Number(coincidencia[5]),
  )
  const primera = comoUtc - desplazamientoMs(comoUtc, zona)
  const instante = comoUtc - desplazamientoMs(primera, zona)
  return new Date(instante).toISOString()
}

export function construirQueryAuditoria(filtros: Filtros, zona: string, cursor: string | null): string {
  const params = new URLSearchParams({ limite: String(LIMITE) })
  for (const clave of ['actorId', 'accion', 'cueAnexo', 'objetoId', 'resultado'] as const) {
    const valor = filtros[clave].trim()
    if (valor) params.set(clave, valor)
  }
  for (const clave of ['desde', 'hasta'] as const) {
    const iso = filtros[clave] ? fechaLocalAIso(filtros[clave], zona) : null
    if (iso) params.set(clave, iso)
  }
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

// Un código nuevo del servidor se muestra tal cual, nunca como texto inventado.
function etiqueta(mapa: Record<string, string>, clave: string): string {
  return Object.hasOwn(mapa, clave) ? mapa[clave]! : clave
}

function acotar(valor: unknown): string {
  const texto = typeof valor === 'string' ? valor : (JSON.stringify(valor) ?? '')
  return texto.length > LONGITUD_MAXIMA_METADATO ? `${texto.slice(0, LONGITUD_MAXIMA_METADATO)}…` : texto
}

function codigoError(error: unknown): ErrorCarga {
  if (error instanceof ErrorHttp) {
    if (error.status === 401) return 'sesion'
    if (error.status === 403) return 'permiso'
    if (error.status === 400) return 'filtros'
  }
  return 'carga'
}

function Campo({ id, texto, children }: { id: string; texto: string; children: ReactNode }) {
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>{texto}</label>
      <div className="ui-field__control">{children}</div>
    </div>
  )
}

function MetadatosCompactos({ metadatos, sinDatos }: { metadatos: Record<string, unknown> | null; sinDatos: string }) {
  const entradas = Object.entries(metadatos ?? {}).slice(0, METADATOS_MAXIMOS)
  if (entradas.length === 0) return <p className="ui-hint">{sinDatos}</p>
  return (
    <ul className="admin-plain-list">
      {entradas.map(([clave, valor]) => (
        <li key={clave} style={{ overflowWrap: 'anywhere' }}>
          <span className="ui-hint">{clave}</span>: {acotar(valor)}
        </li>
      ))}
    </ul>
  )
}

type Consulta = { filtros: Filtros; cursor: string | null; pila: (string | null)[] }
type Respuesta = { clave: string; pagina?: Pagina; error?: ErrorCarga }

export function AuditoriaVisor() {
  const t = useTextos().auditoria
  const idioma = useIdioma()
  const region = useRegion()
  const [borrador, setBorrador] = useState<Filtros>(FILTROS_VACIOS)
  const [consulta, setConsulta] = useState<Consulta>({ filtros: FILTROS_VACIOS, cursor: null, pila: [] })
  const [intento, setIntento] = useState(0)
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null)

  const query = construirQueryAuditoria(consulta.filtros, region.zonaHoraria, consulta.cursor)
  const clave = `${query}#${intento}`
  // Derivado: la respuesta vigente es la de esta clave. Así la carga nunca se guarda en estado.
  const cargando = respuesta?.clave !== clave
  const paginaVisible = respuesta?.pagina
  const errorVisible = respuesta?.clave === clave ? respuesta.error : undefined

  useEffect(() => {
    const controlador = new AbortController()
    async function cargar() {
      try {
        const respuestaHttp = await fetch(`${ENDPOINT}?${query}`, { signal: controlador.signal, cache: 'no-store' })
        if (!respuestaHttp.ok) throw new ErrorHttp(respuestaHttp.status)
        const pagina = (await respuestaHttp.json()) as Pagina
        if (!controlador.signal.aborted) setRespuesta({ clave, pagina })
      } catch (error) {
        if (!controlador.signal.aborted) setRespuesta({ clave, error: codigoError(error) })
      }
    }
    void cargar()
    return () => controlador.abort()
  }, [query, clave])

  const formatoFecha = useMemo(
    () => new Intl.DateTimeFormat(idioma === 'pt' ? 'pt-BR' : 'es-AR', { timeZone: region.zonaHoraria, dateStyle: 'short', timeStyle: 'medium' }),
    [idioma, region.zonaHoraria],
  )

  const mensajesError: Record<ErrorCarga, string> = {
    permiso: t.estados.errorPermiso,
    sesion: t.estados.errorSesion,
    filtros: t.estados.errorFiltros,
    carga: t.estados.errorCarga,
  }

  function aplicar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setConsulta({ filtros: borrador, cursor: null, pila: [] })
  }

  function limpiar() {
    setBorrador(FILTROS_VACIOS)
    setConsulta({ filtros: FILTROS_VACIOS, cursor: null, pila: [] })
  }

  // Los botones no se deshabilitan mientras carga: deshabilitar el enfocado tira el foco al body.
  function siguiente() {
    const cursor = paginaVisible?.nextCursor
    if (cargando || !cursor) return
    setConsulta((actual) => ({ filtros: actual.filtros, cursor, pila: [...actual.pila, actual.cursor] }))
  }

  function anterior() {
    if (cargando || consulta.pila.length === 0) return
    setConsulta((actual) => ({
      filtros: actual.filtros,
      cursor: actual.pila[actual.pila.length - 1] ?? null,
      pila: actual.pila.slice(0, -1),
    }))
  }

  const items = paginaVisible?.items ?? []
  const sinResultados = !cargando && !errorVisible && paginaVisible !== undefined && items.length === 0
  const puedeReintentar = errorVisible === 'carga'

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>{t.titulo}</h1>
        <p className="page-intro">{t.intro}</p>
      </header>

      <section className="admin-panel" aria-label={t.filtros.legend}>
        <form className="ui-form-grid" onSubmit={aplicar}>
          <div className="ui-two-col">
            <Campo id="auditoria-actor" texto={t.filtros.actor}>
              <Input id="auditoria-actor" maxLength={128} value={borrador.actorId} onChange={(e) => setBorrador({ ...borrador, actorId: e.currentTarget.value })} />
            </Campo>
            <Campo id="auditoria-accion" texto={t.filtros.accion}>
              <Input id="auditoria-accion" maxLength={128} value={borrador.accion} onChange={(e) => setBorrador({ ...borrador, accion: e.currentTarget.value })} />
            </Campo>
            <Campo id="auditoria-cue" texto={t.filtros.cue}>
              <Input id="auditoria-cue" maxLength={128} value={borrador.cueAnexo} onChange={(e) => setBorrador({ ...borrador, cueAnexo: e.currentTarget.value })} />
            </Campo>
            <Campo id="auditoria-objeto" texto={t.filtros.objeto}>
              <Input id="auditoria-objeto" maxLength={128} value={borrador.objetoId} onChange={(e) => setBorrador({ ...borrador, objetoId: e.currentTarget.value })} />
            </Campo>
          </div>
          <div className="ui-two-col">
            <div className="ui-field">
              <span className="ui-field__label" id="auditoria-resultado">{t.filtros.resultado}</span>
              <div className="ui-field__control">
                <Select
                  value={borrador.resultado || TODOS}
                  items={[{ value: TODOS, label: t.filtros.todos }, ...RESULTADOS.map((resultado) => ({ value: resultado, label: t.resultados[resultado] }))]}
                  onValueChange={(valor) => setBorrador({ ...borrador, resultado: valor === TODOS || valor == null ? '' : String(valor) })}
                >
                  <SelectTrigger aria-labelledby="auditoria-resultado" />
                  <SelectContent>
                    <SelectItem value={TODOS}>{t.filtros.todos}</SelectItem>
                    {RESULTADOS.map((resultado) => <SelectItem key={resultado} value={resultado}>{t.resultados[resultado]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Campo id="auditoria-desde" texto={t.filtros.desde}>
              <Input id="auditoria-desde" type="datetime-local" value={borrador.desde} onChange={(e) => setBorrador({ ...borrador, desde: e.currentTarget.value })} />
            </Campo>
            <Campo id="auditoria-hasta" texto={t.filtros.hasta}>
              <Input id="auditoria-hasta" type="datetime-local" value={borrador.hasta} onChange={(e) => setBorrador({ ...borrador, hasta: e.currentTarget.value })} />
            </Campo>
          </div>
          <div className="ui-actions">
            <Button type="submit">{t.filtros.aplicar}</Button>
            <Button type="button" variant="secondary" onClick={limpiar}>{t.filtros.limpiar}</Button>
          </div>
        </form>
      </section>

      <section className="admin-panel" aria-labelledby="auditoria-historial" aria-busy={cargando}>
        <h2 id="auditoria-historial">{t.historial}</h2>
        <p role="status" className="ui-hint">{cargando ? t.estados.cargando : ''}</p>
        {errorVisible ? (
          <div className="ui-messagebar ui-messagebar--error" role="alert">
            <span>{mensajesError[errorVisible]}</span>
            {puedeReintentar ? <Button size="sm" variant="secondary" onClick={() => setIntento((n) => n + 1)}>{t.estados.reintentar}</Button> : null}
          </div>
        ) : null}
        {sinResultados ? <p>{t.estados.vacio}</p> : null}
        {items.length > 0 && !errorVisible ? (
          <div className="ui-table-wrap">
            <table className="ui-table">
              <caption className="sr-only">{t.historial}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.columnas.accion}</th>
                  <th scope="col">{t.columnas.fecha}</th>
                  <th scope="col">{t.columnas.actor}</th>
                  <th scope="col">{t.columnas.objeto}</th>
                  <th scope="col">{t.columnas.detalles}</th>
                  <th scope="col">{t.columnas.resultado}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((evento) => (
                  <tr key={evento.id}>
                    <td><strong>{etiqueta(t.acciones, evento.accion)}</strong></td>
                    <td data-label={t.columnas.fecha}>
                      <time dateTime={evento.ocurridoEn}>{formatoFecha.format(new Date(evento.ocurridoEn))}</time>
                    </td>
                    <td data-label={t.columnas.actor} style={{ overflowWrap: 'anywhere' }}>
                      <span>{`${etiqueta(t.actores, evento.actorTipo)}: ${evento.actorId ?? t.actores.sinIdentidad}${evento.actorRol ? ` (${evento.actorRol})` : ''}`}</span>
                      <br />
                      <span className="ui-hint">{etiqueta(t.vias, evento.viaAcceso)}</span>
                    </td>
                    <td data-label={t.columnas.objeto} style={{ overflowWrap: 'anywhere' }}>
                      <span>{`${evento.objetoTipo ?? t.objeto.solicitud}${evento.objetoId ? `: ${evento.objetoId}` : ''}`}</span>
                      {evento.cueAnexo ? <><br /><span className="ui-hint">{t.objeto.cue(evento.cueAnexo)}</span></> : null}
                    </td>
                    <td data-label={t.columnas.detalles} style={{ minWidth: '12rem', overflowWrap: 'anywhere' }}>
                      <details>
                        <summary>{t.detalles.ver}</summary>
                        <ul className="admin-plain-list">
                          <li>{t.detalles.solicitud}: {evento.requestId}</li>
                          <li>{evento.metodo} {evento.rutaPlantilla}</li>
                          <li>{t.detalles.duracion(evento.duracionMs)}</li>
                        </ul>
                        <MetadatosCompactos metadatos={evento.metadatos} sinDatos={t.detalles.sinMetadatos} />
                      </details>
                    </td>
                    <td data-label={t.columnas.resultado}>
                      <span>{etiqueta(t.resultados, evento.resultado)}</span>
                      {evento.httpStatus !== null ? <><br /><span className="ui-hint">{t.httpStatus(evento.httpStatus)}</span></> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <nav className="ui-actions" aria-label={t.paginacion.navegacion}>
          <Button variant="secondary" disabled={consulta.pila.length === 0} onClick={anterior}>{t.paginacion.anterior}</Button>
          <span className="ui-hint">{t.paginacion.pagina(consulta.pila.length + 1)}</span>
          <Button variant="secondary" disabled={!paginaVisible?.nextCursor || Boolean(errorVisible)} onClick={siguiente}>{t.paginacion.siguiente}</Button>
        </nav>
      </section>
    </div>
  )
}
