'use client'

import { useEffect, useState, type JSX } from 'react'
import { EncabezadoParte, type EscuelaEncabezado, TITULO_PROGRAMA_COMPLETO } from '@/components/infraestructura/encabezado-parte'
import { ReporteInicialForm } from '@/components/infraestructura/reporte-inicial-form'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'

export function NuevoParteContenido({ cue, escuela, turnos, motivos }: {
  cue: string
  escuela: EscuelaEncabezado
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
}): JSX.Element {
  const [guardado, setGuardado] = useState(false)
  const pantalla = guardado ? 'Parte registrado' : 'Cargar una situación'

  useEffect(() => {
    document.title = `${pantalla} · ${TITULO_PROGRAMA_COMPLETO}`
  }, [pantalla])

  return (
    <>
      <EncabezadoParte
        pantalla={pantalla}
        escuela={escuela}
        pantallaOculta={!guardado}
      />
      <ReporteInicialForm cue={cue} turnos={turnos} motivos={motivos} onGuardadoChange={setGuardado} />
    </>
  )
}
