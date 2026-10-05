'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Segmentado } from '@/components/mapas/segmentado'
import { agrupar, resumir, type AgruparPor } from '@/lib/infraestructura/mapa/agregar'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'

// Los gráficos se cargan al abrir Estadísticas para no sumar su peso al mapa inicial.
const EvolucionPanel = dynamic(
  () => import('@/components/infraestructura/evolucion-panel').then((modulo) => modulo.EvolucionPanel),
  { ssr: false, loading: () => <p className="map-hint">Cargando…</p> },
)

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')

const OPCIONES_AGRUPACION: { valor: AgruparPor; etiqueta: string }[] = [
  { valor: 'departamento', etiqueta: 'Departamento' },
  { valor: 'nivel', etiqueta: 'Nivel' },
  { valor: 'gravedad', etiqueta: 'Gravedad' },
  { valor: 'categoria', etiqueta: 'Categoría' },
]

const ETIQUETAS_AGRUPACION: Record<AgruparPor, string> = {
  departamento: 'Departamento',
  nivel: 'Nivel',
  gravedad: 'Gravedad',
  categoria: 'Categoría',
}

function etiquetaFila(clave: string, por: AgruparPor): string {
  return por === 'departamento' ? etiquetaDepartamento(clave) : clave
}

export function PanelEstadisticas({ escuelas }: { escuelas: EscuelaMapaEnriquecida[] }) {
  const [por, setPor] = useState<AgruparPor>('departamento')
  const resumen = resumir(escuelas)
  const filas = agrupar(escuelas, por)

  return (
    <section className="map-est" aria-labelledby="map-est-titulo">
      <header className="map-sitact__encabezado">
        <h2 id="map-est-titulo">Estadísticas</h2>
        <span className="map-sitact__atenuado">Según los filtros activos</span>
      </header>

      <div className="map-sitact__kpis map-est__kpis" aria-label="Resumen de escuelas">
        <div className="map-sitact__kpi">
          <strong>{FORMATO_NUMERO.format(resumen.conReporte)}</strong>
          <span>Escuelas afectadas</span>
        </div>
        <div className="map-sitact__kpi map-sitact__kpi--resaltado">
          <strong>{FORMATO_NUMERO.format(resumen.sinClases)}</strong>
          <span>Sin clases</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{FORMATO_NUMERO.format(resumen.alumnosSinClases)}</strong>
          <span>Alumnos sin clases</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{FORMATO_NUMERO.format(resumen.sinActualizar)}</strong>
          <span>Sin actualizar</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{FORMATO_NUMERO.format(resumen.sinClasesConApoyo)} / {FORMATO_NUMERO.format(resumen.sinClases)}</strong>
          <span>Sin clases con apoyo pedagógico</span>
        </div>
      </div>

      <section className="map-est__agrupacion" aria-labelledby="map-est-agrupar-titulo">
        <h3 id="map-est-agrupar-titulo" className="map-sitact__titulo-seccion">Agrupar por</h3>
        <Segmentado
          etiqueta="Agrupar por"
          opciones={OPCIONES_AGRUPACION}
          valor={por}
          onChange={setPor}
        />
      </section>

      {escuelas.length === 0 ? (
        <p className="map-hint">No hay escuelas con estos filtros.</p>
      ) : filas.length === 0 ? (
        <p className="map-hint">No hay niveles cargados en el padrón.</p>
      ) : (
        <>
          <div className="ui-table-wrap map-est__tabla-wrap">
            <table className="ui-table map-est__tabla">
              <thead>
                <tr>
                  <th scope="col">{ETIQUETAS_AGRUPACION[por]}</th>
                  <th scope="col">Escuelas</th>
                  <th scope="col">Afectadas</th>
                  <th scope="col">%</th>
                  <th scope="col">Alumnos sin clases</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.clave}>
                    <th scope="row">{etiquetaFila(fila.clave, por)}</th>
                    <td className="map-est__numero">{FORMATO_NUMERO.format(fila.escuelas)}</td>
                    <td className="map-est__numero">{FORMATO_NUMERO.format(fila.afectadas)}</td>
                    <td className="map-est__numero">
                      <span>{fila.porcentaje}%</span>
                      <span className="map-est__barra" aria-hidden="true">
                        <span style={{ width: `${fila.porcentaje}%` }} />
                      </span>
                    </td>
                    <td className="map-est__numero">{FORMATO_NUMERO.format(fila.alumnosSinClases)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {por === 'nivel' && (
            <p className="map-sitact__atenuado">Una escuela puede tener más de un nivel.</p>
          )}
        </>
      )}

      <section className="map-est__evolucion" aria-labelledby="map-est-evolucion-titulo">
        <h3 id="map-est-evolucion-titulo" className="map-sitact__titulo-seccion">Evolución en el tiempo</h3>
        <EvolucionPanel />
      </section>
    </section>
  )
}
