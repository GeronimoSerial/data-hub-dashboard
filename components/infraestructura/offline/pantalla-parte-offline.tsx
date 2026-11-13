'use client'

import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { ReporteInicialForm } from '@/components/infraestructura/reporte-inicial-form'
import { RecorridoActualizacion } from '@/components/infraestructura/actualizar/recorrido-actualizacion'
import type { EscuelaEncabezado } from '@/components/infraestructura/encabezado-parte'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import { abrirAlmacenParte, NOMBRE_DB_PARTE, STORES_PARTE, VERSION_DB_PARTE } from '@/lib/infraestructura/parte/almacen-indexeddb'
import type { ContextoReporte } from '@/lib/infraestructura/reportes-offline-contratos'
import type { EstadoActualRespuesta } from '@/components/infraestructura/estado-actual-textos'
import type { MovimientoHistorial } from '@/components/infraestructura/historial-movimiento'
import { reportesDelRecorrido, seleccionarReporteLocal } from '@/lib/infraestructura/parte/retomar-reporte-local'
import { reconectarParte, type ConflictoContexto } from '@/lib/infraestructura/parte/reconexion'
import type { CarreraElegible } from '@/lib/infraestructura/parte/instituto-ui'
import { useTextos } from '@/lib/i18n/idioma-provider'

type ContextoLocal = ContextoReporte & {
  /** Form-ready values are captured when the online flow starts. */
  formulario?: {
    escuela: EscuelaEncabezado
    turnos: TurnoContexto[]
    motivos: MotivoRow[]
    /** Sólo institutos superiores. */
    carreras?: CarreraElegible[]
    estadoActual?: EstadoActualRespuesta
    historial?: MovimientoHistorial[]
  }
}

type BorradorLocal = { draftId: string; datos?: unknown; version?: number }
type FlujoDisponible = { contexto: ContextoLocal; borrador: BorradorLocal | null }
type EstadoCarga =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'vacio' }
  | { tipo: 'listo'; flujos: FlujoDisponible[] }

function leerTodo<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error ?? new Error('Could not read offline records.'))
    tx.onabort = () => reject(tx.error ?? new Error('Offline storage transaction was aborted.'))
  })
}

async function cargarFlujos(): Promise<FlujoDisponible[]> {
  const almacen = await abrirAlmacenParte()
  almacen.cerrar()
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(NOMBRE_DB_PARTE, VERSION_DB_PARTE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open offline storage.'))
    request.onblocked = () => reject(new Error('Another tab is blocking offline storage.'))
  })
  try {
    const [contextos, borradores] = await Promise.all([
      leerTodo<ContextoLocal>(db, STORES_PARTE.contextos),
      leerTodo<BorradorLocal>(db, STORES_PARTE.borradores),
    ])
    const borradoresPorId = new Map(borradores.map((borrador) => [borrador.draftId, borrador]))
    return contextos
      .filter((contexto) => contexto?.version === 1 && typeof contexto.draftId === 'string')
      .map((contexto) => ({ contexto, borrador: borradoresPorId.get(contexto.draftId) ?? null }))
      .filter(({ borrador }) => borrador !== null)
  } finally {
    db.close()
  }
}

/**
 * The existing update component owns the full update interaction. Its initial
 * GETs are answered from the persisted context; other requests keep normal network behavior.
 */
function useLocalUpdateReads(contexto: ContextoLocal | null): void {
  useLayoutEffect(() => {
    const localSnapshot = contexto?.formulario?.estadoActual
    if (!localSnapshot) return
    const originalFetch = window.fetch
    const localHistory = contexto.formulario?.historial ?? []
    const localFetch: typeof window.fetch = (input, init) => {
      const url = typeof input === 'string'
        ? new URL(input, window.location.href).href
        : input instanceof URL ? input.href : input.url
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      if (method === 'GET' && url.includes('/api/problematicas/parte/historial')) {
        return Promise.resolve(Response.json({ movimientos: localHistory }))
      }
      if (method === 'GET' && url.includes('/api/problematicas/parte?')) {
        return Promise.resolve(Response.json(localSnapshot))
      }
      return originalFetch(input, init)
    }
    window.fetch = localFetch
    return () => {
      if (window.fetch === localFetch) window.fetch = originalFetch
    }
  }, [contexto])
}

