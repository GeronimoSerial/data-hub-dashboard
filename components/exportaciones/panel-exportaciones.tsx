'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MultiSelect } from '@/components/ui/multi-select'
import { Segmentado } from '@/components/mapas/segmentado'
import { EXPORTACIONES_ESCUELAS, TIPOS_EXPORTACION_ESCUELAS, type TipoExportacionEscuelas } from '@/lib/exportaciones/escuelas'
import { urlExportacionEscuelas, type FiltrosExportacion } from '@/lib/exportaciones/url'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { opcionesDireccion, opcionesDisponibles } from '@/lib/infraestructura/mapa/filtrar'
import { ETIQUETA_HORIZONTE_MOTOR, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { EscuelasMapaPadronResultado } from '@/lib/infraestructura/parte-mapa'
import { DESCRIPCION_EXPORTACION } from './descripciones'
import { descargarExportacion } from './descarga'
import styles from './exportaciones.module.css'

const RUTA_ESCUELAS = '/api/mapas/infraestructura/escuelas'
const HORIZONTES: readonly HorizonteMotor[] = [24, 72, 240]
const OPCIONES_HORIZONTE = HORIZONTES.map((valor) => ({ valor, etiqueta: ETIQUETA_HORIZONTE_MOTOR[valor] }))

type ErrorDescarga = { tipo: TipoExportacionEscuelas; mensaje: string }

function useEscuelasParaFiltros() {
  const [escuelas, setEscuelas] = useState<EscuelaMapaEnriquecida[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controlador = new AbortController()
    fetch(RUTA_ESCUELAS, { signal: controlador.signal, headers: { Accept: 'application/json' } })
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
        const datos = (await respuesta.json()) as EscuelasMapaPadronResultado
        setEscuelas(datos.escuelas)
      })
      .catch(() => {
        if (!controlador.signal.aborted) setError('No se pudieron cargar las opciones de filtro.')
      })
    return () => controlador.abort()
  }, [])

  return { escuelas, error }
}

export function PanelExportaciones() {
  const { escuelas, error: errorEscuelas } = useEscuelasParaFiltros()
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [direcciones, setDirecciones] = useState<string[]>([])
  const [horizonte, setHorizonte] = useState<HorizonteMotor>(72)
  const [descargando, setDescargando] = useState<TipoExportacionEscuelas | null>(null)
  const [errorDescarga, setErrorDescarga] = useState<ErrorDescarga | null>(null)

  const opcionesDepartamento = useMemo(
    () => (escuelas ? opcionesDisponibles(escuelas).departamentos : []).map((valor) => ({ value: valor, label: etiquetaDepartamento(valor) })),
    [escuelas],
  )
  const opcionesDirecciones = useMemo(
    () => (escuelas ? opcionesDireccion(escuelas) : []).map((direccion) => ({ value: String(direccion.id), label: direccion.nombre })),
    [escuelas],
  )

  const filtros: FiltrosExportacion = { departamentos, direcciones: direcciones.map(Number) }

  async function descargar(tipo: TipoExportacionEscuelas) {
    setDescargando(tipo)
    setErrorDescarga(null)
    try {
      await descargarExportacion(
        urlExportacionEscuelas({ tipo, filtros, horizonte }),
        `${EXPORTACIONES_ESCUELAS[tipo].nombreArchivo}.xlsx`,
      )
    } catch (error) {
      setErrorDescarga({ tipo, mensaje: error instanceof Error ? error.message : 'No se pudo descargar el archivo.' })
    } finally {
      setDescargando(null)
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <h1 className="page-title page-title--sm">Exportaciones</h1>
        <p className="page-intro">
          Listas de escuelas en Excel, con los filtros del mapa de infraestructura.
        </p>
      </header>

      <section aria-labelledby="exportaciones-filtros-titulo">
        <div className="section-head">
          <h2 id="exportaciones-filtros-titulo">Filtros</h2>
        </div>
        {errorEscuelas ? <p className={styles.error} role="alert">{errorEscuelas}</p> : null}
        {escuelas === null && !errorEscuelas ? <p className="muted" role="status">Cargando opciones…</p> : null}
        <div className={styles.filtros}>
          <div className="ui-field">
            <span className="ui-field__label" id="exportaciones-filtro-departamento">Departamento</span>
            <MultiSelect
              ariaLabel="Departamento"
              value={departamentos}
              onChange={setDepartamentos}
              options={opcionesDepartamento}
              placeholder="Todos los departamentos"
            />
          </div>
          <div className="ui-field">
            <span className="ui-field__label" id="exportaciones-filtro-direccion">Dirección</span>
            <MultiSelect
              ariaLabel="Dirección"
              value={direcciones}
              onChange={setDirecciones}
              options={opcionesDirecciones}
              placeholder="Todas las direcciones"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="exportaciones-tipos-titulo">
        <div className="section-head">
          <h2 id="exportaciones-tipos-titulo">Archivos</h2>
        </div>
        <div className="card-grid">
          {TIPOS_EXPORTACION_ESCUELAS.map((tipo) => {
            const titulo = EXPORTACIONES_ESCUELAS[tipo].titulo
            const ocupado = descargando === tipo
            return (
              <article key={tipo} className={styles.tarjeta} aria-labelledby={`exportacion-${tipo}`}>
                <h3 id={`exportacion-${tipo}`}>{titulo}</h3>
                <p className="muted">{DESCRIPCION_EXPORTACION[tipo]}</p>
                {tipo === 'en-riesgo' ? (
                  <Segmentado<HorizonteMotor>
                    etiqueta="Horizonte de riesgo"
                    opciones={OPCIONES_HORIZONTE}
                    valor={horizonte}
                    onChange={setHorizonte}
                  />
                ) : null}
                <div className={styles.pie}>
                  <Button
                    type="button"
                    onClick={() => void descargar(tipo)}
                    disabled={descargando !== null}
                    aria-busy={ocupado || undefined}
                  >
                    {ocupado ? 'Preparando archivo…' : 'Descargar Excel'}
                  </Button>
                  {errorDescarga?.tipo === tipo ? <p className={styles.error} role="alert">{errorDescarga.mensaje}</p> : null}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
