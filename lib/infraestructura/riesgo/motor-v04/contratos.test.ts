import { describe, expect, it } from 'vitest'
import {
  esquemaEstimacionV04,
  esquemaMetadatosRunV04,
  esquemaResultadoEscuelaV04,
  type ResultadoEscuelaV04,
} from './contratos'

const ASOF = '2026-10-17T18:00:00.000Z'

function noEstimable(ventanaHoras: 24 | 72 | 240, motivos: string[] = ['nivel_local_sin_distribucion']) {
  return { probabilidad: null, estado: 'no_estimable' as const, motivos, ventanaHoras }
}

function resultadoBase(horizonteHoras: 24 | 72 | 240 = 72): ResultadoEscuelaV04 {
  return {
    modeloVersion: 'motor-v0.4',
    modo: 'candidato',
    cueAnexo: '1800001-00',
    horizonteHoras,
    asOf: ASOF,
    ubicacion: { estado: 'con_coordenadas', motivos: [] },
    superacionTerreno: { principal: noEstimable(horizonteHoras), conservador: noEstimable(horizonteHoras) },
    interrupcionEducativa: {
      principal: noEstimable(horizonteHoras, ['accesos_sin_modelo_operativo']),
      conservador: noEstimable(horizonteHoras, ['accesos_sin_modelo_operativo']),
    },
    cotaIngresoEdificio: { valorM: null, motivo: 'umbral_ingreso_no_disponible' },
    calibracionEscolar: 'pendiente',
  }
}

describe('esquemaEstimacionV04', () => {
  it('acepta no_estimable con probabilidad nula y al menos un motivo', () => {
    expect(esquemaEstimacionV04.safeParse(noEstimable(24)).success).toBe(true)
  })

  it('rechaza no_estimable sin motivo', () => {
    expect(esquemaEstimacionV04.safeParse(noEstimable(24, [])).success).toBe(false)
  })

  it('rechaza no_estimable con probabilidad numérica, incluido 0', () => {
    for (const probabilidad of [0, 0.3]) {
      const r = esquemaEstimacionV04.safeParse({ ...noEstimable(24), probabilidad })
      expect(r.success).toBe(false)
    }
  })

  it('rechaza modelada o calibrada sin probabilidad: null no se reinterpreta como estimación', () => {
    for (const estado of ['modelada', 'calibrada'] as const) {
      const r = esquemaEstimacionV04.safeParse({
        probabilidad: null,
        estado,
        motivos: [],
        metodo: 'analogos',
        version: 'v1',
        ventanaHoras: 24,
      })
      expect(r.success).toBe(false)
    }
  })

  it('acepta modelada con probabilidad en 0..1, método y versión', () => {
    const r = esquemaEstimacionV04.safeParse({
      probabilidad: 0.25,
      estado: 'modelada',
      motivos: [],
      metodo: 'analogos',
      version: 'v1',
      ventanaHoras: 240,
    })
    expect(r.success).toBe(true)
  })

  it('rechaza modelada sin método o versión, y probabilidades fuera de 0..1', () => {
    const base = { estado: 'modelada', motivos: [], metodo: 'analogos', version: 'v1', ventanaHoras: 24 }
    expect(esquemaEstimacionV04.safeParse({ ...base, probabilidad: 0.2, metodo: undefined }).success).toBe(false)
    expect(esquemaEstimacionV04.safeParse({ ...base, probabilidad: 0.2, version: undefined }).success).toBe(false)
    expect(esquemaEstimacionV04.safeParse({ ...base, probabilidad: 1.2 }).success).toBe(false)
    expect(esquemaEstimacionV04.safeParse({ ...base, probabilidad: -0.1 }).success).toBe(false)
  })
})

describe('esquemaResultadoEscuelaV04', () => {
  it('acepta un resultado con todos los eventos no_estimables', () => {
    expect(esquemaResultadoEscuelaV04.safeParse(resultadoBase()).success).toBe(true)
  })

  it('no admite un evento de agua en el edificio: el umbral de ingreso no está modelado', () => {
    const conAgua = { ...resultadoBase(), aguaEnEdificio: resultadoBase().superacionTerreno }
    expect(esquemaResultadoEscuelaV04.safeParse(conAgua).success).toBe(false)
    const conCota = { ...resultadoBase(), cotaIngresoEdificio: { valorM: 42.1, motivo: 'umbral_ingreso_no_disponible' } }
    expect(esquemaResultadoEscuelaV04.safeParse(conCota).success).toBe(false)
  })

  it('exige que la ventana de cada estimación coincida con el horizonte', () => {
    const r = resultadoBase(72)
    r.superacionTerreno.principal = noEstimable(24)
    expect(esquemaResultadoEscuelaV04.safeParse(r).success).toBe(false)
  })

  it('rechaza horizontes fuera de 24/72/240', () => {
    expect(esquemaResultadoEscuelaV04.safeParse({ ...resultadoBase(), horizonteHoras: 48 }).success).toBe(false)
  })

  it('una escuela sin coordenadas exige motivo de ubicación', () => {
    const r = { ...resultadoBase(), ubicacion: { estado: 'sin_coordenadas', motivos: [] } }
    expect(esquemaResultadoEscuelaV04.safeParse(r).success).toBe(false)
  })
})

describe('esquemaMetadatosRunV04', () => {
  const metadatos = {
    modeloVersion: 'motor-v0.4',
    modo: 'candidato',
    asOf: ASOF,
    creadaEn: ASOF,
    publicadaEn: null,
    padronVersion: 'padron-sha256:abc',
    configHash: 'sha256:def',
    insumosHash: 'sha256:123',
    estadoCalibracionEscolar: 'pendiente',
    cobertura: {
      totalPadron: 3,
      conCoordenadas: 2,
      sinUbicacionUtilizable: 1,
      resultadosEsperados: 9,
      resultadosEmitidos: 9,
      porEventoHorizonte: [
        { evento: 'superacionTerreno', escenario: 'principal', horizonteHoras: 24, modeladas: 0, calibradas: 0, noEstimables: 3 },
      ],
      abstencionesPorMotivo: { nivel_local_sin_distribucion: 9 },
    },
  }

  it('acepta metadatos de un candidato sin publicación', () => {
    expect(esquemaMetadatosRunV04.safeParse(metadatos).success).toBe(true)
  })

  it('un candidato nunca tiene fecha de publicación', () => {
    expect(esquemaMetadatosRunV04.safeParse({ ...metadatos, publicadaEn: ASOF }).success).toBe(false)
  })

  it('rechaza otra versión de modelo', () => {
    expect(esquemaMetadatosRunV04.safeParse({ ...metadatos, modeloVersion: 'motor-v0.3' }).success).toBe(false)
  })
})