export function PantallaParteOffline(): JSX.Element {
  const [carga, setCarga] = useState<EstadoCarga>({ tipo: 'cargando' })
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [conflictosContexto, setConflictosContexto] = useState<ConflictoContexto[]>([])
  const reconexionEnCurso = useRef(false)
  const t = useTextos().parteGaleria.offline

  useEffect(() => {
    let vigente = true
    void cargarFlujos().then((flujos) => {
      if (!vigente) return
      const disponibles = new Set(reportesDelRecorrido(flujos.map(({ contexto }) => contexto), window.location.search).map(({ draftId }) => draftId))
      const delRecorrido = flujos.filter(({ contexto }) => disponibles.has(contexto.draftId))
      setSeleccion(seleccionarReporteLocal(delRecorrido.map(({ contexto }) => contexto), window.location.search))
      setCarga(delRecorrido.length ? { tipo: 'listo', flujos: delRecorrido } : { tipo: 'vacio' })
    }).catch(() => {
      if (vigente) setCarga({ tipo: 'error', mensaje: t.noLeer })
    })
    return () => { vigente = false }
  }, [t])

  useEffect(() => {
    if (carga.tipo === 'cargando') return
    const reconectar = () => {
      if (reconexionEnCurso.current) return
      reconexionEnCurso.current = true
      const contextos = carga.tipo === 'listo' ? carga.flujos.map(({ contexto }) => contexto) : []
      void reconectarParte(contextos).then((resultado) => {
        if (resultado.contextConflicts.length) setConflictosContexto(resultado.contextConflicts)
      }).catch(() => undefined).finally(() => {
        reconexionEnCurso.current = false
      })
    }
    if (typeof navigator === 'undefined' || navigator.onLine) reconectar()
    window.addEventListener('online', reconectar)
    return () => window.removeEventListener('online', reconectar)
  }, [carga])

  const flujoSeleccionado = carga.tipo === 'listo'
    ? carga.flujos.find(({ contexto }) => contexto.draftId === seleccion) ?? null
    : null
  useLocalUpdateReads(flujoSeleccionado?.contexto ?? null)

  if (carga.tipo === 'cargando') return <main className="publico-content"><p role="status">{t.buscando}</p></main>
  if (carga.tipo === 'error') return <main className="publico-content"><h1>{t.noAbrir}</h1><p role="alert">{carga.mensaje}</p></main>
  if (carga.tipo === 'vacio') {
    return <main className="publico-content"><h1>{t.noDisponible}</h1><p role="status">{t.sinReporte}</p></main>
  }

  if (!flujoSeleccionado) {
    return (
      <main className="publico-content">
        <h1>{t.guardados}</h1>
        <p>{t.seleccione}</p>
        {conflictosContexto.length > 0 && (
          <ul aria-label={t.conflictosAria}>
            {conflictosContexto.map((conflicto) => (
              <li key={conflicto.draftId} role="alert">
                {t.conflicto(conflicto.localSchool || `CUE ${conflicto.cue}`)}
              </li>
            ))}
          </ul>
        )}
        <ul>
          {carga.flujos.map(({ contexto }) => (
            <li key={contexto.draftId}>
              <button type="button" onClick={() => setSeleccion(contexto.draftId)}>
                {t.reporteCue(contexto.flujo === 'inicial' ? t.tipoInicial : t.tipoActualizacion, contexto.cue)}
              </button>
            </li>
          ))}
        </ul>
      </main>
    )
  }

  const { contexto } = flujoSeleccionado
  const formulario = contexto.formulario
  if (!formulario || !formulario.turnos || !formulario.motivos) {
    return <main className="publico-content"><h1>{t.guardado}</h1><p role="alert">{t.contextoIncompleto}</p><button type="button" onClick={() => setSeleccion(null)}>{t.volver}</button></main>
  }

  if (contexto.flujo === 'actualizacion' && !formulario.estadoActual?.parte) {
    return <main className="publico-content"><h1>{t.actualizacionGuardada}</h1><p role="alert">{t.sinCopia}</p><button type="button" onClick={() => setSeleccion(null)}>{t.volver}</button></main>
  }

  return (
    <main className="publico-content publico-content--parte">
      <button type="button" onClick={() => setSeleccion(null)}>{t.volverFlecha}</button>
      {conflictosContexto.some((conflicto) => conflicto.draftId === contexto.draftId) && (
        <p role="alert">
          {t.conflictoFlujo}
        </p>
      )}
      {contexto.flujo === 'inicial' ? (
        <>
          <h1>{t.tituloInicial(formulario.escuela.nombre)}</h1>
          <ReporteInicialForm cue={contexto.cue} turnos={formulario.turnos} motivos={formulario.motivos} carreras={formulario.carreras} />
        </>
      ) : (
        <>
          <h1>{t.tituloActualizacion(formulario.escuela.nombre)}</h1>
          <RecorridoActualizacion cue={contexto.cue} turnos={formulario.turnos} motivos={formulario.motivos} />
        </>
      )}
    </main>
  )
}
