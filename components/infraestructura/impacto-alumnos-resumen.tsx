'use client'

import { textoImpactoAlumnos, type ImpactoAlumnos } from '@/lib/infraestructura/prioridad-alumnos'
import { useTextos } from '@/lib/i18n/idioma-provider'

export function ImpactoAlumnosResumen({ impacto }: { impacto?: ImpactoAlumnos }) {
  const dic = useTextos()
  const t = dic.fichaPanorama
  return <span>{impacto ? textoImpactoAlumnos(impacto, dic) : t.impacto.sinDatos}</span>
}
