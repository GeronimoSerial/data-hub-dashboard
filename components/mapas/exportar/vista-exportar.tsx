'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MultiSelect } from '@/components/ui/multi-select'
import { Segmentado } from '@/components/mapas/segmentado'
import { EXPORTACIONES_ESCUELAS, TIPOS_EXPORTACION_ESCUELAS, type TipoExportacionEscuelas } from '@/lib/exportaciones/escuelas'
import { nombreArchivoExportacion } from '@/lib/exportaciones/solicitud'
import { urlExportacionEscuelas, type FiltrosExportacion } from '@/lib/exportaciones/url'
import { ETIQUETA_GRAVEDAD, etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { opcionesDireccion, opcionesDisponibles } from '@/lib/infraestructura/mapa/filtrar'
import { ETIQUETA_HORIZONTE_MOTOR, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { EscuelaMapaEnriquecida, GravedadMapa } from '@/lib/infraestructura/mapa/tipos'
import type { EscuelasMapaPadronResultado } from '@/lib/infraestructura/parte-mapa'
import { descargarExportacion } from './descarga'
import styles from './exportar.module.css'

const RUTA_ESCUELAS = '/api/mapas/infraestructura/escuelas'
const HORIZONTES: readonly HorizonteMotor[] = [24, 72, 240]
const OPCIONES_HORIZONTE = HORIZONTES.map((valor) => ({ valor, etiqueta: ETIQUETA_HORIZONTE_MOTOR[valor] }))
const OPCIONES_ESTADO = TIPOS_EXPORTACION_ESCUELAS.map((tipo) => ({ value: tipo, label: EXPORTACIONES_ESCUELAS[tipo].titulo }))
const GRAVEDADES: readonly GravedadMapa[] = [1, 2, 3, 4]
const OPCIONES_GRAVEDAD = GRAVEDADES.map((gravedad) => ({ value: String(gravedad), label: ETIQUETA_GRAVEDAD[gravedad] }))
const RETARDO_PREVIA_MS = 250

type ColumnaPrevia = { clave: string; encabezado: string }
type PreviaExportacion = {
  total: number
  columnas: ColumnaPrevia[]
  filas: Record<string, unknown>[]
}

function useEscuelasParaFiltros() {
  const [escuelas, setEscuelas] = useState<EscuelaMapaEnriquecida[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controlador = new AbortController()
    fetch(RUTA_ESCUELAS, { signal: controlador.signal, headers: { Accept: 'application/json' } })
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
        const datos = (await respuesta.json()) as EscuelasMapaPadronResultado
        setEscuelas(datos.escuelas)
      })
      .catch(() => {
        if (!controlador.signal.aborted) setError(true)
      })
    return () => controlador.abort()
  }, [])

  return { escuelas, error }
}

type ResultadoPrevia = { url: string; previa: PreviaExportacion | null; error: boolean }

/**
 * Vista previa de la consulta actual. Espera un instante tras cada cambio,
 * cancela la petición anterior y conserva la última previa válida mientras
 * llega la nueva.
 */
function usePrevia(url: string) {
  const [resultado, setResultado] = useState<ResultadoPrevia | null>(null)

  useEffect(() => {
    const controlador = new AbortController()
    const temporizador = setTimeout(() => {
      fetch(url, { signal: controlador.signal, headers: { Accept: 'application/json' }, cache: 'no-store' })
        .then(async (respuesta) => {
          if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
          const previa = (await respuesta.json()) as PreviaExportacion
          if (!controlador.signal.aborted) setResultado({ url, previa, error: false })
        })
        .catch(() => {
          if (!controlador.signal.aborted) setResultado({ url, previa: null, error: true })
        })
    }, RETARDO_PREVIA_MS)
    return () => {
      clearTimeout(temporizador)
      controlador.abort()
    }
  }, [url])

  const actual = resultado?.url === url ? resultado : null
  return {
    previa: resultado?.previa ?? null,
    cargando: actual === null,
    error: actual?.error === true,
  }
}

function textoCelda(valor: unknown): string {
  return valor === null || valor === undefined || valor === '' ? '—' : String(valor)
}

function textoConteo(total: number): string {
  return `${total} ${total === 1 ? 'escuela' : 'escuelas'}`
}

