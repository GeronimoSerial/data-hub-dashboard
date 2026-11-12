import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraPeriodo, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { calcularGeoPerfiles } from '@/lib/infraestructura/riesgo/geo-perfil'
import { clasificarNivel } from '@/lib/infraestructura/riesgo/motor/calculo'
import { MOTOR_VERSION } from '@/lib/infraestructura/riesgo/motor/config'
import { publicarRunOperativo } from '@/lib/infraestructura/riesgo/publicar-run'
import { ESCUELAS, type DepartamentoEscuela } from './escuelas'

// Corrida de riesgo vigente del mapa e2e (B2.5).
//
// Niveles: el nivel de cada escuela sale de `clasificarNivel(scoreRiesgo)` del motor
// (motor/calculo.ts:122), con los umbrales de motor/config.ts:
//   score <  25            -> bajo
//   25 <= score <  50      -> moderado
//   50 <= score <  75      -> alto
//   score >= 75            -> muy_alto
// Por eso ESPERADOS_RIESGO fija el score y el nivel que el motor produce para ese score,
// y la prueba compara contra lo que devuelve la API, no contra lo que el seed declara.
//
// Escritura: el run nace 'preparando' con modo 'operativo' y se publica con
// `publicarRunOperativo`, la misma función que usa la app. Los snapshots se insertan con
// el esquema de Drizzle (sin SQL escrito a mano), sin pasar por el motor: no hay cálculo
// de peligro real detrás de estos números, son valores fijados para la prueba.
// Solo horizonte 72 h: es el que usa /api/infraestructura/riesgo/escuela/[cue] por defecto.

type EscuelaRiesgoSeed = {
  cueAnexo: string
  scoreRiesgo: number
  amenaza: number
  vulnerabilidad: number
  confianza: 'alta' | 'media'
  exposicionMatricula: number
  exposicionSecciones: number
}

const SEMBRADO: readonly EscuelaRiesgoSeed[] = [
  { cueAnexo: '1801899-00', scoreRiesgo: 12, amenaza: 10, vulnerabilidad: 14, confianza: 'alta', exposicionMatricula: 120, exposicionSecciones: 6 },
  { cueAnexo: '1801533-00', scoreRiesgo: 8, amenaza: 6, vulnerabilidad: 11, confianza: 'alta', exposicionMatricula: 45, exposicionSecciones: 2 },
  { cueAnexo: '1800405-00', scoreRiesgo: 19, amenaza: 22, vulnerabilidad: 17, confianza: 'alta', exposicionMatricula: 210, exposicionSecciones: 9 },
  { cueAnexo: '1801475-00', scoreRiesgo: 4, amenaza: 3, vulnerabilidad: 5, confianza: 'alta', exposicionMatricula: 60, exposicionSecciones: 3 },
  { cueAnexo: '1800554-00', scoreRiesgo: 42, amenaza: 48, vulnerabilidad: 36, confianza: 'media', exposicionMatricula: 480, exposicionSecciones: 18 },
  { cueAnexo: '1801016-00', scoreRiesgo: 31, amenaza: 29, vulnerabilidad: 33, confianza: 'media', exposicionMatricula: 150, exposicionSecciones: 7 },
  { cueAnexo: '1801101-00', scoreRiesgo: 36, amenaza: 40, vulnerabilidad: 30, confianza: 'media', exposicionMatricula: 300, exposicionSecciones: 12 },
  { cueAnexo: '1801477-00', scoreRiesgo: 61, amenaza: 58, vulnerabilidad: 64, confianza: 'alta', exposicionMatricula: 520, exposicionSecciones: 21 },
  { cueAnexo: '1800887-00', scoreRiesgo: 55, amenaza: 60, vulnerabilidad: 49, confianza: 'alta', exposicionMatricula: 90, exposicionSecciones: 4 },
  { cueAnexo: '1800653-00', scoreRiesgo: 67, amenaza: 70, vulnerabilidad: 62, confianza: 'alta', exposicionMatricula: 410, exposicionSecciones: 16 },
  { cueAnexo: '1800953-00', scoreRiesgo: 88, amenaza: 91, vulnerabilidad: 80, confianza: 'alta', exposicionMatricula: 75, exposicionSecciones: 3 },
  { cueAnexo: '1801039-00', scoreRiesgo: 81, amenaza: 84, vulnerabilidad: 74, confianza: 'alta', exposicionMatricula: 130, exposicionSecciones: 5 },
]

