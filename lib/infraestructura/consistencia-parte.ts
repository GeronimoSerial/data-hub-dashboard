import type { CategoriaAfectacion } from './categorias'
import type { JustificacionCritica } from './justificacion-critica'
import { resolverVigencia, type EleccionVigencia } from './vigencia-eleccion'
import { SEVERIDADES, type Severidad } from './validacion'

// Reglas de consistencia del parte. Módulo puro (sin React ni base de datos):
// lo usan el asistente de carga (para deshabilitar opciones y mostrar avisos)
// y la ruta del servidor (para rechazar combinaciones bloqueadas con 400).

export type EstadoEdificioConsistencia = 'habitual' | 'parcial' | 'evacuado' | 'centro_evacuados' | 'sin_clases'
export type EstadoClasesConsistencia = 'normal' | 'suspendido'
export type AlcanceSecciones = { tipo: 'toda' } | { tipo: 'algunas'; secciones: number }

export interface RespuestasConsistencia {
  categoria: CategoriaAfectacion | null
  motivoId: string | null
  severidad: Severidad | null
  justificacionCritica: JustificacionCritica | null
  descripcion: string
  alcance: AlcanceSecciones | null
  clases: EstadoClasesConsistencia | null
  edificio: EstadoEdificioConsistencia | null
  asistenciaBrinda: boolean | null
  vigencia: EleccionVigencia | null
}

export type CampoConsistencia =
  | 'motivo'
  | 'severidad'
  | 'justificacionCritica'
  | 'alcance'
  | 'edificio'
  | 'clases'
  | 'asistencia'
  | 'vigencia'
  | 'descripcion'

export type CampoOpcion = 'motivo' | 'edificio' | 'clases'

/** Cambio de una opción que resuelve la advertencia, cuando hay uno claro. */
export interface Sugerencia {
  campo: CampoOpcion
  valor: string
  etiqueta: string
}

export interface Regla {
  codigo: string
  campo: CampoConsistencia
  mensaje: string
  sugerencia?: Sugerencia
  /**
   * Respuestas con las que se evaluó la regla. Si cambian, una advertencia que
   * se descartó vuelve a mostrarse.
   */
  firma?: string
}

export interface ResultadoConsistencia {
  bloqueos: Regla[]
  advertencias: Regla[]
}

// Ids de la semilla de motivos (ver motivos.ts). Se repiten acá porque ese
// módulo arrastra la base de datos; el test verifica que coincidan.
const MOTIVO = {
  inundacion: 'inundacion',
  tormenta: 'tormenta-severa',
  sinEnergia: 'sin-energia-o-agua',
  evacuacion: 'evacuacion-preventiva',
  inaccesibilidad: 'inaccesibilidad-docentes',
} as const

const MOTIVOS_OTRO = ['otro-establecimiento', 'otro-alumnos'] as const

const SEVERIDAD_SUGERIDA_POR_MOTIVO: Partial<Record<string, Severidad>> = {
  inundacion: 'Crítica',
  'tormenta-severa': 'Alta',
  'sin-energia-o-agua': 'Media',
  'evacuacion-preventiva': 'Crítica',
  'inaccesibilidad-docentes': 'Alta',
  anegamiento: 'Alta',
  'acceso-interrumpido': 'Alta',
}

const DIAS_VIGENCIA_ANTIGUA = 7
const MS_POR_DIA = 24 * 60 * 60 * 1000

interface DefinicionRegla {
  codigo: string
  campo: CampoConsistencia
  mensaje: string
  sugerencia?: Sugerencia
  cuando: (r: RespuestasConsistencia, ahora: Date) => boolean
}

const CAMBIAR_A_PARCIAL: Sugerencia = { campo: 'edificio', valor: 'parcial', etiqueta: 'Cambiar a Uso parcial' }
const CLASES_SUSPENDIDAS: Sugerencia = { campo: 'clases', valor: 'suspendido', etiqueta: 'Cambiar a Clases suspendidas' }
const CAMBIAR_A_SIN_CLASES: Sugerencia = { campo: 'edificio', valor: 'sin_clases', etiqueta: 'Cambiar a Sin clases' }

