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

type ContextoLocal = ContextoReporte & {
  /** Form-ready values are captured when the online flow starts. */
  formulario?: {
    escuela: EscuelaEncabezado
    turnos: TurnoContexto[]
    motivos: MotivoRow[]
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

  useEffect(() => {
    let vigente = true
    void cargarFlujos().then((flujos) => {
      if (!vigente) return
      const disponibles = new Set(reportesDelRecorrido(flujos.map(({ contexto }) => contexto), window.location.search).map(({ draftId }) => draftId))
      const delRecorrido = flujos.filter(({ contexto }) => disponibles.has(contexto.draftId))
      setSeleccion(seleccionarReporteLocal(delRecorrido.map(({ contexto }) => contexto), window.location.search))
      setCarga(delRecorrido.length ? { tipo: 'listo', flujos: delRecorrido } : { tipo: 'vacio' })
    }).catch(() => {
      if (vigente) setCarga({ tipo: 'error', mensaje: 'No se pudo leer el trabajo guardado en este dispositivo.' })
    })
    return () => { vigente = false }
  }, [])

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

  if (carga.tipo === 'cargando') return <main className="publico-content"><p role="status">Buscando trabajo guardado en este dispositivo…</p></main>
  if (carga.tipo === 'error') return <main className="publico-content"><h1>Reportes guardados</h1><p role="alert">{carga.mensaje}</p></main>
  if (carga.tipo === 'vacio') {
    return <main className="publico-content"><h1>Reportes guardados</h1><p role="status">No hay un reporte guardado para este recorrido en este dispositivo. Conéctese a internet para abrir el reporte de su escuela.</p></main>
  }

  if (!flujoSeleccionado) {
    return (
      <main className="publico-content">
        <h1>Reportes guardados</h1>
        <p>Seleccione un reporte guardado en este dispositivo.</p>
        {conflictosContexto.length > 0 && (
          <ul aria-label="Conflictos de contexto">
            {conflictosContexto.map((conflicto) => (
              <li key={conflicto.draftId} role="alert">
                Los datos de la escuela {conflicto.localSchool || `CUE ${conflicto.cue}`} cambiaron o ya no están disponibles.
                Las respuestas del borrador se conservaron para su revisión.
              </li>
            ))}
          </ul>
        )}
        <ul>
          {carga.flujos.map(({ contexto }) => (
            <li key={contexto.draftId}>
              <button type="button" onClick={() => setSeleccion(contexto.draftId)}>
                {contexto.flujo === 'inicial' ? 'Reporte inicial' : 'Actualización'} · CUE {contexto.cue}
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
    return <main className="publico-content"><h1>Reporte guardado</h1><p role="alert">El contexto guardado no contiene los datos necesarios para abrir este recorrido. El borrador se conservó en el dispositivo.</p><button type="button" onClick={() => setSeleccion(null)}>Volver a reportes</button></main>
  }

  if (contexto.flujo === 'actualizacion' && !formulario.estadoActual?.parte) {
    return <main className="publico-content"><h1>Actualización guardada</h1><p role="alert">No hay una copia local del estado e historial necesarios para continuar sin conexión. El borrador se conservó.</p><button type="button" onClick={() => setSeleccion(null)}>Volver a reportes</button></main>
  }

  return (
    <main className="publico-content publico-content--parte">
      <button type="button" onClick={() => setSeleccion(null)}>← Reportes guardados</button>
      {conflictosContexto.some((conflicto) => conflicto.draftId === contexto.draftId) && (
        <p role="alert">
          La escuela o el CUE guardados ya no coinciden con los datos actuales del servidor.
          Sus respuestas se conservaron en este dispositivo y requieren revisión antes de enviarse.
        </p>
      )}
      {contexto.flujo === 'inicial' ? (
        <>
          <h1>Reporte inicial · {formulario.escuela.nombre}</h1>
          <ReporteInicialForm cue={contexto.cue} turnos={formulario.turnos} motivos={formulario.motivos} />
        </>
      ) : (
        <>
          <h1>Actualización · {formulario.escuela.nombre}</h1>
          <RecorridoActualizacion cue={contexto.cue} turnos={formulario.turnos} motivos={formulario.motivos} />
        </>
      )}
    </main>
  )
}
