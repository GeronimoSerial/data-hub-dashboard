import { describe, expect, it } from 'vitest'
import { textos } from '@/lib/i18n'
import { traducirPlantilla } from './traducir-plantillas'

const es = textos('es').situacion
const pt = textos('pt').situacion

const LINEAS_ES = [
  'Las escuelas en riesgo alto o muy alto subieron de 3 a 5 (2 más que en el corte anterior).',
  'Las escuelas en riesgo alto o muy alto bajaron de 5 a 3 (2 menos que en el corte anterior).',
  'Sin cambios significativos respecto del corte anterior.',
  'No hay conteos del corte anterior para comparar.',
  'Primer resumen del día; todavía no hay un corte anterior para comparar.',
  'Cobertura con evidencia: 40 de 50 escuelas procesadas (80%).',
  'Cobertura con evidencia: 40 de 50 escuelas procesadas (80%). Antes: 35.',
  'Cobertura con evidencia: sin dato.',
  'Sin evidencia válida: 10 escuelas.',
  'Sin evidencia válida: sin dato.',
  'Corte publicado el 2026-11-10.',
  'Corte publicado el 2026-11-10. Corte anterior: 2026-11-09.',
  'Episodio abierto en Goya (3 escuelas afectadas)',
  'Episodio cerrado en Goya',
  'Escuelas en riesgo alto o muy alto subieron de 3 a 5',
  'Escuelas en riesgo alto o muy alto bajaron de 5 a 3',
  'Actualización del parte',
  'Texto libre de la fuente, sin plantilla.',
]

describe('traducirPlantilla: es (Corrientes) is identity', () => {
  it.each(LINEAS_ES)('%s', (linea) => {
    expect(traducirPlantilla(linea, es)).toBe(linea)
  })
})

describe('traducirPlantilla: pt (Manaus) translates templates and keeps data', () => {
  it.each([
    [
      'Las escuelas en riesgo alto o muy alto subieron de 3 a 5 (2 más que en el corte anterior).',
      'As escolas em risco alto ou muito alto subiram de 3 para 5 (2 a mais que no corte anterior).',
    ],
    [
      'Las escuelas en riesgo alto o muy alto bajaron de 5 a 3 (2 menos que en el corte anterior).',
      'As escolas em risco alto ou muito alto baixaram de 5 para 3 (2 a menos que no corte anterior).',
    ],
    ['Sin cambios significativos respecto del corte anterior.', 'Sem mudanças significativas em relação ao corte anterior.'],
    ['No hay conteos del corte anterior para comparar.', 'Não há contagens do corte anterior para comparar.'],
    [
      'Primer resumen del día; todavía no hay un corte anterior para comparar.',
      'Primeiro resumo do dia; ainda não há um corte anterior para comparar.',
    ],
    [
      'Cobertura con evidencia: 40 de 50 escuelas procesadas (80%).',
      'Cobertura com evidência: 40 de 50 escolas processadas (80%).',
    ],
    [
      'Cobertura con evidencia: 40 de 50 escuelas procesadas (80%). Antes: 35.',
      'Cobertura com evidência: 40 de 50 escolas processadas (80%). Antes: 35.',
    ],
    ['Cobertura con evidencia: sin dato.', 'Cobertura com evidência: sem dado.'],
    ['Sin evidencia válida: 10 escuelas.', 'Sem evidência válida: 10 escolas.'],
    ['Sin evidencia válida: sin dato.', 'Sem evidência válida: sem dado.'],
    ['Corte publicado el 2026-11-10.', 'Corte publicado em 2026-11-10.'],
    [
      'Corte publicado el 2026-11-10. Corte anterior: 2026-11-09.',
      'Corte publicado em 2026-11-10. Corte anterior: 2026-11-09.',
    ],
    ['Episodio abierto en Goya (3 escuelas afectadas)', 'Episódio aberto em Goya (3 escolas afetadas)'],
    ['Episodio cerrado en Goya', 'Episódio encerrado em Goya'],
    [
      'Escuelas en riesgo alto o muy alto subieron de 3 a 5',
      'Escolas em risco alto ou muito alto subiram de 3 para 5',
    ],
    [
      'Escuelas en riesgo alto o muy alto bajaron de 5 a 3',
      'Escolas em risco alto ou muito alto baixaram de 5 para 3',
    ],
    ['Actualización del parte', 'Atualização do relatório'],
    ['Texto libre de la fuente, sin plantilla.', 'Texto libre de la fuente, sin plantilla.'],
  ])('%s', (linea, esperado) => {
    expect(traducirPlantilla(linea, pt)).toBe(esperado)
  })
})
