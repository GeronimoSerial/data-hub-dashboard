'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FormularioLlamada } from '@/components/call-center/formulario-llamada'

type UltimaLlamada = { creadaEn: string; callerNombre: string } | null

export type EscuelaSinActualizar = {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  actualizadaEn: string | null
  horasSinActualizar: number
  contactada: boolean
  ultimaLlamada: UltimaLlamada
}

type Filtro = 'pendientes' | 'contactadas' | 'todas'

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'pendientes', etiqueta: 'Pendientes' },
  { valor: 'contactadas', etiqueta: 'Contactadas' },
  { valor: 'todas', etiqueta: 'Todas' },
]

// Below this width the list and the form no longer fit side by side, so the
// form opens in a modal instead of stacking under a long list.
const CONSULTA_ANGOSTA = '(max-width: 899px)'

function usePantallaAngosta(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const consulta = window.matchMedia(CONSULTA_ANGOSTA)
      consulta.addEventListener('change', avisar)
      return () => consulta.removeEventListener('change', avisar)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(CONSULTA_ANGOSTA).matches : false),
    () => false,
  )
}

export type ListaEscuelasProps = { callerNombreInicial: string }

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function textoSinActualizar(horas: number): string {
  if (horas >= 48) return `hace ${Math.floor(horas / 24)} días sin actualizar`
  return `hace ${horas} h sin actualizar`
}

function formatearFecha(valor: string): string {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor
  return fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export function ListaEscuelas({ callerNombreInicial }: ListaEscuelasProps) {
  const [escuelas, setEscuelas] = useState<EscuelaSinActualizar[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [cueSeleccionado, setCueSeleccionado] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    fetch('/api/call-center/escuelas')
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error('respuesta no válida')
        const cuerpo = (await respuesta.json()) as { escuelas: EscuelaSinActualizar[] }
        if (activo) setEscuelas(cuerpo.escuelas)
      })
      .catch(() => {
        if (activo) setError(true)
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [recarga])

  const recargar = useCallback(() => {
    setCargando(true)
    setError(false)
    setRecarga((n) => n + 1)
  }, [])

  const visibles = useMemo(() => {
    const termino = normalizar(busqueda.trim())
    return escuelas.filter((escuela) => {
      if (filtro === 'pendientes' && escuela.contactada) return false
      if (filtro === 'contactadas' && !escuela.contactada) return false
      if (!termino) return true
      return [escuela.nombre, escuela.cueAnexo, escuela.departamento]
        .some((campo) => normalizar(campo).includes(termino))
    })
  }, [escuelas, busqueda, filtro])

  const seleccionada = escuelas.find((escuela) => escuela.cueAnexo === cueSeleccionado) ?? null
  const angosta = usePantallaAngosta()

  const formulario = seleccionada ? (
    <FormularioLlamada
      key={seleccionada.cueAnexo}
      cueAnexo={seleccionada.cueAnexo}
      nombreEscuela={seleccionada.nombre}
      callerNombreInicial={callerNombreInicial}
      onGuardada={recargar}
    />
  ) : null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-4)', alignItems: 'flex-start' }}>
      <section style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div className="admin-filters">
          <Input
            type="search"
            aria-label="Buscar escuela"
            placeholder="Buscar por nombre, CUE o departamento"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
          {FILTROS.map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              aria-pressed={filtro === opcion.valor}
              className={filtro === opcion.valor ? 'admin-filter is-active' : 'admin-filter'}
              onClick={() => setFiltro(opcion.valor)}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert">No se pudo cargar la lista de escuelas. Intentá de nuevo más tarde.</p>
        )}
        {cargando && !error && <p>Cargando escuelas…</p>}

        {!cargando && !error && (
          <>
            <p className="ui-hint">{visibles.length} escuelas</p>
            {visibles.length === 0 ? (
              <p>No hay escuelas para este filtro.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--s-2)' }}>
                {visibles.map((escuela) => {
                  const activa = escuela.cueAnexo === cueSeleccionado
                  return (
                    <li key={escuela.cueAnexo}>
                      <button
                        type="button"
                        aria-pressed={activa}
                        onClick={() => setCueSeleccionado(escuela.cueAnexo)}
                        className="admin-panel"
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          cursor: 'pointer',
                          gap: 'var(--s-1)',
                          padding: 'var(--s-3) var(--s-4)',
                          borderColor: activa ? 'var(--ink)' : undefined,
                          boxShadow: activa ? '0 0 0 1px var(--ink)' : undefined,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            gap: 'var(--s-3)',
                          }}
                        >
                          <strong>{escuela.nombre}</strong>
                          {escuela.contactada ? (
                            <span className="admin-status admin-status--ok">Contactada</span>
                          ) : (
                            <span className="admin-status admin-status--warn">Pendiente</span>
                          )}
                        </div>
                        <div className="ui-hint">
                          CUE {escuela.cueAnexo} · {escuela.departamento}, {escuela.localidad}
                        </div>
                        <div className="ui-hint">
                          {textoSinActualizar(escuela.horasSinActualizar)}
                          {escuela.contactada && escuela.ultimaLlamada && (
                            <>
                              {' · '}llamó {escuela.ultimaLlamada.callerNombre},{' '}
                              {formatearFecha(escuela.ultimaLlamada.creadaEn)}
                            </>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {angosta ? (
        <Dialog
          open={seleccionada !== null}
          onOpenChange={(abierto) => {
            if (!abierto) setCueSeleccionado(null)
          }}
        >
          <DialogContent className="call-center-dialog">
            {seleccionada && (
              <>
                <DialogTitle render={<h2 />}>{seleccionada.nombre}</DialogTitle>
                <p className="ui-hint">
                  CUE {seleccionada.cueAnexo} · {textoSinActualizar(seleccionada.horasSinActualizar)}
                </p>
                {formulario}
              </>
            )}
          </DialogContent>
        </Dialog>
      ) : (
        <section
          className="admin-panel"
          style={{ flex: '1 1 320px', minWidth: 0, position: 'sticky', top: 'var(--s-4)' }}
        >
          {seleccionada ? (
            <>
              <h2>{seleccionada.nombre}</h2>
              <p className="ui-hint">
                CUE {seleccionada.cueAnexo} · {textoSinActualizar(seleccionada.horasSinActualizar)}
              </p>
              {formulario}
            </>
          ) : (
            <p className="ui-hint">Elegí una escuela de la lista para registrar la llamada.</p>
          )}
        </section>
      )}
    </div>
  )
}
