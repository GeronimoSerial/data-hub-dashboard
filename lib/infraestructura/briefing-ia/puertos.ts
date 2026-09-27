// Módulo de dominio del batch E8 (briefing narrativo asistido por IA).
// Este puerto aísla a E8 de infra_situacion_corte (batch E5, ya mergeada en
// feat/renovación @ 5216011): E8 consume el contrato de tipos y el adaptador
// real de abajo, nunca importa la tabla directamente. El adaptador "no
// disponible" queda para tests que necesitan simular ausencia de corte sin
// tocar la base.

export interface CorteSituacion {
  id: string
  generadoEn: string
  riskRunId: string | null
  cobertura: Record<string, number> | null
  conteosPorNivelRiesgo: Record<string, number>
  kpis: {
    escuelasAfectacionConfirmadaVigente: number
    escuelasRiesgoAlto24h: number
    fuentesVencidas: number
  }
  fuentesSalud: Array<{
    provider: string
    estado: string
    frescuraMinutos: number | null
    vencida: boolean
  }>
  episodiosAbiertos: number
  episodiosCerradosDesdeAnterior: number
  generadoPorJobRunId: string | null
  creadaEn: string
}

export interface PuertoCorteSituacion {
  obtenerUltimoCorte(): Promise<CorteSituacion | null>
  obtenerCortePorId(id: string): Promise<CorteSituacion | null>
  // Corte inmediatamente anterior al de `generadoEn` dado (estrictamente
  // previo), o null si no hay uno. Necesario para el fallback determinista de
  // E4 (compara alto/muy_alto y cobertura contra el corte previo).
  obtenerCorteAnterior(generadoEn: string): Promise<CorteSituacion | null>
}

// Adaptador de test/desarrollo: simula ausencia total de cortes sin tocar la
// base. El pipeline debe tratar esto como un estado normal (nada que briefar
// todavía), nunca como un error.
export function crearPuertoCorteSituacionNoDisponible(): PuertoCorteSituacion {
  return {
    async obtenerUltimoCorte(): Promise<CorteSituacion | null> {
      return null
    },
    async obtenerCortePorId(_id: string): Promise<CorteSituacion | null> {
      return null
    },
    async obtenerCorteAnterior(_generadoEn: string): Promise<CorteSituacion | null> {
      return null
    },
  }
}

// Adaptador real: envuelve lib/infraestructura/riesgo/situacion/corte.ts (E5).
// `obtenerCortePorId` no tiene equivalente directo ahí (E5 sólo expone último
// y anterior-a-fecha); como E8 sólo necesita "el corte que se está briefeando"
// (siempre el último al momento del job) y "un corte por id" para servir un
// briefing ya persistido por su propio corteId, esta implementación resuelve
// el caso por id filtrando sobre obtenerUltimoCorte/obtenerCorteAnterior
// encadenado no sería correcto (no hay índice por id en corte.ts) — en su
// lugar corte.ts exporta el corte con `id`, así que se resuelve con una
// consulta directa a la tabla, ver crearPuertoCorteSituacionReal más abajo.
export function crearPuertoCorteSituacionReal(): PuertoCorteSituacion {
  function mapear(corte: {
    id: string
    generadoEn: string
    riskRunId: string | null
    cobertura: Record<string, number> | null
    conteosPorNivelRiesgo: Record<string, number>
    kpis: {
      escuelasAfectacionConfirmadaVigente: number
      escuelasRiesgoAlto24h: number
      fuentesVencidas: number
    }
    fuentesSalud: Array<{
      provider: string
      estado: string
      frescuraMinutos: number | null
      vencida: boolean
    }>
    episodiosAbiertos: number
    episodiosCerradosDesdeAnterior: number
  }): CorteSituacion {
    // corte.ts no expone generadoPorJobRunId/creadaEn en su tipo público
    // CortePersistido (aunque la fila real los tenga): no los usa ninguna
    // métrica citable de E8 (ver metricas.ts), así que se completan con un
    // valor seguro en vez de ampliar el tipo de E5 sólo para esto.
    return { ...corte, generadoPorJobRunId: null, creadaEn: corte.generadoEn }
  }

  return {
    async obtenerUltimoCorte(): Promise<CorteSituacion | null> {
      const { obtenerUltimoCorte } = await import('@/lib/infraestructura/riesgo/situacion/corte')
      const corte = await obtenerUltimoCorte()
      return corte ? mapear(corte) : null
    },
    async obtenerCortePorId(id: string): Promise<CorteSituacion | null> {
      const { getDb } = await import('@/lib/db')
      const { infraSituacionCorte } = await import('@/lib/db/schema')
      const { eq } = await import('drizzle-orm')
      const db = getDb()
      const [fila] = await db
        .select()
        .from(infraSituacionCorte)
        .where(eq(infraSituacionCorte.id, id))
        .limit(1)
      return fila ? mapear(fila) : null
    },
    async obtenerCorteAnterior(generadoEn: string): Promise<CorteSituacion | null> {
      const { obtenerCorteAnterior } = await import('@/lib/infraestructura/riesgo/situacion/corte')
      const corte = await obtenerCorteAnterior(generadoEn)
      return corte ? mapear(corte) : null
    },
  }
}
