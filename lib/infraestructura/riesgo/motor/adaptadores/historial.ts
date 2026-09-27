import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraAfectacion, infraParte } from '@/lib/db/schema'
import type { AntecedenteHistorial, PuertoHistorial, ResumenHistorial } from '../puertos'

const MS_POR_HORA = 1000 * 60 * 60
const MS_POR_DIA = MS_POR_HORA * 24

export function crearAdapterHistorial(): PuertoHistorial {
  return {
    async obtenerResumen({ cueAnexo, asOf, ventanaDias }): Promise<ResumenHistorial> {
      const db = getDb()
      const asOfMs = Date.parse(asOf)
      const desdeMs = asOfMs - ventanaDias * MS_POR_DIA

      const filas = await db
        .select({
          motivo: infraAfectacion.motivo,
          categoria: infraAfectacion.categoria,
          rigeDesde: infraAfectacion.rigeDesde,
          retiradaEn: infraAfectacion.retiradaEn,
        })
        .from(infraAfectacion)
        .innerJoin(infraParte, eq(infraAfectacion.parteId, infraParte.id))
        .where(eq(infraParte.cueAnexo, cueAnexo))

      // AS-OF ESTRICTO (garantía central del backtest): se descarta toda
      // afectación cuyo rigeDesde sea POSTERIOR a asOf — un parte futuro nunca
      // es antecedente de un instante simulado. También se descarta lo que cae
      // fuera de la ventana hacia atrás. El filtro va en memoria para que la
      // comparación sea explícita (mismo criterio que contarAntecedentesVigentes
      // de motor/calculo.ts).
      const antecedentes: AntecedenteHistorial[] = []
      let duracionTotalHoras = 0

      for (const fila of filas) {
        const rigeMs = Date.parse(fila.rigeDesde)
        if (Number.isNaN(rigeMs) || rigeMs > asOfMs || rigeMs < desdeMs) continue

        // Si retiradaEn es null O posterior a asOf, la afectación seguía
        // vigente en el instante simulado: la duración se corta en asOf, nunca
        // se usa un cierre futuro como si ya hubiera ocurrido.
        const retiradaMs = fila.retiradaEn === null ? null : Date.parse(fila.retiradaEn)
        const finMs = retiradaMs !== null && retiradaMs <= asOfMs ? retiradaMs : asOfMs
        const duracionHoras = Math.max(0, (finMs - rigeMs) / MS_POR_HORA)

        duracionTotalHoras += duracionHoras
        antecedentes.push({
          motivo: fila.motivo,
          categoria: fila.categoria,
          rigeDesde: fila.rigeDesde,
          retiradaEn: fila.retiradaEn,
          accesoInterrumpido: fila.motivo === 'Acceso interrumpido',
        })
      }

      return {
        cueAnexo,
        cantidadConfirmadas: antecedentes.length,
        duracionTotalHoras,
        accesoInterrumpidoCantidad: antecedentes.filter((a) => a.accesoInterrumpido).length,
        antecedentes,
      }
    },
  }
}
