// Cobertura de traducción: cada mensaje en español que producen las reglas de
// consistencia tiene que existir en el diccionario `consistencia` del español.
// Una regla nueva sin texto traducido hace fallar esta prueba.
import { describe, expect, it } from 'vitest'
import { evaluarConsistenciaParte, type RespuestasConsistencia } from './consistencia-parte'
import { es } from '@/lib/i18n/diccionarios/es'

const AHORA = new Date(2026, 9, 17, 12, 0, 0)

// Valores de cada respuesta que alguna regla distingue. Cubrir todos los
// valores de cada campo alcanza todas las combinaciones que leen las reglas.
const CATEGORIAS = [null, 'establecimiento', 'alumnos'] as const
const MOTIVOS = [
  'evacuacion-preventiva',
  'inundacion',
  'inaccesibilidad-docentes',
  'sin-energia-o-agua',
  'tormenta-severa',
  'otro-establecimiento',
  'ninguno',
] as const
const SEVERIDADES = [null, 'Baja', 'Media', 'Crítica'] as const
const JUSTIFICACIONES = [null, 'mas_personas', 'se_prolonga'] as const
const DESCRIPCIONES = ['', 'Texto libre'] as const
const ALCANCES = [null, { tipo: 'toda' }, { tipo: 'algunas', secciones: 1 }, { tipo: 'algunas', secciones: 2 }] as const
const CLASES = [null, 'normal', 'suspendido'] as const
const EDIFICIOS = [null, 'habitual', 'parcial', 'evacuado', 'centro_evacuados', 'sin_clases'] as const
const ASISTENCIAS = [true, false] as const
const VIGENCIAS = [null, { modo: 'ahora' }, { modo: 'otro', fecha: '2026-10-01', hora: '08:00' }] as const

describe('cobertura de traducción de las reglas de consistencia', () => {
  it('cada mensaje que producen las reglas tiene entrada en el diccionario español', () => {
    const producidos = new Set<string>()
    for (const categoria of CATEGORIAS)
      for (const motivoId of MOTIVOS)
        for (const severidad of SEVERIDADES)
          for (const justificacionCritica of JUSTIFICACIONES)
            for (const descripcion of DESCRIPCIONES)
              for (const alcance of ALCANCES)
                for (const clases of CLASES)
                  for (const edificio of EDIFICIOS)
                    for (const asistenciaBrinda of ASISTENCIAS)
                      for (const vigencia of VIGENCIAS) {
                        const respuestas: RespuestasConsistencia = {
                          categoria,
                          motivoId,
                          severidad,
                          justificacionCritica,
                          descripcion,
                          alcance,
                          clases,
                          edificio,
                          asistenciaBrinda,
                          vigencia,
                        }
                        const resultado = evaluarConsistenciaParte(respuestas, AHORA)
                        for (const regla of [...resultado.bloqueos, ...resultado.advertencias]) producidos.add(regla.mensaje)
                      }

    const traducidos = new Set<string>(Object.values(es.parteComunTextos.consistencia.mensajes))
    const sinTraduccion = [...producidos].filter((mensaje) => !traducidos.has(mensaje))

    expect(producidos.size).toBeGreaterThan(0)
    expect(sinTraduccion).toEqual([])
  }, 60000)
})