const BLOQUEOS: DefinicionRegla[] = [
  {
    codigo: 'evacuacion-preventiva-habitual',
    campo: 'edificio',
    mensaje: 'Con una evacuación preventiva el edificio no puede figurar como habitual.',
    cuando: (r) => r.motivoId === MOTIVO.evacuacion && r.edificio === 'habitual',
  },
  {
    codigo: 'evacuacion-preventiva-centro-evacuados',
    campo: 'edificio',
    mensaje: 'Con una evacuación preventiva el edificio no puede figurar como centro de evacuados.',
    cuando: (r) => r.motivoId === MOTIVO.evacuacion && r.edificio === 'centro_evacuados',
  },
  {
    codigo: 'inundacion-centro-evacuados',
    campo: 'edificio',
    mensaje: 'Con una inundación el edificio no puede figurar como centro de evacuados.',
    cuando: (r) => r.motivoId === MOTIVO.inundacion && r.edificio === 'centro_evacuados',
  },
  {
    codigo: 'inaccesibilidad-docentes-evacuado',
    campo: 'edificio',
    mensaje: 'Si los docentes no pueden acceder, el edificio no puede figurar como evacuado.',
    cuando: (r) => r.motivoId === MOTIVO.inaccesibilidad && r.edificio === 'evacuado',
  },
  {
    codigo: 'evacuado-clases-normales',
    campo: 'clases',
    mensaje: 'Con el edificio evacuado no pueden dictarse clases con normalidad.',
    cuando: (r) => r.edificio === 'evacuado' && r.clases === 'normal',
  },
  {
    codigo: 'otro-sin-descripcion',
    campo: 'descripcion',
    mensaje: 'Describa la situación: al elegir "Otro" la descripción es obligatoria.',
    cuando: (r) => MOTIVOS_OTRO.some((id) => id === r.motivoId) && r.descripcion.trim() === '',
  },
]

