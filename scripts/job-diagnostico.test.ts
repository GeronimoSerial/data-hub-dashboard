import { describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { codigoSalida, correrDiagnostico } from './job-diagnostico.mjs'

usarDbTemporal('job-diagnostico', { seed: false })

// Un solo directorio para todo el archivo: getDb() (usado internamente por
// job-diagnostico.mjs) memoiza la conexión en el primer uso dentro de este
// módulo de test, así que un directorio nuevo por test dejaría al segundo
// test hablándole a un archivo que el primero ya borró.

describe('correrDiagnostico', () => {
  it('ejecuta los chequeos y publica un resultado completado', async () => {
    const r = await correrDiagnostico({ claveIdempotente: 'test-1' })
    expect(r).toMatchObject({
      ejecutado: true,
      chequeos: { db: true, dataDir: true },
      leasePerdido: false,
    })
  })

  it('dos invocaciones con la misma clave no publican dos resultados', async () => {
    const primera = await correrDiagnostico({ claveIdempotente: 'test-2' })
    expect(primera.ejecutado).toBe(true)

    const segunda = await correrDiagnostico({ claveIdempotente: 'test-2' })
    expect(segunda).toEqual({ ejecutado: false, motivo: 'ya_completado' })
  })

  it('si el lease se pierde durante la ejecución (recuperado por otro proceso), no publica un resultado falso — devuelve leasePerdido:true', async () => {
    // La carrera real de dos procesos compitiendo por el mismo lease (fencing)
    // está cubierta por lib/infraestructura/riesgo/job-run.test.ts. Acá forzamos
    // el caso puntual que le importa a este script: que publicarResultado haya
    // devuelto false. Para eso mockeamos sólo publicarResultado (dejando el
    // adquirirLease real de job-run.ts) y reimportamos el script con el módulo
    // fresco, de modo que el mock no afecte a los tests anteriores.
    vi.resetModules()
    vi.doMock('../lib/infraestructura/riesgo/job-run.ts', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('../lib/infraestructura/riesgo/job-run.ts')>()
      return { ...actual, publicarResultado: vi.fn(async () => false) }
    })

    try {
      const { correrDiagnostico: correrConLeasePerdido } = await import('./job-diagnostico.mjs')
      const r = await correrConLeasePerdido({ claveIdempotente: 'test-lease-perdido' })

      expect(r).toMatchObject({
        ejecutado: true,
        chequeos: { db: true, dataDir: true },
        leasePerdido: true,
      })
    } finally {
      vi.doUnmock('../lib/infraestructura/riesgo/job-run.ts')
      vi.resetModules()
    }
  })
})

describe('codigoSalida', () => {
  it('devuelve 3 cuando el job corrió pero perdió el lease', () => {
    expect(codigoSalida({ ejecutado: true, leasePerdido: true })).toBe(3)
  })

  it('devuelve 0 cuando el job corrió y publicó el resultado', () => {
    expect(codigoSalida({ ejecutado: true, leasePerdido: false })).toBe(0)
  })

  it('devuelve 0 cuando no se pudo adquirir el lease (idempotencia normal)', () => {
    expect(codigoSalida({ ejecutado: false, motivo: 'ya_completado' })).toBe(0)
    expect(codigoSalida({ ejecutado: false, motivo: 'en_progreso_vigente' })).toBe(0)
  })
})
