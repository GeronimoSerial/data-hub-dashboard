import { describe, expect, it } from 'vitest'
import { textos } from '@/lib/i18n'
import { traducirMotivo } from './traducir-motivo'

const es = textos('es').situacion
const pt = textos('pt').situacion

describe('traducirMotivo: es (Corrientes) is identity', () => {
  it.each([
    'Publicado hace 3 h; se espera cada 6 h.',
    'Falló la última corrida (intento 2).',
    'Vence a las 6 h.',
    'Dato de hace 2 h; vence a las 1 h.',
    'Última corrida completada con 120 filas; se esperan al menos 100.',
    'Huecos en la serie IMERG de hoy: 1,5 h sin gránulos entre 03:00 y 04:30.',
    'Huecos en la serie IMERG de hoy: 2 huecos; el mayor, 3 h sin gránulos entre 01:00 y 04:00.',
    'Cadena de datos verificada a las 10:30.',
    'Nunca corrió.',
    'Texto libre de la fuente.',
  ])('%s', (motivo) => {
    expect(traducirMotivo(motivo, es)).toBe(motivo)
  })
})

describe('traducirMotivo: pt (Manaus) translates templates and keeps data', () => {
  it.each([
    ['Publicado hace 3 h; se espera cada 6 h.', 'Publicado há 3 h; espera-se a cada 6 h.'],
    ['Falló la última corrida (intento 2).', 'Falhou a última execução (tentativa 2).'],
    ['Vence a las 6 h.', 'Vence em 6 h.'],
    ['Dato de hace 2 días; vence a las 1 h.', 'Dado de há 2 dias; vence em 1 h.'],
    ['Publicado hace 3 días (vigencia esperada: 30 días).', 'Publicado há 3 dias (vigência esperada: 30 dias).'],
    [
      'Última corrida completada con 120 filas; se esperan al menos 100.',
      'Última execução concluída com 120 linhas; espera-se pelo menos 100.',
    ],
    [
      'Huecos en la serie IMERG de hoy: 1,5 h sin gránulos entre 03:00 y 04:30.',
      'Lacunas na série IMERG de hoje: 1,5 h sem grânulos entre 03:00 e 04:30.',
    ],
    [
      'Huecos en la serie IMERG de hoy: 2 huecos; el mayor, 3 h sin gránulos entre 01:00 y 04:00.',
      'Lacunas na série IMERG de hoje: 2 lacunas; a maior, 3 h sem grânulos entre 01:00 e 04:00.',
    ],
    ['Cadena de datos verificada a las 10:30.', 'Cadeia de dados verificada às 10:30.'],
    ['Nunca corrió.', 'Nunca rodou.'],
    ['Texto libre de la fuente.', 'Texto libre de la fuente.'],
  ])('%s', (motivo, esperado) => {
    expect(traducirMotivo(motivo, pt)).toBe(esperado)
  })
})
