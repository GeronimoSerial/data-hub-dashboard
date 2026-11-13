import { referencia, versionReferencia } from '@/lib/infraestructura/datasets/memoria'

// Catálogo versionado de estaciones hidrométricas de ANA en el bbox de Manaos
// (dataset `estacoes-ana`, generado por scripts/estacoes-ana.mjs). Los umbrales
// (`alertaM`, `evacuacionM`) sólo existen donde hay una escala oficial conocida.
export type EstacionAna = {
  estacionId: string
  nome: string
  rio: string | null
  lat: number
  lon: number
  telemetrica: boolean
  operando: boolean
  responsavel: string | null
  escalaInicio: string | null
  telemInicio: string | null
  ultimaAtualizacao: string | null
  alertaM: number | null
  evacuacionM: number | null
  fuente: string
  consultadaEl: string
}

export function obtenerEstacionesAna(): readonly EstacionAna[] {
  return referencia<EstacionAna[]>('estacoes-ana')
}

export function obtenerVersionCatalogoAna(): string {
  return versionReferencia('estacoes-ana')
}

// Estaciones cuyo nivel se sincroniza: telemétricas y en operación.
export function estacionesAnaTelemetricas(): readonly EstacionAna[] {
  return obtenerEstacionesAna().filter((e) => e.telemetrica && e.operando)
}
