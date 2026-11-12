'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { DataColumn, SortState } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { MultiSelect } from '@/components/ui/multi-select'
import { Segmentado } from '@/components/mapas/segmentado'
import { EXPORTACIONES_ESCUELAS, TIPOS_EXPORTACION_ESCUELAS, type TipoExportacionEscuelas } from '@/lib/exportaciones/escuelas'
import { nombreArchivoExportacion } from '@/lib/exportaciones/solicitud'
import { urlExportacionEscuelas, type FiltrosExportacion } from '@/lib/exportaciones/url'
import { ETIQUETA_GRAVEDAD } from '@/lib/infraestructura/mapa/etiquetas'
import { ETIQUETA_HORIZONTE_MOTOR, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { GravedadMapa } from '@/lib/infraestructura/mapa/tipos'
import { formatoFechaRegion } from '@/components/mapas/formato-fecha-region'
import { descargarExportacion } from './descarga'
import { usePrevia } from './use-previa'
import styles from './exportar.module.css'

const SortableDataTable = dynamic(
  () => import('@/components/arc/sortable-data-table/sortable-data-table').then(m => m.SortableDataTable),
  { loading: () => <CargaExportacion titulo="Cargando tabla" detalle="Preparando la vista de escuelas." /> },
)

function CargaExportacion({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className={styles.carga} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <div><p className={styles.cargaTitulo}>{titulo}</p><p className={styles.nota}>{detalle}</p></div>
    </div>
  )
}
const HORIZONTES: readonly HorizonteMotor[] = [24, 72, 240]
const OPCIONES_HORIZONTE = HORIZONTES.map(valor => ({ valor, etiqueta: ETIQUETA_HORIZONTE_MOTOR[valor] }))
const OPCIONES_ESTADO = TIPOS_EXPORTACION_ESCUELAS.map(tipo => ({ value: tipo, label: EXPORTACIONES_ESCUELAS[tipo].titulo }))
const GRAVEDADES: readonly GravedadMapa[] = [1, 2, 3, 4]
const OPCIONES_GRAVEDAD = GRAVEDADES.map(gravedad => ({ value: String(gravedad), label: ETIQUETA_GRAVEDAD[gravedad] }))
const TAMANOS_PAGINA = [25, 50, 100]

function textoCelda(valor: unknown, clave: string): string {
  if (valor === null || valor === undefined || valor === '') return 'Sin dato'
  if (clave === 'ultimaNovedad' && typeof valor === 'string') {
    const fecha = new Date(valor)
    if (Number.isFinite(fecha.getTime())) return formatoFechaRegion().format(fecha)
  }
  return String(valor)
}

export function VistaExportar() {
  const [estados, setEstados] = useState<TipoExportacionEscuelas[]>([])
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [direcciones, setDirecciones] = useState<string[]>([])
  const [gravedades, setGravedades] = useState<string[]>([])
  const [horizonte, setHorizonte] = useState<HorizonteMotor>(72)
  const [pagina, setPagina] = useState(1)
  const [tamanoPagina, setTamanoPagina] = useState(25)
  const [orden, setOrden] = useState<SortState | null>(null)
  const [descargando, setDescargando] = useState(false)
  const [dialogoDescarga, setDialogoDescarga] = useState(false)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)

  const filtros: FiltrosExportacion = {
    departamentos,
    direcciones: direcciones.map(Number),
    gravedades: gravedades.map(valor => Number(valor) as GravedadMapa),
  }
  const hayFiltros = estados.length > 0 || departamentos.length > 0 || direcciones.length > 0 || gravedades.length > 0
  const incluyeRiesgo = estados.includes('en-riesgo')
  const consulta = { estados, filtros, horizonte, orden }
  const urlDescarga = urlExportacionEscuelas({ ...consulta, formato: 'xlsx' })
  const urlPrevia = urlExportacionEscuelas({ ...consulta, formato: 'json', pagina, tamanoPagina })
  const { previa, cargando, error: errorPrevia, reintentar } = usePrevia(urlPrevia)
  const columnas = useMemo<DataColumn<Record<string, unknown>>[]>(() =>
    previa?.columnas.map(c => ({ key: c.clave, label: c.encabezado, render: valor => textoCelda(valor, c.clave) })) ?? [],
  [previa?.columnas])

  function reiniciarPagina() {
    setPagina(1)
    setOrden(null)
  }

  function limpiar() {
    setEstados([])
    setDepartamentos([])
    setDirecciones([])
    setGravedades([])
    setHorizonte(72)
    reiniciarPagina()
  }

  async function descargar() {
    setDescargando(true)
    setDialogoDescarga(true)
    setErrorDescarga(null)
    try {
      await descargarExportacion(urlDescarga, nombreArchivoExportacion(estados, new Date()))
    } catch (error) {
      setErrorDescarga(error instanceof Error ? error.message : 'No se pudo descargar el archivo.')
    } finally {
      setDescargando(false)
      setDialogoDescarga(false)
    }
  }

  const totalPaginas = previa?.totalPaginas ?? 0
  const paginaVisible = previa?.pagina ?? pagina
  const inicio = previa && previa.filas.length > 0 ? (previa.pagina - 1) * previa.tamanoPagina + 1 : 0
  const fin = previa ? inicio + previa.filas.length - (inicio > 0 ? 1 : 0) : 0

  return (
    <div className={styles.vista}>
      <header className={styles.encabezado}>
        <h2>Exportar escuelas</h2>
        <p className={styles.nota}>Filtrá el padrón, revisá los resultados y descargá el listado en Excel.</p>
      </header>
      <div className={styles.barra} role="toolbar" aria-label="Filtros de exportación">
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">Estado</span>
          <MultiSelect<TipoExportacionEscuelas>
            ariaLabel="Estado" value={estados} options={OPCIONES_ESTADO} placeholder="Todas las escuelas"
            onChange={valor => { setEstados(valor); reiniciarPagina() }}
          />
        </div>
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">Departamento</span>
          <MultiSelect
            ariaLabel="Departamento" value={departamentos} options={previa?.opciones.departamentos ?? []}
            placeholder={previa ? 'Todos los departamentos' : 'Cargando departamentos…'}
            onChange={valor => { setDepartamentos(valor); reiniciarPagina() }}
          />
        </div>
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">Dirección</span>
          <MultiSelect
            ariaLabel="Dirección" value={direcciones} options={previa?.opciones.direcciones ?? []}
            placeholder={previa ? 'Todas las direcciones' : 'Cargando direcciones…'}
            onChange={valor => { setDirecciones(valor); reiniciarPagina() }}
          />
        </div>
        <div className={`ui-field ${styles.campo}`}>
          <span className="ui-field__label">Gravedad</span>
          <MultiSelect
            ariaLabel="Gravedad" value={gravedades} options={OPCIONES_GRAVEDAD} placeholder="Todas las gravedades"
            onChange={valor => { setGravedades(valor); reiniciarPagina() }}
          />
        </div>
        {incluyeRiesgo ? (
          <Segmentado<HorizonteMotor>
            etiqueta="Horizonte de riesgo" opciones={OPCIONES_HORIZONTE} valor={horizonte}
            onChange={valor => { setHorizonte(valor); reiniciarPagina() }}
          />
        ) : null}
      </div>
      <div className={styles.acciones}>
        <Button type="button" onClick={() => void descargar()} disabled={descargando} aria-busy={descargando || undefined}>
          {descargando ? 'Preparando archivo…' : 'Descargar Excel'}
        </Button>
        {hayFiltros ? <Button type="button" variant="ghost" onClick={limpiar}>Limpiar</Button> : null}
        <span className={styles.nota}>El Excel incluye todas las escuelas que coinciden con los filtros.</span>
      </div>
      {errorDescarga ? <p className={styles.error} role="alert">{errorDescarga}</p> : null}
      <Dialog open={dialogoDescarga} onOpenChange={setDialogoDescarga}>
        <DialogContent className={styles.dialogoCarga}>
          <span className={styles.spinner} aria-hidden="true" />
          <DialogTitle>Preparando Excel</DialogTitle>
          <DialogDescription>Estamos generando el listado completo de escuelas con los filtros seleccionados. La descarga comenzará automáticamente.</DialogDescription>
          <p className={styles.nota}>Podés cerrar esta ventana mientras se prepara el archivo.</p>
        </DialogContent>
      </Dialog>

      <section className={styles.previa} aria-label="Vista previa de escuelas" aria-busy={cargando}>
        {errorPrevia ? (
          <div role="alert" className={styles.error}>
            No se pudo cargar la vista previa. <Button variant="secondary" onClick={reintentar}>Reintentar</Button>
          </div>
        ) : null}
        {cargando ? (
          <div className={styles.cargaVelo}>
            <CargaExportacion titulo={previa ? 'Actualizando resultados' : 'Cargando escuelas'} detalle={`Preparando la página ${pagina} del listado.`} />
          </div>
        ) : null}
        {!errorPrevia && previa ? (
          <>
            <div className={styles.resumen}>
              <div className={styles.totales} role="status">
                <p className={styles.conteo}>{previa.total} {previa.total === 1 ? 'escuela' : 'escuelas'}</p>
                <p className={styles.nota}>Total alumnos: {previa.totalAlumnos.toLocaleString('es-AR')}</p>
              </div>
              <label className={styles.tamano}>
                Filas por página
                <select value={tamanoPagina} disabled={cargando} onChange={evento => {
                  setTamanoPagina(Number(evento.target.value)); setPagina(1)
                }}>
                  {TAMANOS_PAGINA.map(tamano => <option key={tamano} value={tamano}>{tamano}</option>)}
                </select>
              </label>
            </div>
            <fieldset className={styles.tablaWrap} disabled={cargando}>
              <legend className="sr-only">Escuelas que coinciden con los filtros</legend>
              <SortableDataTable
                rows={previa.filas} columns={columnas} rowKey="cue" caption="Escuelas para exportar"
                emptyMessage="Ninguna escuela coincide con estos filtros. Probá cambiar los filtros o limpiarlos."
                sort={orden} manualSorting onSortChange={valor => { setOrden(valor); setPagina(1) }}
              />
            </fieldset>
            <nav className={styles.paginacion} aria-label="Paginación de escuelas">
              <span className={styles.nota}>{inicio}–{fin} de {previa.total}</span>
              <div className={styles.paginas}>
                <Button variant="secondary" disabled={cargando || paginaVisible <= 1} onClick={() => setPagina(paginaVisible - 1)}>Anterior</Button>
                <span>Página {paginaVisible} de {Math.max(1, totalPaginas)}</span>
                <Button variant="secondary" disabled={cargando || paginaVisible >= totalPaginas} onClick={() => setPagina(paginaVisible + 1)}>Siguiente</Button>
              </div>
            </nav>
          </>
        ) : null}
      </section>
    </div>
  )
}
