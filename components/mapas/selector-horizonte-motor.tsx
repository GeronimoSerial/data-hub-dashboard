'use client'

import type { JSX } from 'react'
import { Segmentado } from '@/components/mapas/segmentado'
import { etiquetaHorizonteMotor, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { useTextos } from '@/lib/i18n/idioma-provider'

const HORIZONTES: HorizonteMotor[] = [24, 72, 240]

export interface SelectorHorizonteMotorProps {
  horizonte: HorizonteMotor
  /** Horizontes con datos del motor. Vacío mientras no llegaron: no se deshabilita ninguno. */
  disponibles: HorizonteMotor[]
  onHorizonte: (horizonte: HorizonteMotor) => void
}

export function SelectorHorizonteMotor({ horizonte, disponibles, onHorizonte }: SelectorHorizonteMotorProps): JSX.Element {
  const t = useTextos()
  const hayMotor = disponibles.length > 0
  const opciones = HORIZONTES.map((valor) => ({
    valor,
    etiqueta: etiquetaHorizonteMotor(valor, t),
    deshabilitada: hayMotor && !disponibles.includes(valor),
    titulo: t.radarResto.horizonte.sinDatos,
  }))
  return <Segmentado etiqueta="Horizonte" opciones={opciones} valor={horizonte} onChange={onHorizonte} columnas={3} />
}
