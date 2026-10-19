'use client'

import { useEffect, useState, type FormEvent } from 'react'
import type { EventoAuditoria } from '@/lib/infraestructura/auditoria/consulta'

type Evento = Omit<EventoAuditoria, 'ocurridoEn'> & { ocurridoEn: string }
type Pagina = { items: Evento[]; nextCursor: string | null }
const fecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Argentina/Buenos_Aires' })
const RESULTADOS = ['pendiente', 'exito', 'rechazado', 'invalido', 'conflicto', 'repetido', 'sin_cambio', 'error']

export function AuditoriaVisor() {
  const [consulta, setConsulta] = useState('limite=50')
  const [pagina, setPagina] = useState<Pagina | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [reintento, setReintento] = useState(0)
  const [anteriores, setAnteriores] = useState<string[]>([])

  useEffect(() => {
    const controller = new AbortController()
    async function cargar() {
      setCargando(true)
      setError('')
      try {
        const response = await fetch(`/api/infraestructura/auditoria?${consulta}`, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error(response.status === 403 ? 'No tenés permiso para consultar la auditoría.' : 'No se pudo cargar el historial.')
        const datos: Pagina = await response.json()
        if (!controller.signal.aborted) setPagina(datos)
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.')
      } finally {
        if (!controller.signal.aborted) setCargando(false)
      }
    }
    void cargar()
    return () => controller.abort()
  }, [consulta, reintento])

  function filtrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams({ limite: '50' })
    for (const [key, value] of new FormData(event.currentTarget)) {
      const texto = String(value).trim()
      if (texto) params.set(key, key === 'desde' || key === 'hasta' ? new Date(`${texto}-03:00`).toISOString() : texto)
    }
    setAnteriores([])
    setConsulta(params.toString())
    setReintento(n => n + 1)
  }

  return (
    <section className="auditoria-visor" aria-labelledby="auditoria-titulo">
      <header>
        <h1 id="auditoria-titulo">Auditoría de infraestructura</h1>
        <p>Operaciones de reportes y mapa. Horarios de Buenos Aires. Un acceso compartido o un enlace no identifica a una persona.</p>
      </header>
      <form className="auditoria-visor__filtros" onSubmit={filtrar}>
        {[
          ['actorId', 'ID de usuario', 'text'], ['accion', 'Acción', 'text'], ['cueAnexo', 'CUE anexo', 'text'],
          ['objetoId', 'ID de objeto', 'text'], ['desde', 'Desde', 'datetime-local'], ['hasta', 'Hasta (exclusivo)', 'datetime-local'],
        ].map(([name, label, type]) => (
          <label className="ui-field" key={name}>
            <span className="ui-field__label">{label}</span>
            <input className="ui-input" name={name} type={type} maxLength={128} />
          </label>
        ))}
        <label className="ui-field">
          <span className="ui-field__label">Resultado</span>
          <select className="ui-input" name="resultado">
            <option value="">Todos</option>
            {RESULTADOS.map(resultado => <option key={resultado} value={resultado}>{resultado.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
        <button className="ui-button ui-button--default" disabled={cargando}>Filtrar historial</button>
      </form>
      <div aria-live="polite" aria-atomic="true">
        {cargando && <p role="status">Cargando historial…</p>}
        {error && <p role="alert">{error} <button className="ui-button ui-button--secondary" onClick={() => setReintento(n => n + 1)}>Reintentar</button></p>}
        {!cargando && !error && pagina?.items.length === 0 && <p>No hay operaciones para estos filtros.</p>}
      </div>
      {!cargando && !error && Boolean(pagina?.items.length) && (
        <ol className="auditoria-visor__eventos" aria-label="Operaciones registradas">
          {pagina!.items.map(evento => (
            <li key={evento.id}>
              <div className="auditoria-visor__resumen">
                <strong>{evento.accion}</strong>
                <time dateTime={evento.ocurridoEn}>{fecha.format(new Date(evento.ocurridoEn))}</time>
                <span>{evento.resultado.replaceAll('_', ' ')}{evento.httpStatus !== null ? ` · HTTP ${evento.httpStatus}` : ''}</span>
              </div>
              <p>{evento.actorTipo}: {evento.actorId ?? 'sin identidad personal'}{evento.actorRol ? ` (${evento.actorRol})` : ''} · {evento.viaAcceso}</p>
              <p>{evento.cueAnexo ? `CUE ${evento.cueAnexo} · ` : ''}{evento.objetoTipo ?? 'Solicitud'}{evento.objetoId ? `: ${evento.objetoId}` : ''}</p>
              <details>
                <summary>Ver referencias</summary>
                <p>Solicitud: {evento.requestId}</p>
                <p>{evento.metodo} {evento.rutaPlantilla} · {evento.duracionMs} ms hasta preparar el registro</p>
                <pre>{JSON.stringify(evento.metadatos, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ol>
      )}
      <nav className="ui-actions" aria-label="Páginas del historial">
        <button className="ui-button ui-button--secondary" disabled={cargando || anteriores.length === 0} onClick={() => {
          setConsulta(anteriores.at(-1)!)
          setAnteriores(lista => lista.slice(0, -1))
        }}>Anterior</button>
        <button className="ui-button ui-button--secondary" disabled={cargando || Boolean(error) || !pagina?.nextCursor} onClick={() => {
          const params = new URLSearchParams(consulta)
          params.set('cursor', pagina!.nextCursor!)
          setAnteriores(lista => [...lista, consulta])
          setConsulta(params.toString())
        }}>Siguiente</button>
      </nav>
    </section>
  )
}