const ADVERTENCIAS: DefinicionRegla[] = [
  {
    codigo: 'inundacion-habitual',
    campo: 'edificio',
    mensaje: 'Una inundación suele afectar al edificio. Verifique que siga figurando como habitual.',
    sugerencia: CAMBIAR_A_PARCIAL,
    cuando: (r) => r.motivoId === MOTIVO.inundacion && r.edificio === 'habitual',
  },
  {
    codigo: 'tormenta-centro-evacuados',
    campo: 'edificio',
    mensaje: 'Una tormenta severa pocas veces obliga a un centro de evacuados. Verifique el estado del edificio.',
    sugerencia: CAMBIAR_A_PARCIAL,
    cuando: (r) => r.motivoId === MOTIVO.tormenta && r.edificio === 'centro_evacuados',
  },
  {
    codigo: 'sin-energia-evacuado',
    campo: 'edificio',
    mensaje: 'Sin energía o agua el edificio rara vez queda evacuado. Verifique el estado del edificio.',
    sugerencia: CAMBIAR_A_SIN_CLASES,
    cuando: (r) => r.motivoId === MOTIVO.sinEnergia && r.edificio === 'evacuado',
  },
  {
    codigo: 'sin-energia-centro-evacuados',
    campo: 'edificio',
    mensaje: 'Sin energía o agua el edificio rara vez se convierte en centro de evacuados. Verifique el estado del edificio.',
    sugerencia: CAMBIAR_A_PARCIAL,
    cuando: (r) => r.motivoId === MOTIVO.sinEnergia && r.edificio === 'centro_evacuados',
  },
  {
    codigo: 'inaccesibilidad-docentes-parcial',
    campo: 'edificio',
    mensaje: 'Si el problema es solo el acceso de los docentes, el edificio suele estar en uso normal. Verifique el estado del edificio.',
    sugerencia: { campo: 'edificio', valor: 'habitual', etiqueta: 'Cambiar a Sin daños' },
    cuando: (r) => r.motivoId === MOTIVO.inaccesibilidad && r.edificio === 'parcial',
  },
  {
    codigo: 'inaccesibilidad-docentes-centro-evacuados',
    campo: 'edificio',
    mensaje: 'Si los docentes no pueden acceder, pocas veces el edificio es un centro de evacuados. Verifique el estado del edificio.',
    sugerencia: CAMBIAR_A_PARCIAL,
    cuando: (r) => r.motivoId === MOTIVO.inaccesibilidad && r.edificio === 'centro_evacuados',
  },
  {
    codigo: 'habitual-clases-suspendidas',
    campo: 'clases',
    mensaje: 'El edificio figura habitual pero las clases están suspendidas. Verifique ambas respuestas.',
    sugerencia: { campo: 'clases', valor: 'normal', etiqueta: 'Cambiar a Clases normales' },
    cuando: (r) => r.motivoId !== MOTIVO.sinEnergia && r.edificio === 'habitual' && r.clases === 'suspendido',
  },
  {
    // Sin energía o agua con clases suspendidas: el estado que lo describe es "Sin clases".
    codigo: 'habitual-clases-suspendidas',
    campo: 'clases',
    mensaje: 'El edificio figura habitual pero las clases están suspendidas. Si falta energía o agua en toda la escuela, indique que el edificio está sin clases.',
    sugerencia: CAMBIAR_A_SIN_CLASES,
    cuando: (r) => r.motivoId === MOTIVO.sinEnergia && r.edificio === 'habitual' && r.clases === 'suspendido',
  },
  {
    codigo: 'sin-clases-clases-normales',
    campo: 'clases',
    mensaje: 'Con el edificio sin clases, las clases no pueden ser normales. Verifique la respuesta.',
    sugerencia: CLASES_SUSPENDIDAS,
    cuando: (r) => r.edificio === 'sin_clases' && r.clases === 'normal',
  },
  {
    codigo: 'centro-clases-normales',
    campo: 'clases',
    mensaje: 'Con el edificio en centro de evacuados es poco probable que las clases sean normales. Verifique la respuesta.',
    sugerencia: CLASES_SUSPENDIDAS,
    cuando: (r) => r.edificio === 'centro_evacuados' && r.clases === 'normal',
  },
  {
    codigo: 'clases-normales-con-asistencia',
    campo: 'asistencia',
    mensaje: 'Si las clases son normales, no suele haber asistencia pedagógica. Verifique la respuesta.',
    cuando: (r) => r.clases === 'normal' && r.asistenciaBrinda === true,
  },
  {
    codigo: 'evacuacion-severidad-baja',
    campo: 'severidad',
    mensaje: 'Una evacuación preventiva suele tener una gravedad mayor que Baja. Verifique la gravedad.',
    cuando: (r) => r.motivoId === MOTIVO.evacuacion && r.severidad === 'Baja',
  },
  {
    codigo: 'inundacion-parcial-clases-normales',
    campo: 'clases',
    mensaje: 'Con una inundación y el edificio parcial, las clases difícilmente sean normales. Verifique la respuesta.',
    sugerencia: CLASES_SUSPENDIDAS,
    cuando: (r) => r.motivoId === MOTIVO.inundacion && r.edificio === 'parcial' && r.clases === 'normal',
  },
  {
    codigo: 'critica-seccion-unica',
    campo: 'alcance',
    mensaje: 'Una gravedad Crítica con una sola sección afectada es poco frecuente. Verifique el alcance.',
    cuando: (r) => r.categoria !== 'alumnos' && r.severidad === 'Crítica' && esSeccionUnica(r.alcance),
  },
  {
    codigo: 'mas-personas-seccion-unica',
    campo: 'justificacionCritica',
    mensaje: 'La justificación "afecta a más personas" no coincide con una sola sección. Verifique la justificación.',
    cuando: (r) => r.justificacionCritica === 'mas_personas' && esSeccionUnica(r.alcance),
  },
  {
    codigo: 'se-prolonga-ahora',
    campo: 'justificacionCritica',
    mensaje: 'La situación "se prolonga" no suele empezar en este momento. Verifique la fecha de inicio.',
    cuando: (r) => r.justificacionCritica === 'se_prolonga' && r.vigencia?.modo === 'ahora',
  },
  {
    codigo: 'evacuacion-vigencia-antigua',
    campo: 'vigencia',
    mensaje: 'Una evacuación preventiva iniciada hace más de una semana es poco frecuente. Verifique la fecha de inicio.',
    cuando: (r, ahora) => r.motivoId === MOTIVO.evacuacion && vigenciaAntigua(r.vigencia, ahora),
  },
]

function esSeccionUnica(alcance: AlcanceSecciones | null): boolean {
  return alcance?.tipo === 'algunas' && alcance.secciones === 1
}

function vigenciaAntigua(vigencia: EleccionVigencia | null, ahora: Date): boolean {
  if (!vigencia) return false
  const inicio = resolverVigencia(vigencia, ahora)
  if (inicio === null) return false
  return ahora.getTime() - new Date(inicio).getTime() > DIAS_VIGENCIA_ANTIGUA * MS_POR_DIA
}

