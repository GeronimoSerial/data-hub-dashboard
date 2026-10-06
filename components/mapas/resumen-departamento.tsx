import type { TotalesDepartamento } from '@/lib/infraestructura/totales-mapa'

type TotalesResumenDepartamento = Pick<
  TotalesDepartamento,
  'departamentoOriginal' | 'totalEscuelas' | 'escuelasAfectadas' | 'porcentajeAfectadas'
>

export interface ResumenDepartamentoProps {
  nombre: string
  totales: TotalesResumenDepartamento | null
  onQuitar: () => void
}

export function ResumenDepartamento({ nombre, totales, onQuitar }: ResumenDepartamentoProps) {
  return (
    <section className="map-sitact__resumen-depto" aria-label="Departamento seleccionado">
      <h2>Departamento: <strong>{nombre}</strong></h2>
      {totales && (
        <p>
          <strong>{totales.totalEscuelas}</strong> escuelas ·{' '}
          <strong>{totales.escuelasAfectadas}</strong> con situaciones abiertas ·{' '}
          <strong>{totales.porcentajeAfectadas}%</strong>
        </p>
      )}
      <button type="button" onClick={onQuitar}>Quitar filtro</button>
    </section>
  )
}
