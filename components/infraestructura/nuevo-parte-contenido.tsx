'use client'

import { useEffect, useState, type JSX } from 'react'
import { EncabezadoParte, type EscuelaEncabezado, TITULO_PROGRAMA_COMPLETO } from '@/components/infraestructura/encabezado-parte'
import { ReporteInicialForm } from '@/components/infraestructura/reporte-inicial-form'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import type { CarreraElegible } from '@/lib/infraestructura/parte/instituto-ui'
import { abrirAlmacenParte } from '@/lib/infraestructura/parte/almacen-indexeddb'
import type { ContextoReporte } from '@/lib/infraestructura/reportes-offline-contratos'

export function NuevoParteContenido({ cue, escuela, turnos, motivos, carreras }: {
  cue: string
  escuela: EscuelaEncabezado
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
  carreras?: CarreraElegible[]
}): JSX.Element {
  const [guardado, setGuardado] = useState(false)
  const pantalla = guardado ? 'Parte registrado' : 'Cargar una situación'

  useEffect(() => {
    document.title = `${pantalla} · ${TITULO_PROGRAMA_COMPLETO}`
  }, [pantalla])

  useEffect(() => {
    let vigente = true
    const draftId = `parte-inicial:${cue}`
    const contexto: ContextoReporte & {
      formulario: { escuela: EscuelaEncabezado; turnos: TurnoContexto[]; motivos: MotivoRow[] }
    } = {
      version: 1,
      draftId,
      cue,
      flujo: 'inicial',
      escuela: { nombre: escuela.nombre, cue: escuela.cueAnexo, departamento: escuela.departamento ?? '' },
      turnos: turnos.map(({ turno }) => turno),
      motivos: motivos.map(({ id, nombre, categoria }) => ({ id, nombre, categoria })),
      formulario: { escuela, turnos, motivos, ...(carreras ? { carreras } : {}) },
    }
    void abrirAlmacenParte().then(async (almacen) => {
      try {
        if (vigente) await almacen.guardarContexto(contexto)
      } finally {
        almacen.cerrar()
      }
    }).catch(() => undefined)
    return () => { vigente = false }
  }, [cue, escuela, turnos, motivos, carreras])

  return (
    <>
      <EncabezadoParte
        pantalla={pantalla}
        escuela={escuela}
        pantallaOculta={!guardado}
      />
      <ReporteInicialForm cue={cue} turnos={turnos} motivos={motivos} carreras={carreras} onGuardadoChange={setGuardado} />
    </>
  )
}
