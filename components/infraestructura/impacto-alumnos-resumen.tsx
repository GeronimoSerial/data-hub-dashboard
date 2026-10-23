import { textoImpactoAlumnos, type ImpactoAlumnos } from '@/lib/infraestructura/prioridad-alumnos'

export function ImpactoAlumnosResumen({ impacto }: { impacto?: ImpactoAlumnos }) {
  return <span>{impacto ? textoImpactoAlumnos(impacto) : 'Sin datos para calcular la prioridad'}</span>
}
