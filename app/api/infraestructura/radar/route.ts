import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import {
  infraGeoProfile,
  infraRiskRun,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { listarEscuelasMapa } from '@/lib/infraestructura/parte-mapa'
import { clasificarNivel } from '@/lib/infraestructura/riesgo/motor/calculo'
import { calcularMatriculaCondicionadaPorAcceso } from '@/lib/infraestructura/riesgo/kpi-acceso'
import {
  agregarNivelPorDepartamento,
  obtenerNivelesPeligro,
  type HorizontePeligro,
  type NivelPeligro,
  type NivelPeligroCelda,
} from '@/lib/infraestructura/riesgo/peligro/nivel'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// El motor v0 sólo publica cortes para estos tres horizontes.
const horizonteSchema = z.union([z.literal(24), z.literal(72), z.literal(240)])

const filtrosSchema = z.object({
  departamento: z.string().min(1).optional(),
  nivel: z.enum(['bajo', 'moderado', 'alto', 'muy_alto']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

// El corte de peligro siempre se agrupa por los tres horizontes disponibles,
// aunque el listado de escuelas se filtre por uno solo.
const HORIZONTES_PELIGRO: HorizontePeligro[] = [24, 72, 240]

// Mismo shape de items que /api/infraestructura/riesgo.
const itemsFields = {
  snapshotId: infraRiskSnapshot.id,
  cueAnexo: infraRiskSnapshot.cueAnexo,
  departamento: infraGeoProfile.departamento,
  horizonteHoras: infraRiskSnapshot.horizonteHoras,
  evidenciaValida: infraRiskSnapshot.evidenciaValida,
  scoreRiesgo: infraRiskSnapshot.scoreRiesgo,
  nivelRiesgo: infraRiskSnapshot.nivelRiesgo,
  scoreAmenaza: infraRiskSnapshot.scoreAmenaza,
  nivelAmenaza: infraRiskSnapshot.nivelAmenaza,
  scoreVulnerabilidad: infraRiskSnapshot.scoreVulnerabilidad,
  confianza: infraRiskSnapshot.confianza,
  scoreRiesgoAcceso: infraRiskSnapshot.scoreRiesgoAcceso,
  nivelRiesgoAcceso: infraRiskSnapshot.nivelRiesgoAcceso,
  confianzaAcceso: infraRiskSnapshot.confianzaAcceso,
  exposicionMatricula: infraRiskSnapshot.exposicionMatricula,
  exposicionSecciones: infraRiskSnapshot.exposicionSecciones,
  calculadoEn: infraRiskSnapshot.calculadoEn,
  validoHasta: infraRiskSnapshot.validoHasta,
}

interface CorteRadar {
  runId: string
  publicadoEn: string
  modeloVersion: string
}

interface DepartamentoRadar {
  departamento: string
  peorNivel: NivelPeligro
  horizonteHoras: HorizontePeligro
  celdas: number
}

function respuestaVacia(page: number, pageSize: number) {
  return jsonNoStore(
    {
      corte: null,
      cobertura: null,
      departamentos: [],
      puntos: [],
      escuelas: { items: [], page, pageSize, total: 0, totalPages: 0 },
      kpis: {
        riesgoAltoTotal: 0,
        sinEvidenciaTotal: 0,
        accesoCondicionado: { escuelas: 0, matricula: 0 },
      },
      hayNivelProvisorio: false,
    },
  )
}

/**
 * Mapeo celda→departamento: `infra_geo_profile` es la única fuente que asocia
 * un `geometryRef` a un departamento. Puede haber varias celdas por
 * departamento y, en teoría, una celda compartida por más de uno; por eso se
 * agrupa como departamento → lista de celdas distintas.
 */
async function cargarCeldasPorDepartamento(
  departamento: string | undefined,
): Promise<Record<string, string[]>> {
  const db = getDb()
  const filas = await db
    .selectDistinct({
      departamento: infraGeoProfile.departamento,
      geometryRef: infraGeoProfile.geometryRef,
    })
    .from(infraGeoProfile)

  const porDepartamento: Record<string, string[]> = {}
  for (const fila of filas) {
    if (fila.departamento === null || fila.geometryRef === null) continue
    if (departamento !== undefined && fila.departamento !== departamento) continue
    const celdas = porDepartamento[fila.departamento] ?? []
    if (!celdas.includes(fila.geometryRef)) celdas.push(fila.geometryRef)
    porDepartamento[fila.departamento] = celdas
  }
  return porDepartamento
}

/**
 * Una fila por (departamento, horizonte). El nivel del departamento es el peor
 * nivel real entre sus celdas (`agregarNivelPorDepartamento` ya implementa la
 * regla: `sin_dato` nunca le gana a un nivel concreto); sólo queda `sin_dato`
 * cuando todas sus celdas lo están.
 */
function construirDepartamentos(
  niveles: NivelPeligroCelda[],
  celdasPorDepartamento: Record<string, string[]>,
): DepartamentoRadar[] {
  const peoresPorHorizonte = new Map<
    HorizontePeligro,
    Record<string, NivelPeligro>
  >(
    HORIZONTES_PELIGRO.map((horizonte) => [
      horizonte,
      agregarNivelPorDepartamento(niveles, celdasPorDepartamento, horizonte),
    ]),
  )

  const departamentos: DepartamentoRadar[] = []
  for (const departamento of Object.keys(celdasPorDepartamento).sort()) {
    for (const horizonte of HORIZONTES_PELIGRO) {
      departamentos.push({
        departamento,
        peorNivel:
          peoresPorHorizonte.get(horizonte)?.[departamento] ?? 'sin_dato',
        horizonteHoras: horizonte,
        celdas: celdasPorDepartamento[departamento].length,
      })
    }
  }
  return departamentos
}

async function handleGET(request: Request) {
  // ACL primero: una request sin sesión no debe disparar trabajo de DB
  // (ensureSeeded) antes de fallar.
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await ensureSeeded()

  const { searchParams } = new URL(request.url)

  let horizonte: HorizontePeligro | undefined
  const horizonteRaw = searchParams.get('horizonte')
  if (horizonteRaw !== null) {
    const parsedHorizonte = horizonteSchema.safeParse(Number(horizonteRaw))
    if (!parsedHorizonte.success) {
      return Response.json({ error: 'horizonte inválido' }, { status: 400 })
    }
    horizonte = parsedHorizonte.data
  }

  const parsed = filtrosSchema.safeParse({
    departamento: searchParams.get('departamento') ?? undefined,
    nivel: searchParams.get('nivel') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return jsonError(`Parámetro inválido: ${issue.path.join('.')}`, 400)
  }
  const { departamento, nivel, page, pageSize } = parsed.data

  const db = getDb()
  const [runVigente] = await db
    .select()
    .from(infraRiskRun)
    .where(eq(infraRiskRun.estado, 'vigente'))
    .limit(1)

  // Estado legítimo: el motor todavía no publicó ningún corte. No es un error.
  if (!runVigente) {
    return respuestaVacia(page, pageSize)
  }

  // Un run vigente publicado siempre tiene `publicadoEn`; el fallback a
  // `iniciadoEn` sólo evita un `new Date(null)` si la fila quedó a medias.
  const publicadoEn = runVigente.publicadoEn ?? runVigente.iniciadoEn
  const corte: CorteRadar = {
    runId: runVigente.id,
    publicadoEn,
    modeloVersion: runVigente.modeloVersion,
  }

  // Corte consistente: el peligro se evalúa "as-of" el instante en que se
  // publicó el run de riesgo vigente, no con Date.now(), para que ninguna
  // corrida de peligro más nueva se cuele en el mismo corte.
  const niveles = await obtenerNivelesPeligro({ ahora: new Date(publicadoEn) })
  const hayNivelProvisorio = niveles.some(
    (fila) => fila.metodo === 'umbral_provisorio',
  )
  const celdasPorDepartamento = await cargarCeldasPorDepartamento(departamento)
  const departamentos = construirDepartamentos(niveles, celdasPorDepartamento)

  const condiciones = [eq(infraRiskSnapshot.runId, runVigente.id)]
  if (horizonte !== undefined) {
    condiciones.push(eq(infraRiskSnapshot.horizonteHoras, horizonte))
  }
  if (departamento !== undefined) {
    // El dato viene normalizado en mayúsculas desde geo-perfil.ts.
    condiciones.push(eq(infraGeoProfile.departamento, departamento))
  }
  if (nivel !== undefined) {
    condiciones.push(eq(infraRiskSnapshot.nivelRiesgo, nivel))
  }
  const where = and(...condiciones)

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(infraRiskSnapshot)
    .innerJoin(
      infraGeoProfile,
      eq(infraRiskSnapshot.cueAnexo, infraGeoProfile.cueAnexo),
    )
    .where(where)
  const total = Number(countRow?.count ?? 0)

  // Orden explícito con NULLS LAST para no depender del default de cada motor:
  // en Postgres, DESC deja los NULL al principio, pero acá las escuelas sin
  // evidencia (scoreRiesgo null) deben quedar al final — el ranking arranca por
  // el riesgo más alto.
  const items = await db
    .select(itemsFields)
    .from(infraRiskSnapshot)
    .innerJoin(
      infraGeoProfile,
      eq(infraRiskSnapshot.cueAnexo, infraGeoProfile.cueAnexo),
    )
    .where(where)
    .orderBy(sql`${infraRiskSnapshot.scoreRiesgo} desc nulls last`)
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  // Los KPIs cuentan el mismo universo filtrado que `escuelas`, no sólo la
  // página devuelta.
  const [altoRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(infraRiskSnapshot)
    .innerJoin(
      infraGeoProfile,
      eq(infraRiskSnapshot.cueAnexo, infraGeoProfile.cueAnexo),
    )
    .where(
      and(where, inArray(infraRiskSnapshot.nivelRiesgo, ['alto', 'muy_alto'])),
    )
  const [sinEvidenciaRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(infraRiskSnapshot)
    .innerJoin(
      infraGeoProfile,
      eq(infraRiskSnapshot.cueAnexo, infraGeoProfile.cueAnexo),
    )
    .where(and(where, eq(infraRiskSnapshot.evidenciaValida, false)))

  // KPI de acceso: mismo universo filtrado que `escuelas`, pero con las filas
  // crudas que la función pura necesita (nivel de acceso + matrícula expuesta).
  // La afectación confirmada sale de `listarEscuelasMapa` (la MISMA fuente que
  // usa el mapa), así una escuela con daño confirmado nunca vuelve a sumar su
  // matrícula acá.
  // Esta consulta es la ÚNICA sin paginar del universo filtrado: además del
  // KPI, alimenta `puntos` (cobertura del mapa) sin round-trips extra.
  const snapshotsAcceso = await db
    .select({
      cueAnexo: infraRiskSnapshot.cueAnexo,
      horizonteHoras: infraRiskSnapshot.horizonteHoras,
      nivelRiesgo: infraRiskSnapshot.nivelRiesgo,
      nivelAmenaza: infraRiskSnapshot.nivelAmenaza,
      scoreVulnerabilidad: infraRiskSnapshot.scoreVulnerabilidad,
      confianza: infraRiskSnapshot.confianza,
      nivelRiesgoAcceso: infraRiskSnapshot.nivelRiesgoAcceso,
      exposicionMatricula: infraRiskSnapshot.exposicionMatricula,
      departamento: infraGeoProfile.departamento,
    })
    .from(infraRiskSnapshot)
    .innerJoin(
      infraGeoProfile,
      eq(infraRiskSnapshot.cueAnexo, infraGeoProfile.cueAnexo),
    )
    .where(where)

  // `puntos` existe para que el mapa cubra TODO el universo filtrado (una
  // escuela = un punto), no sólo la página del ranking. `escuelas` sigue
  // siendo el ranking paginado tal cual.
  const puntos = snapshotsAcceso.map((snapshot) => ({
    cueAnexo: snapshot.cueAnexo,
    horizonteHoras: snapshot.horizonteHoras,
    nivelRiesgo: snapshot.nivelRiesgo,
    // Amenaza sola (I-7): visible aunque la prioridad quede atenuada.
    nivelAmenaza: snapshot.nivelAmenaza,
    // Vulnerabilidad de la escuela (antecedentes y terreno), con el mismo mapeo de niveles:
    // explica por qué una amenaza fuerte puede dar un riesgo bajo.
    nivelVulnerabilidad: snapshot.scoreVulnerabilidad === null ? null : clasificarNivel(snapshot.scoreVulnerabilidad),
    confianza: snapshot.confianza,
    nivelRiesgoAcceso: snapshot.nivelRiesgoAcceso,
    // Para contar escuelas por riesgo actual en cada departamento (veredicto diario).
    departamento: snapshot.departamento,
  }))

  const { escuelas: escuelasMapa } = await listarEscuelasMapa()
  const cuesConAfectacionConfirmada = new Set(
    escuelasMapa.filter((escuela) => escuela.estado === 'afectada').map((e) => e.cueAnexo),
  )
  const accesoCondicionado = calcularMatriculaCondicionadaPorAcceso({
    snapshots: snapshotsAcceso,
    cuesConAfectacionConfirmada,
  })

  return jsonNoStore(
    {
      corte,
      cobertura: runVigente.cobertura,
      departamentos,
      puntos,
      escuelas: {
        items,
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      kpis: {
        riesgoAltoTotal: Number(altoRow?.count ?? 0),
        sinEvidenciaTotal: Number(sinEvidenciaRow?.count ?? 0),
        accesoCondicionado,
      },
      hayNivelProvisorio,
    },
  )
}

export const GET = ruta('infraestructura.radar.get', handleGET)
