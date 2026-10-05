'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { agrupar, resumir, type AgruparPor } from '@/lib/infraestructura/mapa/agregar'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { CATEGORIA_META, esCategoria } from '@/lib/infraestructura/categorias'
import type { EscuelaMapaEnriquecida, FiltrosMapa } from '@/lib/infraestructura/mapa/tipos'

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
  if (por === 'departamento') return etiquetaDepartamento(clave)
  if (por === 'categoria' && esCategoria(clave)) return CATEGORIA_META[clave].label
  return clave
}

export function PanelEstadisticas({ escuelas, filtros }: { escuelas: EscuelaMapaEnriquecida[]; filtros: FiltrosMapa }) {
  const [por, setPor] = useState<AgruparPor>('departamento')
  const resumen = resumir(escuelas)
  const filas = agrupar(escuelas, por)

  return (
    <section className="map-est" aria-label="Estadísticas">
      <div className="map-sitact__kpis map-est__kpis" aria-label="Resumen de escuelas">
        <div className="map-sitact__kpi">
          <strong>{FORMATO_NUMERO.format(resumen.conReporte)}</strong>
          <span>Escuelas con situaciones abiertas</span>
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
          <span>Sin clases con asistencia pedagógica</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{FORMATO_NUMERO.format(resumen.sinClasesSinDato)}</strong>
          <span>Sin clases sin dato de asistencia pedagógica</span>
        </div>
      </div>

      <section className="map-est__agrupacion" aria-labelledby="map-est-agrupar-titulo">
        <h3 id="map-est-agrupar-titulo" className="map-sitact__titulo-seccion">Agrupar por</h3>
        <Select value={por} items={Object.fromEntries(OPCIONES_AGRUPACION.map(({ valor, etiqueta }) => [valor, etiqueta]))} onValueChange={(valor) => valor != null && setPor(valor as AgruparPor)}>
          <SelectTrigger aria-label="Agrupar por" />
          <SelectContent>
            {OPCIONES_AGRUPACION.map(({ valor, etiqueta }) => (
              <SelectItem key={valor} value={valor}>{etiqueta}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  <th scope="col">Con situaciones</th>
                  <th scope="col">%</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.clave}>
                    <th scope="row">{etiquetaFila(fila.clave, por)}</th>
                    <td className="map-est__numero">{FORMATO_NUMERO.format(fila.escuelas)}</td>
                    <td className="map-est__numero">{FORMATO_NUMERO.format(fila.afectadas)}</td>
                    <td className="map-est__numero">{fila.porcentaje}%</td>
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
        <EvolucionPanel filtros={filtros} />
      </section>
    </section>
  )
}
