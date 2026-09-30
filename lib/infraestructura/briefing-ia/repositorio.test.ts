// Tests de integración del repositorio de briefings contra una base libsql
// real, aislada en un tmpdir (mismo patrón que job-run.test.ts y
// recompute.test.ts): DATA_DIR a un tmpdir, ensureSeeded() una vez y getDb()
// memoizado. Un directorio por archivo de test, con la tabla limpiada antes de
// cada caso.
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { infraBriefing, infraSituacionCorte } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { corteSituacionBase } from './test-utils/corte-fixture'
import type { DatosNuevoBriefing } from './repositorio'
import {
  insertarBriefingSiNoExiste,
  obtenerBriefingPorId,
  obtenerUltimoBriefing,
  sumarCostoUsdMesVigente,
} from './repositorio'

usarDbTemporal('briefing-repositorio')

beforeEach(async () => {
  await getDb().delete(infraBriefing)
  await getDb().delete(infraSituacionCorte)
})

// infra_briefing.corte_id referencia infra_situacion_corte(id) (E5, ya
// mergeada): cada corteId usado en un test necesita su fila mínima antes de
// insertar el briefing, o la FK rechaza el insert.
async function crearCorte(id: string): Promise<void> {
  await getDb().insert(infraSituacionCorte).values(corteSituacionBase({
    id,
    generadoEn: '2026-01-01T00:00:00.000Z',
    creadaEn: '2026-01-01T00:00:00.000Z',
  }))
}

function datos(
  overrides: Partial<DatosNuevoBriefing> & { id: string; corteId: string },
): DatosNuevoBriefing {
  return {
    modelo: 'modelo-x',
    versionPrompt: 'v1',
    parametros: { umbral: 1 },
    salidaIa: { frases: [{ texto: 'ok', refs: [] }] },
    textoFinal: 'texto por defecto',
    fuente: 'ia',
    motivoFallback: null,
    tokensEntrada: 10,
    tokensSalida: 20,
    costoUsd: 0.01,
    latenciaMs: 100,
    validacion: { valida: true },
    auditoriaFallback: null,
    creadaEn: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('insertarBriefingSiNoExiste / obtenerBriefingPorId', () => {
  it('inserta un briefing nuevo y permite leerlo por id', async () => {
    await crearCorte('c-1')
    const creado = await insertarBriefingSiNoExiste(datos({ id: 'b-1', corteId: 'c-1' }))

    expect(creado.id).toBe('b-1')
    expect(creado.textoFinal).toBe('texto por defecto')

    const leido = await obtenerBriefingPorId('b-1')
    expect(leido).toEqual(creado)
  })

  it('devuelve null si el id no existe', async () => {
    expect(await obtenerBriefingPorId('no-existe')).toBeNull()
  })

  it('con el mismo corteId no pisa el briefing previo y devuelve el original', async () => {
    await crearCorte('c-repetido')
    const primero = await insertarBriefingSiNoExiste(
      datos({ id: 'b-original', corteId: 'c-repetido', textoFinal: 'primero' }),
    )
    const segundo = await insertarBriefingSiNoExiste(
      datos({ id: 'b-intento-2', corteId: 'c-repetido', textoFinal: 'segundo' }),
    )

    expect(segundo.id).toBe('b-original')
    expect(segundo.textoFinal).toBe('primero')
    expect(segundo).toEqual(primero)

    // El intento 2 no quedó persistido.
    expect(await obtenerBriefingPorId('b-intento-2')).toBeNull()
  })
})

describe('obtenerUltimoBriefing', () => {
  it('devuelve null cuando no hay briefings', async () => {
    expect(await obtenerUltimoBriefing()).toBeNull()
  })

  it('devuelve el de creadaEn más reciente', async () => {
    await crearCorte('c-ene')
    await crearCorte('c-mar')
    await crearCorte('c-feb')
    await insertarBriefingSiNoExiste(
      datos({ id: 'b-ene', corteId: 'c-ene', creadaEn: '2026-01-15T00:00:00.000Z' }),
    )
    await insertarBriefingSiNoExiste(
      datos({ id: 'b-mar', corteId: 'c-mar', creadaEn: '2026-03-01T00:00:00.000Z' }),
    )
    await insertarBriefingSiNoExiste(
      datos({ id: 'b-feb', corteId: 'c-feb', creadaEn: '2026-02-01T00:00:00.000Z' }),
    )

    const ultimo = await obtenerUltimoBriefing()
    expect(ultimo?.id).toBe('b-mar')
  })
})

describe('sumarCostoUsdMesVigente', () => {
  it('devuelve 0 cuando no hay briefings', async () => {
    expect(await sumarCostoUsdMesVigente(new Date('2030-05-15T00:00:00.000Z'))).toBe(0)
  })

  it('suma sólo los costoUsd del mes UTC indicado e ignora otros meses y los nulos', async () => {
    await crearCorte('cm-1')
    await crearCorte('cm-2')
    await crearCorte('cm-3')
    await crearCorte('cm-4')
    await crearCorte('cm-5')
    await insertarBriefingSiNoExiste(
      datos({ id: 'm-1', corteId: 'cm-1', creadaEn: '2030-05-01T00:00:00.000Z', costoUsd: 1.5 }),
    )
    await insertarBriefingSiNoExiste(
      datos({
        id: 'm-2',
        corteId: 'cm-2',
        creadaEn: '2030-05-31T23:59:59.999Z',
        costoUsd: 2.5,
      }),
    )
    // Primer instante del mes siguiente: queda afuera.
    await insertarBriefingSiNoExiste(
      datos({ id: 'm-3', corteId: 'cm-3', creadaEn: '2030-06-01T00:00:00.000Z', costoUsd: 100 }),
    )
    // Último instante del mes anterior: queda afuera.
    await insertarBriefingSiNoExiste(
      datos({
        id: 'm-4',
        corteId: 'cm-4',
        creadaEn: '2030-04-30T23:59:59.999Z',
        costoUsd: 50,
      }),
    )
    // Dentro del mes pero sin costo: no aporta.
    await insertarBriefingSiNoExiste(
      datos({ id: 'm-5', corteId: 'cm-5', creadaEn: '2030-05-10T00:00:00.000Z', costoUsd: null }),
    )

    const total = await sumarCostoUsdMesVigente(new Date('2030-05-15T00:00:00.000Z'))
    expect(total).toBeCloseTo(4, 10)
  })
})