export function VistaExportar() {
  const { escuelas, error: errorOpciones } = useEscuelasParaFiltros()
  const [estados, setEstados] = useState<TipoExportacionEscuelas[]>([])
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [direcciones, setDirecciones] = useState<string[]>([])
  const [gravedades, setGravedades] = useState<string[]>([])
  const [horizonte, setHorizonte] = useState<HorizonteMotor>(72)
  const [descargando, setDescargando] = useState(false)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)

  const opcionesDepartamento = useMemo(
    () => (escuelas ? opcionesDisponibles(escuelas).departamentos : []).map((valor) => ({ value: valor, label: etiquetaDepartamento(valor) })),
    [escuelas],
  )
  const opcionesDirecciones = useMemo(
    () => (escuelas ? opcionesDireccion(escuelas) : []).map((direccion) => ({ value: String(direccion.id), label: direccion.nombre })),
    [escuelas],
  )

  const filtros: FiltrosExportacion = {
    departamentos,
    direcciones: direcciones.map(Number),
    gravedades: gravedades.map((valor) => Number(valor) as GravedadMapa),
  }
  const hayFiltros = estados.length > 0 || departamentos.length > 0 || direcciones.length > 0 || gravedades.length > 0
  const incluyeRiesgo = estados.includes('en-riesgo')

  const urlDescarga = urlExportacionEscuelas({ estados, filtros, horizonte, formato: 'xlsx' })
  const urlPrevia = urlExportacionEscuelas({ estados, filtros, horizonte, formato: 'json' })
  const { previa, cargando, error: errorPrevia } = usePrevia(urlPrevia)

  function limpiar() {
    setEstados([])
    setDepartamentos([])
    setDirecciones([])
    setGravedades([])
    setHorizonte(72)
  }

  async function descargar() {
    setDescargando(true)
    setErrorDescarga(null)
    try {
      await descargarExportacion(urlDescarga, nombreArchivoExportacion(estados, new Date()))
    } catch (error) {
      setErrorDescarga(error instanceof Error ? error.message : 'No se pudo descargar el archivo.')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className={styles.vista}>
      <div className={styles.barra} role="toolbar" aria-label="Filtros de exportación">
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">Estado</span>
          <MultiSelect<TipoExportacionEscuelas>
            ariaLabel="Estado"
            value={estados}
            onChange={setEstados}
            options={OPCIONES_ESTADO}
            placeholder="Todas las escuelas"
          />
        </div>
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">Departamento</span>
          <MultiSelect
            ariaLabel="Departamento"
            value={departamentos}
            onChange={setDepartamentos}
            options={opcionesDepartamento}
            placeholder="Todos los departamentos"
          />
        </div>
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">Dirección</span>
          <MultiSelect
            ariaLabel="Dirección"
            value={direcciones}
            onChange={setDirecciones}
            options={opcionesDirecciones}
            placeholder="Todas las direcciones"
          />
        </div>
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">Gravedad</span>
          <MultiSelect
            ariaLabel="Gravedad"
            value={gravedades}
            onChange={setGravedades}
            options={OPCIONES_GRAVEDAD}
            placeholder="Todas las gravedades"
          />
        </div>
        {incluyeRiesgo ? (
          <Segmentado<HorizonteMotor>
            etiqueta="Horizonte de riesgo"
            opciones={OPCIONES_HORIZONTE}
            valor={horizonte}
            onChange={setHorizonte}
          />
        ) : null}
        <div className={styles.acciones}>
          {hayFiltros ? (
            <button type="button" className={styles.limpiar} onClick={limpiar}>Limpiar</button>
          ) : null}
          <Button type="button" onClick={() => void descargar()} disabled={descargando} aria-busy={descargando || undefined}>
            {descargando ? 'Preparando archivo…' : 'Descargar Excel'}
          </Button>
        </div>
      </div>
      {errorDescarga ? <p className={styles.error} role="alert">{errorDescarga}</p> : null}
      {errorOpciones ? <p className={styles.error} role="alert">No se pudieron cargar las opciones de filtro.</p> : null}

      <section aria-label="Vista previa de escuelas">
        {errorPrevia ? <p className={styles.error} role="alert">No se pudo cargar la vista previa.</p> : null}
        {!errorPrevia && previa === null && cargando ? <p className="muted" role="status">Cargando vista previa…</p> : null}
        {!errorPrevia && previa !== null && previa.total === 0 ? (
          <p className="muted" role="status">Ninguna escuela coincide con estos filtros.</p>
        ) : null}
        {!errorPrevia && previa !== null && previa.total > 0 ? (
          <>
            <p className={styles.conteo} role="status">{textoConteo(previa.total)}</p>
            {previa.filas.length < previa.total ? (
              <p className={styles.nota}>
                Mostrando las primeras {previa.filas.length} de {previa.total}. El Excel incluye todas.
              </p>
            ) : null}
            <div className={styles.tablaWrap}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    {previa.columnas.map((columna) => (
                      <th key={columna.clave} scope="col">{columna.encabezado}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previa.filas.map((fila, indice) => (
                    <tr key={indice}>
                      {previa.columnas.map((columna) => (
                        <td key={columna.clave}>{textoCelda(fila[columna.clave])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}
