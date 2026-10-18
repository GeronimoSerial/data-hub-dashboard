'use client'

import type { JSX } from 'react'
import { Segmentado } from '@/components/mapas/segmentado'
import { ETIQUETA_HORIZONTE_MOTOR, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'

const HORIZONTES: HorizonteMotor[] = [24, 72, 240]

export interface SelectorHorizonteMotorProps {
  horizonte: HorizonteMotor
  /** Horizontes con datos del motor. Vacío mientras no llegaron: no se deshabilita ninguno. */
  disponibles: HorizonteMotor[]
  onHorizonte: (horizonte: HorizonteMotor) => void
}

export function SelectorHorizonteMotor({ horizonte, disponibles, onHorizonte }: SelectorHorizonteMotorProps): JSX.Element {
  const hayMotor = disponibles.length > 0
  const opciones = HORIZONTES.map((valor) => ({
    valor,
    etiqueta: ETIQUETA_HORIZONTE_MOTOR[valor],
    deshabilitada: hayMotor && !disponibles.includes(valor),
    titulo: 'Sin datos para este horizonte',
  }))
  return <Segmentado etiqueta="Horizonte" opciones={opciones} valor={horizonte} onChange={onHorizonte} columnas={3} />
}
