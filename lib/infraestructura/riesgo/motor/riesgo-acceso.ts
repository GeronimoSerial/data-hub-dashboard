// Dimensión SEPARADA "riesgo de acceso". Núcleo puro: no importa DB ni red, no
// lee el reloj. NO se mezcla en scoreRiesgo/scoreVulnerabilidad (el IRO
// compuesto): el núcleo la calcula y la persiste como `riesgoAcceso`,
// exactamente igual que `exposicion` y `urgenciaVerificacion` en
// ResultadoRiesgoEscuela.
//
// Por qué es una dimensión propia y no un componente de vulnerabilidad: cruza
// el aislamiento OSM (G1, estático) con el PELIGRO del horizonte (E3a, cambia
// con el evento) y con el historial de accesos interrumpidos. Ese cruce de tres
// fuentes no es vulnerabilidad estática; meterlo en scoreVulnerabilidad
// contaminaría el IRO compuesto con una probabilidad contextual.
//
// Los parámetros viven en config.ts versionados con REGLA_ACCESO_VERSION; acá
// sólo está la lógica, para que un cambio de umbrales no se cuele sin versión.
import {
  AGRAVANTES_ACCESO,
  BASE_ACCESO_POR_NIVEL_AISLAMIENTO,
  NIVEL_PELIGRO_A_NUMERO,
  REGLA_ACCESO_VERSION,
  UMBRAL_ALTO,
  UMBRAL_MODERADO,
} from './config'
import type { IndiceAislamiento, NivelPeligro } from './puertos'
import type { Confianza } from './tipos'

export interface ResultadoRiesgoAcceso {
  score: number | null
  nivel: 'bajo' | 'moderado' | 'alto' | null
  confianza: Confianza
  explicacion: string
}

// Umbral "peligro alto" en la escala 0..100 de NIVEL_PELIGRO_A_NUMERO:
// naranja = 66, rojo = 100. Amarillo (33) y verde (0) NO cuentan como alto.
export const UMBRAL_PELIGRO_ALTO = 66

// Deriva si hay un "cruce de agua sin puente/vado conocido" a partir del
// IndiceAislamiento. No existe un campo directo en la tabla: se deriva de los
// conteos. Es de riesgo cuando
//   - hay al menos un vado (crucesAguaConVadoCount > 0), o
//   - hay más cruces de agua que cruces con puente registrado
//     (crucesAguaCount > crucesAguaConPuenteCount), o
//   - hay cruces pero el conteo de puentes es DESCONOCIDO (null): no se puede
//     certificar que todos tengan puente, y un dato faltante nunca certifica
//     seguridad (misma lógica que "alternativa desconocida nunca baja").
// Un cruce con puente para TODOS (conteos iguales y no nulos) no es de riesgo.
function hayCruceDeRiesgo(indice: IndiceAislamiento): boolean {
  const vado = indice.crucesAguaConVadoCount !== null && indice.crucesAguaConVadoCount > 0
  const hayCruces = indice.crucesAguaCount !== null && indice.crucesAguaCount > 0
  const puenteDesconocido = hayCruces && indice.crucesAguaConPuenteCount === null
  const faltaPuente =
    indice.crucesAguaCount !== null &&
    indice.crucesAguaConPuenteCount !== null &&
    indice.crucesAguaCount > indice.crucesAguaConPuenteCount
  return vado || puenteDesconocido || faltaPuente
}

function esPeligroAlto(nivel: NivelPeligro | null): boolean {
  if (nivel === null) return false
  const valor = NIVEL_PELIGRO_A_NUMERO[nivel]
  return typeof valor === 'number' && valor >= UMBRAL_PELIGRO_ALTO
}

function clasificar(score: number): 'bajo' | 'moderado' | 'alto' {
  if (score < UMBRAL_MODERADO) return 'bajo'
  if (score < UMBRAL_ALTO) return 'moderado'
  return 'alto'
}