export const ESPERADOS_RIESGO = {
  horizonteHoras: 72,
  escuelas: [
    // Capital
    { cueAnexo: '1800554-00', departamento: 'Capital', scoreRiesgo: 42, nivelRiesgo: 'moderado', confianza: 'media', scoreAmenaza: 48, nivelAmenaza: 'moderado', scoreVulnerabilidad: 36, exposicionMatricula: 480, exposicionSecciones: 18 },
    { cueAnexo: '1801899-00', departamento: 'Capital', scoreRiesgo: 12, nivelRiesgo: 'bajo', confianza: 'alta', scoreAmenaza: 10, nivelAmenaza: 'bajo', scoreVulnerabilidad: 14, exposicionMatricula: 120, exposicionSecciones: 6 },
    { cueAnexo: '1801477-00', departamento: 'Capital', scoreRiesgo: 61, nivelRiesgo: 'alto', confianza: 'alta', scoreAmenaza: 58, nivelAmenaza: 'alto', scoreVulnerabilidad: 64, exposicionMatricula: 520, exposicionSecciones: 21 },
    // Goya
    { cueAnexo: '1801533-00', departamento: 'Goya', scoreRiesgo: 8, nivelRiesgo: 'bajo', confianza: 'alta', scoreAmenaza: 6, nivelAmenaza: 'bajo', scoreVulnerabilidad: 11, exposicionMatricula: 45, exposicionSecciones: 2 },
    { cueAnexo: '1801016-00', departamento: 'Goya', scoreRiesgo: 31, nivelRiesgo: 'moderado', confianza: 'media', scoreAmenaza: 29, nivelAmenaza: 'moderado', scoreVulnerabilidad: 33, exposicionMatricula: 150, exposicionSecciones: 7 },
    { cueAnexo: '1800953-00', departamento: 'Goya', scoreRiesgo: 88, nivelRiesgo: 'muy_alto', confianza: 'alta', scoreAmenaza: 91, nivelAmenaza: 'muy_alto', scoreVulnerabilidad: 80, exposicionMatricula: 75, exposicionSecciones: 3 },
    // Paso de los Libres
    { cueAnexo: '1800405-00', departamento: 'Paso de los Libres', scoreRiesgo: 19, nivelRiesgo: 'bajo', confianza: 'alta', scoreAmenaza: 22, nivelAmenaza: 'bajo', scoreVulnerabilidad: 17, exposicionMatricula: 210, exposicionSecciones: 9 },
    { cueAnexo: '1800887-00', departamento: 'Paso de los Libres', scoreRiesgo: 55, nivelRiesgo: 'alto', confianza: 'alta', scoreAmenaza: 60, nivelAmenaza: 'alto', scoreVulnerabilidad: 49, exposicionMatricula: 90, exposicionSecciones: 4 },
    { cueAnexo: '1801039-00', departamento: 'Paso de los Libres', scoreRiesgo: 81, nivelRiesgo: 'muy_alto', confianza: 'alta', scoreAmenaza: 84, nivelAmenaza: 'muy_alto', scoreVulnerabilidad: 74, exposicionMatricula: 130, exposicionSecciones: 5 },
    // Santo Tomé
    { cueAnexo: '1801475-00', departamento: 'Santo Tomé', scoreRiesgo: 4, nivelRiesgo: 'bajo', confianza: 'alta', scoreAmenaza: 3, nivelAmenaza: 'bajo', scoreVulnerabilidad: 5, exposicionMatricula: 60, exposicionSecciones: 3 },
    { cueAnexo: '1801101-00', departamento: 'Santo Tomé', scoreRiesgo: 36, nivelRiesgo: 'moderado', confianza: 'media', scoreAmenaza: 40, nivelAmenaza: 'moderado', scoreVulnerabilidad: 30, exposicionMatricula: 300, exposicionSecciones: 12 },
    { cueAnexo: '1800653-00', departamento: 'Santo Tomé', scoreRiesgo: 67, nivelRiesgo: 'alto', confianza: 'alta', scoreAmenaza: 70, nivelAmenaza: 'alto', scoreVulnerabilidad: 62, exposicionMatricula: 410, exposicionSecciones: 16 },
  ],
  porNivel: { bajo: 4, moderado: 3, alto: 3, muy_alto: 2 },
  porDepartamento: {
    Capital: { bajo: 1, moderado: 1, alto: 1, muy_alto: 0 },
    Goya: { bajo: 1, moderado: 1, alto: 0, muy_alto: 1 },
    'Paso de los Libres': { bajo: 1, moderado: 0, alto: 1, muy_alto: 1 },
    'Santo Tomé': { bajo: 1, moderado: 1, alto: 1, muy_alto: 0 },
  } satisfies Record<DepartamentoEscuela, Record<string, number>>,
} as const

export async function sembrarRiesgo(): Promise<void> {
  const db = getDb()

  // Las proyecciones de geo (departamento) alimentan el join de la lista de riesgo.
  await calcularGeoPerfiles()

  const [periodo] = await db.select().from(infraPeriodo).where(eq(infraPeriodo.estado, 'vigente')).limit(1)
  if (!periodo) throw new Error('sembrarRiesgo: no hay periodo vigente (ensureSeeded debe correr antes)')

  const ahora = new Date().toISOString()
  const runId = randomUUID()
  await db.insert(infraRiskRun).values({
    id: runId,
    periodoId: periodo.id,
    modeloVersion: MOTOR_VERSION,
    iniciadoEn: ahora,
    publicadoEn: null,
    estado: 'preparando',
    modo: 'operativo',
    cobertura: null,
    creadaEn: ahora,
  })

  const validoHasta = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
  await db.insert(infraRiskSnapshot).values(
    SEMBRADO.map((escuela) => {
      const escuelaRoster = ESCUELAS.find((e) => e.cueAnexo === escuela.cueAnexo)
      if (!escuelaRoster) throw new Error(`sembrarRiesgo: CUE ${escuela.cueAnexo} fuera del roster`)
      return {
        id: `${runId}-${escuela.cueAnexo}-72`,
        runId,
        cueAnexo: escuela.cueAnexo,
        horizonteHoras: 72,
        evidenciaValida: true,
        scoreRiesgo: escuela.scoreRiesgo,
        nivelRiesgo: clasificarNivel(escuela.scoreRiesgo),
        scoreAmenaza: escuela.amenaza,
        nivelAmenaza: clasificarNivel(escuela.amenaza),
        scoreVulnerabilidad: escuela.vulnerabilidad,
        confianza: escuela.confianza,
        exposicionMatricula: escuela.exposicionMatricula,
        exposicionSecciones: escuela.exposicionSecciones,
        calculadoEn: ahora,
        validoHasta,
      }
    }),
  )

  const resultado = await publicarRunOperativo({
    runId,
    cobertura: { procesadas: SEMBRADO.length, conEvidencia: SEMBRADO.length, sinEvidencia: 0 },
  })
  if (!resultado.publicado) throw new Error(`sembrarRiesgo: no se publicó la corrida (${resultado.motivo})`)
}