function aRegla(definicion: DefinicionRegla, firma: string): Regla {
  return {
    codigo: definicion.codigo,
    campo: definicion.campo,
    mensaje: definicion.mensaje,
    ...(definicion.sugerencia ? { sugerencia: definicion.sugerencia } : {}),
    firma,
  }
}

// Evalúa una regla registrando las respuestas que lee. La firma sólo incluye
// esas: cambiar otra respuesta no debe volver a mostrar un aviso descartado.
function evaluarRegla(definicion: DefinicionRegla, respuestas: RespuestasConsistencia, ahora: Date): Regla | null {
  const leidas = new Set<keyof RespuestasConsistencia>()
  const registro = new Proxy(respuestas, {
    get(objetivo, clave, receptor) {
      leidas.add(clave as keyof RespuestasConsistencia)
      return Reflect.get(objetivo, clave, receptor)
    },
  })
  if (!definicion.cuando(registro, ahora)) return null
  const firma = JSON.stringify([...leidas].sort().map((clave) => [clave, respuestas[clave]]))
  return aRegla(definicion, firma)
}

export function evaluarConsistenciaParte(
  respuestas: RespuestasConsistencia,
  ahora: Date = new Date(),
): ResultadoConsistencia {
  const aplicables = (definiciones: DefinicionRegla[]) =>
    definiciones.flatMap((d) => {
      if (respuestas.categoria === 'alumnos' && ['severidad', 'justificacionCritica'].includes(d.campo)) return []
      const regla = evaluarRegla(d, respuestas, ahora)
      return regla ? [regla] : []
    })
  return {
    bloqueos: aplicables(BLOQUEOS),
    advertencias: aplicables(ADVERTENCIAS),
  }
}

const CLAVE_RESPUESTA_OPCION: Record<CampoOpcion, 'motivoId' | 'edificio' | 'clases'> = {
  motivo: 'motivoId',
  edificio: 'edificio',
  clases: 'clases',
}

// Devuelve el bloqueo que provocaría elegir `valor` en `campo` con las
// respuestas actuales, o null si la opción está disponible. Sólo cuentan los
// bloqueos nuevos: un bloqueo que ya existía por otra respuesta no deshabilita
// la opción. El bloqueo por descripción vacía tampoco deshabilita "Otro".
export function bloqueoOpcion(
  respuestas: RespuestasConsistencia,
  campo: CampoOpcion,
  valor: string,
  ahora: Date = new Date(),
): Regla | null {
  const existentes = new Set(evaluarConsistenciaParte(respuestas, ahora).bloqueos.map((r) => r.codigo))
  const candidata = { ...respuestas, [CLAVE_RESPUESTA_OPCION[campo]]: valor }
  const nuevo = evaluarConsistenciaParte(candidata, ahora).bloqueos.find(
    (r) => r.campo !== 'descripcion' && !existentes.has(r.codigo),
  )
  return nuevo ?? null
}

// Severidad sugerida por el motivo. Con alcance "toda la escuela" sube un nivel
// (tope Crítica); en otro caso devuelve la sugerida tal cual. Null si el motivo
// no tiene sugerencia (p. ej. "Otro").
export function severidadSugeridaPorAlcance(
  motivoId: string | null,
  alcance: AlcanceSecciones | null,
): Severidad | null {
  const base = motivoId ? SEVERIDAD_SUGERIDA_POR_MOTIVO[motivoId] : undefined
  if (!base) return null
  if (alcance?.tipo !== 'toda') return base
  const indice = SEVERIDADES.indexOf(base)
  return SEVERIDADES[Math.min(indice + 1, SEVERIDADES.length - 1)] ?? base
}

// Alcance a partir de las secciones elegidas: "toda la escuela" sólo cuando
// cubren todas las secciones del CUE, sin importar cómo se eligieron. Lo usan
// cliente y servidor para que la misma selección dé la misma sugerida.
export function alcanceDeSecciones(seccionIds: number[], todasLasSecciones: number[]): AlcanceSecciones | null {
  if (seccionIds.length === 0) return null
  const elegidas = new Set(seccionIds)
  if (todasLasSecciones.length > 0 && todasLasSecciones.every((id) => elegidas.has(id))) return { tipo: 'toda' }
  return { tipo: 'algunas', secciones: seccionIds.length }
}