// Calcula la dimensión de riesgo de acceso. Insumos: el `IndiceAislamiento` OSM
// completo, el peligro del horizonte YA leído por calcularRiesgoEscuela (celda
// y caudal, sin volver a pedir el puerto) y `accesoInterrumpidoCantidad` YA
// derivado del historial. Nunca lanza.
export function calcularRiesgoAcceso(params: {
  indice: IndiceAislamiento | null
  nivelPeligroCelda: NivelPeligro | null
  nivelPeligroCaudal: NivelPeligro | null
  accesoInterrumpidoCantidad: number
}): ResultadoRiesgoAcceso {
  const { indice, nivelPeligroCelda, nivelPeligroCaudal, accesoInterrumpidoCantidad } = params

  // Ausencia: sin fila (null) o fila sin cálculo de ruta ('sin_datos_red').
  // NUNCA se interpreta como nivel 'bajo': sin dato no es bajo riesgo, es
  // riesgo desconocido (mismo principio que los puertos del motor).
  if (indice === null || indice.nivel === 'sin_datos_red') {
    return {
      score: null,
      nivel: null,
      confianza: 'baja',
      explicacion:
        indice === null
          ? 'Sin indice de aislamiento OSM para esta escuela: riesgo de acceso desconocido'
          : 'El indice de aislamiento OSM no tiene ruta calculada (sin_datos_red): riesgo de acceso desconocido',
    }
  }

  const nivelAislamiento = indice.nivel
  const cruce = hayCruceDeRiesgo(indice)
  const peligroAlto = esPeligroAlto(nivelPeligroCelda) || esPeligroAlto(nivelPeligroCaudal)
  const sinAlternativa = indice.tieneAlternativaSinCruce === false
  const alternativaDesconocida = indice.tieneAlternativaSinCruce === null

  let score = BASE_ACCESO_POR_NIVEL_AISLAMIENTO[nivelAislamiento]
  const agravantes: string[] = []

  if (cruce) {
    score += AGRAVANTES_ACCESO.cruceDeRiesgo
    agravantes.push('cruce de agua sin puente/vado conocido')
  }
  if (peligroAlto) {
    score += AGRAVANTES_ACCESO.peligroAlto
    agravantes.push('peligro alto en el horizonte')
  }
  if (sinAlternativa) {
    score += AGRAVANTES_ACCESO.sinAlternativa
    agravantes.push('sin alternativa sin cruce')
  } else if (alternativaDesconocida) {
    score += AGRAVANTES_ACCESO.alternativaDesconocida
    agravantes.push('alternativa sin cruce desconocida')
  }
  if (accesoInterrumpidoCantidad > 0) {
    score += AGRAVANTES_ACCESO.accesoInterrumpido
    agravantes.push(`${accesoInterrumpidoCantidad} acceso(s) interrumpido(s) confirmado(s)`)
  }

  score = Math.min(100, Math.max(0, Math.round(score)))
  const nivel = clasificar(score)

  // Confianza de la dimensión: 'alta' sólo si los conteos que alimentan la
  // derivación de cruce y la alternativa están todos presentes; un null en
  // cualquiera la baja a 'media' (nunca 'alta' con datos parciales). La
  // ausencia total ya se resolvió arriba con 'baja'.
  const conteosCompletos =
    indice.crucesAguaCount !== null &&
    indice.crucesAguaConPuenteCount !== null &&
    indice.crucesAguaConVadoCount !== null
  const confianza: Confianza = conteosCompletos && !alternativaDesconocida ? 'alta' : 'media'

  const explicacion = [
    `Riesgo de acceso ${nivel} (${score}/100) segun regla ${REGLA_ACCESO_VERSION}`,
    `aislamiento OSM ${nivelAislamiento}/3`,
    agravantes.length > 0 ? `agravantes: ${agravantes.join(', ')}` : 'sin agravantes',
  ].join('. ')

  return { score, nivel, confianza, explicacion }
}
