import { describe, expect, it } from 'vitest'
import { mensajesDeBloqueo, respuestasDeSituacion, respuestasNuevaDeActualizacion } from '@/components/infraestructura/actualizar/consistencia-actualizacion'
import { evaluarConsistenciaParte, type EstadoClasesConsistencia, type EstadoEdificioConsistencia, type RespuestasConsistencia } from './consistencia-parte'
import { primerBloqueoParte } from './consistencia-parte-servidor'
import type { Severidad } from './validacion'

// Paridad cliente/servidor: el mismo caso de un parte de establecimiento tiene
// que dar el mismo bloqueo en el asistente (actualización) y en la ruta.

interface Caso {
  nombre: string
  motivoId: string
  edificio: EstadoEdificioConsistencia
  clases: EstadoClasesConsistencia
  severidad: Severidad
  descripcion: string
  seccionesCantidad: number
}

const CASOS: Caso[] = [
  { nombre: 'evacuación preventiva con edificio habitual', motivoId: 'evacuacion-preventiva', edificio: 'habitual', clases: 'normal', severidad: 'Crítica', descripcion: '', seccionesCantidad: 2 },
  { nombre: 'evacuación preventiva con centro de evacuados', motivoId: 'evacuacion-preventiva', edificio: 'centro_evacuados', clases: 'suspendido', severidad: 'Crítica', descripcion: '', seccionesCantidad: 2 },
  { nombre: 'inundación con centro de evacuados', motivoId: 'inundacion', edificio: 'centro_evacuados', clases: 'suspendido', severidad: 'Crítica', descripcion: '', seccionesCantidad: 2 },
  { nombre: 'inaccesibilidad de docentes con edificio evacuado', motivoId: 'inaccesibilidad-docentes', edificio: 'evacuado', clases: 'suspendido', severidad: 'Alta', descripcion: '', seccionesCantidad: 2 },
  { nombre: 'edificio evacuado con clases normales', motivoId: 'inundacion', edificio: 'evacuado', clases: 'normal', severidad: 'Alta', descripcion: '', seccionesCantidad: 2 },
  { nombre: '"Otro" sin descripción', motivoId: 'otro-establecimiento', edificio: 'parcial', clases: 'suspendido', severidad: 'Media', descripcion: '', seccionesCantidad: 1 },
  { nombre: '"Otro" con descripción de sólo espacios', motivoId: 'otro-establecimiento', edificio: 'parcial', clases: 'suspendido', severidad: 'Media', descripcion: '   ', seccionesCantidad: 1 },
  { nombre: '"Otro" con descripción', motivoId: 'otro-establecimiento', edificio: 'parcial', clases: 'suspendido', severidad: 'Media', descripcion: 'Corte de calle', seccionesCantidad: 1 },
  { nombre: 'combinación permitida', motivoId: 'sin-energia-o-agua', edificio: 'parcial', clases: 'suspendido', severidad: 'Media', descripcion: '', seccionesCantidad: 3 },
  { nombre: 'sólo advertencias (no bloquea)', motivoId: 'inundacion', edificio: 'habitual', clases: 'normal', severidad: 'Crítica', descripcion: '', seccionesCantidad: 1 },
]

function verdictoCliente(caso: Caso): string | null {
  const respuestas: RespuestasConsistencia = respuestasDeSituacion({
    categoria: 'establecimiento',
    motivoId: caso.motivoId,
    severidad: caso.severidad,
    descripcion: caso.descripcion,
    alcance: caso.seccionesCantidad > 0 ? { tipo: 'algunas', secciones: caso.seccionesCantidad } : null,
    clases: caso.clases,
    edificio: caso.edificio,
  })
  return mensajesDeBloqueo(respuestas, { descripcion: true })[0] ?? null
}

function verdictoServidor(caso: Caso): string | null {
  const regla = primerBloqueoParte(
    [{
      categoria: 'establecimiento',
      motivoId: caso.motivoId,
      severidad: caso.severidad,
      descripcion: caso.descripcion,
      seccionesCantidad: caso.seccionesCantidad,
    }],
    { estadoEstablecimiento: caso.edificio, servicioEstado: caso.clases, asistenciaBrinda: true },
    new Date(2026, 9, 17, 12, 0, 0),
  )
  return regla?.mensaje ?? null
}

// Alumnos: el servidor anula edificio, clases y asistencia de la afectación nueva;
// la nueva evaluada en el cliente tiene que aplicar la misma exención.
const CASOS_ALUMNOS: Caso[] = [
  { nombre: 'alumnos con edificio evacuado y clases normales', motivoId: 'anegamiento', edificio: 'evacuado', clases: 'normal', severidad: 'Alta', descripcion: '', seccionesCantidad: 2 },
  { nombre: 'alumnos con centro de evacuados y clases suspendidas', motivoId: 'anegamiento', edificio: 'centro_evacuados', clases: 'suspendido', severidad: 'Crítica', descripcion: '', seccionesCantidad: 2 },
]

function verdictoClienteAlumnos(caso: Caso): string | null {
  const respuestas: RespuestasConsistencia = respuestasNuevaDeActualizacion({
    categoria: 'alumnos',
    motivoId: caso.motivoId,
    severidad: caso.severidad,
    descripcion: caso.descripcion,
    alcance: { tipo: 'algunas', secciones: caso.seccionesCantidad },
    clases: caso.clases,
    edificio: caso.edificio,
  })
  return mensajesDeBloqueo(respuestas, { descripcion: true })[0] ?? null
}

function verdictoServidorAlumnos(caso: Caso): string | null {
  const regla = primerBloqueoParte(
    [{ categoria: 'alumnos', motivoId: caso.motivoId, severidad: caso.severidad, descripcion: caso.descripcion, seccionesCantidad: caso.seccionesCantidad }],
    { estadoEstablecimiento: caso.edificio, servicioEstado: caso.clases, asistenciaBrinda: true },
    new Date(2026, 9, 17, 12, 0, 0),
  )
  return regla?.mensaje ?? null
}

describe('paridad cliente/servidor de bloqueos', () => {
  it.each(CASOS)('$nombre: cliente y servidor dan el mismo veredicto', (caso) => {
    expect(verdictoCliente(caso)).toBe(verdictoServidor(caso))
  })

  it.each(CASOS_ALUMNOS)('$nombre: la exención de alumnos es la del servidor', (caso) => {
    expect(verdictoServidorAlumnos(caso)).toBeNull()
    expect(verdictoClienteAlumnos(caso)).toBe(verdictoServidorAlumnos(caso))
  })

  it('el veredicto compartido es el primer bloqueo del módulo común', () => {
    for (const caso of CASOS) {
      const esperado = evaluarConsistenciaParte({
        categoria: 'establecimiento',
        motivoId: caso.motivoId,
        severidad: caso.severidad,
        justificacionCritica: null,
        descripcion: caso.descripcion.trim(),
        alcance: null,
        clases: caso.clases,
        edificio: caso.edificio,
        asistenciaBrinda: null,
        vigencia: null,
      }).bloqueos[0]?.mensaje ?? null
      expect(verdictoCliente(caso), caso.nombre).toBe(esperado)
    }
  })
})
