import { compararSnapshot } from './snapshot'
import { proyectarSerieDiaria } from './serie-diaria'
import { expect, test } from './base'
import { cuentaPorClave } from '../cuentas-qa'
import { CUE_ANEXO_OPERADOR, DEPARTAMENTOS_ESCUELAS, ESPERADOS, NIVEL_CON_ESCUELAS } from '../seed/esperados'

// Contratos de las rutas de lectura del mapa de infraestructura. Cada respuesta se afirma con
// valores del manifiesto y se fija en un snapshot. Las cuentas vienen de contratos/base.ts.

const RUTA = '/api/mapas/infraestructura'

// Escuelas del roster sin coordenadas (ver seed/escuelas.ts): no aparecen en `escuelas`, sí en `sinUbicacion`.
const CUES_SIN_UBICACION = ['1801018-00', '1801176-01']

type EscuelaMapa = {
  cueAnexo: string
  departamento: string
  estado: 'afectada' | 'sin_afectacion_reportada'
  nivelJurisdiccional?: { id: number } | null
}

type RespuestaEscuelas = {
  escuelas: EscuelaMapa[]
  sinUbicacion: Array<{ cueAnexo: string; departamento: string }>
  totalPadron: number
}

function contarPorDepartamento<T extends { departamento: string }>(items: readonly T[]): Record<string, number> {
  return Object.fromEntries(DEPARTAMENTOS_ESCUELAS.map((d) => [d, items.filter((i) => i.departamento === d).length]))
}

test.describe('GET /escuelas', () => {
  test('admin ve las 30 escuelas con coordenadas y las 2 sin ubicacion, con conteos por departamento y nivel', async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get(`${RUTA}/escuelas`)
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as RespuestaEscuelas

    expect(cuerpo.escuelas).toHaveLength(ESPERADOS.escuelas.conCoordenadas)
    expect(cuerpo.totalPadron).toBe(ESPERADOS.escuelas.total)
    expect(cuerpo.sinUbicacion.map((e) => e.cueAnexo).sort()).toEqual(CUES_SIN_UBICACION)
    expect(contarPorDepartamento(cuerpo.escuelas)).toEqual(ESPERADOS.escuelas.porDepartamentoConCoordenadas)

    const porNivel: Record<number, number> = {}
    for (const escuela of cuerpo.escuelas) {
      const id = escuela.nivelJurisdiccional?.id
      if (id !== undefined) porNivel[id] = (porNivel[id] ?? 0) + 1
    }
    expect(porNivel).toEqual(ESPERADOS.escuelas.porNivelConCoordenadas)

    // Escuelas con parte visible en el mapa: 17 (ver seed/partes.ts).
    expect(cuerpo.escuelas.filter((e) => e.estado === 'afectada')).toHaveLength(ESPERADOS.partes.visibles.total)

    compararSnapshot('mapas-escuelas', cuerpo)
  })

  test('director de nivel 1 ve solo las 12 escuelas de su nivel', async ({ apiDirector }) => {
    const respuesta = await apiDirector.get(`${RUTA}/escuelas`)
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as RespuestaEscuelas

    expect(cuerpo.escuelas).toHaveLength(ESPERADOS.alcanceDirectorNivel.escuelas)
    expect(cuerpo.escuelas.every((e) => e.nivelJurisdiccional?.id === NIVEL_CON_ESCUELAS)).toBe(true)
    expect(cuerpo.sinUbicacion).toHaveLength(0)

    compararSnapshot('mapas-escuelas-director-nivel', cuerpo)
  })

  test('consulta con seccion infraestructura ve las 30 escuelas con coordenadas', async ({ apiConsultaInfra }) => {
    const respuesta = await apiConsultaInfra.get(`${RUTA}/escuelas`)
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as RespuestaEscuelas
    expect(cuerpo.escuelas).toHaveLength(ESPERADOS.escuelas.conCoordenadas)
  })

  test('anonimo recibe 401 sin datos', async ({ apiAnonimo }) => {
    const respuesta = await apiAnonimo.get(`${RUTA}/escuelas`)
    expect(respuesta.status()).toBe(401)
    expect(await respuesta.json()).toEqual({ error: 'No autenticado' })
  })

  test('director sin alcance recibe 403', async ({ playwright, baseURL }) => {
    const contexto = await playwright.request.newContext({
      baseURL,
      storageState: cuentaPorClave('director-sin-alcance').storageStatePath,
    })
    try {
      const respuesta = await contexto.get(`${RUTA}/escuelas`)
      expect(respuesta.status()).toBe(403)
    } finally {
      await contexto.dispose()
    }
  })
})

test.describe('GET /totales', () => {
  test('admin recibe por departamento el total y las afectadas del manifiesto', async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get(`${RUTA}/totales`)
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as {
      departamentos: Array<{ departamentoOriginal: string; totalEscuelas: number; escuelasAfectadas: number }>
      provincia: { totalEscuelas: number; escuelasAfectadas: number }
    }

    expect(cuerpo.departamentos).toHaveLength(DEPARTAMENTOS_ESCUELAS.length)
    for (const departamento of DEPARTAMENTOS_ESCUELAS) {
      const fila = cuerpo.departamentos.find((d) => d.departamentoOriginal === departamento)
      expect(fila, departamento).toBeDefined()
      expect(fila?.totalEscuelas, departamento).toBe(ESPERADOS.escuelas.porDepartamento[departamento])
      expect(fila?.escuelasAfectadas, departamento).toBe(ESPERADOS.partes.visibles.porDepartamento[departamento])
    }
    expect(cuerpo.provincia.totalEscuelas).toBe(ESPERADOS.escuelas.total)
    expect(cuerpo.provincia.escuelasAfectadas).toBe(ESPERADOS.partes.visibles.total)

    compararSnapshot('mapas-totales', cuerpo)
  })
})

test.describe('GET /territorio', () => {
  test('admin recibe el aislamiento de cada escuela aislada con los niveles del manifiesto', async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get(`${RUTA}/territorio`)
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as {
      aislamiento: {
        fuente: string
        escuelas: Record<string, { nivel: number | string; cruces: number | null; alternativaSinCruce: boolean | null }>
      } | null
    }

    expect(cuerpo.aislamiento?.fuente).toBe('OpenStreetMap')
    const escuelas = cuerpo.aislamiento?.escuelas ?? {}
    expect(Object.keys(escuelas).sort()).toEqual([...ESPERADOS.radar.escuelasAisladas.cues].sort())
    for (const esperado of ESPERADOS.radar.aislamiento) {
      expect(escuelas[esperado.cueAnexo], esperado.cueAnexo).toMatchObject({
        nivel: esperado.nivel,
        cruces: esperado.cruces,
        alternativaSinCruce: esperado.alternativaSinCruce,
      })
    }

    compararSnapshot('mapas-territorio', cuerpo)
  })

  test('anonimo recibe 401', async ({ apiAnonimo }) => {
    const respuesta = await apiAnonimo.get(`${RUTA}/territorio`)
    expect(respuesta.status()).toBe(401)
  })
})

test.describe('GET /parte', () => {
  test('parte de la escuela del operador: una afectacion Inundacion Media', async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get(`${RUTA}/parte`, { params: { cue: CUE_ANEXO_OPERADOR } })
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as {
      ok: boolean
      parte: unknown
      afectaciones: Array<{ motivo: string; severidad: string }>
      recientes: unknown[]
    }

    expect(cuerpo.ok).toBe(true)
    expect(cuerpo.parte).not.toBeNull()
    expect(cuerpo.afectaciones).toHaveLength(1)
    expect(cuerpo.afectaciones[0]).toMatchObject({ motivo: 'Inundación', severidad: 'Media' })

    compararSnapshot('mapas-parte', cuerpo)
  })

  test('escuela con solucion reciente: sin parte vigente y una solucionada en recientes; fuera de la ventana no cuenta', async ({ apiAdmin }) => {
    const reciente = await apiAdmin.get(`${RUTA}/parte`, { params: { cue: '1801644-00' } })
    expect(reciente.status()).toBe(200)
    const cuerpoReciente = (await reciente.json()) as {
      parte: unknown
      afectaciones: unknown[]
      recientes: Array<{ motivo: string; severidad: string }>
    }
    // El parte existe (cabecera con estado habitual) pero sin afectaciones activas: la solucionada cuenta como reciente.
    expect(cuerpoReciente.parte).not.toBeNull()
    expect(cuerpoReciente.afectaciones).toHaveLength(0)
    expect(cuerpoReciente.recientes).toHaveLength(1)
    expect(cuerpoReciente.recientes[0]).toMatchObject({ motivo: 'Inundación', severidad: 'Media' })
    compararSnapshot('mapas-parte-solucionada-reciente', cuerpoReciente)

    const fuera = await apiAdmin.get(`${RUTA}/parte`, { params: { cue: '1800887-00' } })
    expect(fuera.status()).toBe(200)
    expect(((await fuera.json()) as { recientes: unknown[] }).recientes).toHaveLength(0)
  })

  test('CUE vacio responde 400', async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get(`${RUTA}/parte`, { params: { cue: '' } })
    expect(respuesta.status()).toBe(400)
    expect(await respuesta.json()).toEqual({ error: 'CUE inválido' })
  })
})

test.describe('GET /historial', () => {
  test('historial de 1800117-00: cinco movimientos, el mas reciente primero', async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get(`${RUTA}/historial`, { params: { cue: ESPERADOS.historial.cue } })
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as { movimientos: Array<{ tipo: string }> }

    expect(cuerpo.movimientos.map((m) => m.tipo)).toEqual(ESPERADOS.historial.tipos)

    compararSnapshot('mapas-historial', cuerpo)
  })
})

// The two daily series grow by one point per day (start of the period .. today), so their raw length depends on the
// day the suite runs. They are projected by serie-diaria.ts, which also asserts they are contiguous and end today.
function conSeriesDiariasProyectadas<T extends { serieEscuelasServicioCaido: Array<{ fecha: string }>; alumnosAcumulados: Array<{ fecha: string }> }>(
  cuerpo: T,
) {
  return {
    ...cuerpo,
    serieEscuelasServicioCaido: proyectarSerieDiaria(cuerpo.serieEscuelasServicioCaido),
    alumnosAcumulados: proyectarSerieDiaria(cuerpo.alumnosAcumulados),
  }
}

test.describe('GET /evolucion', () => {
  test('admin recibe el ranking por departamento y las afectaciones vigentes del manifiesto', async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get(`${RUTA}/evolucion`)
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as {
      rankingDepartamentos: Array<{ departamento: string; escuelasAfectadas: number; alumnosAlcanzados: number }>
      distribucionMotivo: Array<{ afectacionesVigentes: number }>
      serieEscuelasServicioCaido: Array<{ fecha: string; escuelas: number }>
      alumnosAcumulados: Array<{ fecha: string; alumnosAcumulados: number }>
    }

    expect(cuerpo.rankingDepartamentos).toEqual(ESPERADOS.evolucion.rankingDepartamentos)
    const totalAfectaciones = cuerpo.distribucionMotivo.reduce((suma, fila) => suma + fila.afectacionesVigentes, 0)
    expect(totalAfectaciones).toBe(ESPERADOS.evolucion.afectacionesVigentes)

    compararSnapshot('mapas-evolucion', conSeriesDiariasProyectadas(cuerpo))
  })

  test('filtro por departamento Goya deja solo Goya con sus 4 escuelas afectadas', async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get(`${RUTA}/evolucion`, { params: { departamento: 'Goya' } })
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as {
      rankingDepartamentos: Array<{ departamento: string; escuelasAfectadas: number }>
      serieEscuelasServicioCaido: Array<{ fecha: string; escuelas: number }>
      alumnosAcumulados: Array<{ fecha: string; alumnosAcumulados: number }>
    }

    expect(cuerpo.rankingDepartamentos).toEqual([ESPERADOS.evolucion.rankingDepartamentos[1]])
    compararSnapshot('mapas-evolucion-goya', conSeriesDiariasProyectadas(cuerpo))
  })
})

test.describe('GET /nominal', () => {
  test('admin obtiene el alcance nominal de la afectacion del operador', async ({ apiAdmin }) => {
    const parte = await apiAdmin.get(`${RUTA}/parte`, { params: { cue: CUE_ANEXO_OPERADOR } })
    const afectacionId = ((await parte.json()) as { afectaciones: Array<{ id: string }> }).afectaciones[0]?.id
    expect(afectacionId).toBeTruthy()

    const respuesta = await apiAdmin.get(`${RUTA}/nominal`, { params: { afectacionId: afectacionId ?? '' } })
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as { cantidad: number; secciones: unknown[] }
    // El seed carga una sola seccion con 12 alumnos para la escuela del operador. Un cambio de seed lo hara fallar.
    expect(cuerpo).toEqual({
      cantidad: 12,
      secciones: [{ geSectionId: 990001, curso: '1', division: 'A', turno: 'Mañana', alumnos: [] }],
    })
    compararSnapshot('mapas-nominal-admin', cuerpo)
  })

  test('consulta sin nominal recibe 403 aunque la afectacion exista', async ({ apiAdmin, apiConsultaInfra }) => {
    const parte = await apiAdmin.get(`${RUTA}/parte`, { params: { cue: CUE_ANEXO_OPERADOR } })
    const afectacionId = ((await parte.json()) as { afectaciones: Array<{ id: string }> }).afectaciones[0]?.id ?? ''

    const respuesta = await apiConsultaInfra.get(`${RUTA}/nominal`, { params: { afectacionId } })
    expect(respuesta.status()).toBe(403)
  })

  test('operador y anonimo no obtienen el nominal de la afectacion del operador', async ({ apiAdmin, apiOperador, apiAnonimo }) => {
    const parte = await apiAdmin.get(`${RUTA}/parte`, { params: { cue: CUE_ANEXO_OPERADOR } })
    const afectacionId = ((await parte.json()) as { afectaciones: Array<{ id: string }> }).afectaciones[0]?.id ?? ''

    const operador = await apiOperador.get(`${RUTA}/nominal`, { params: { afectacionId } })
    expect(operador.status()).toBe(403)

    const anonimo = await apiAnonimo.get(`${RUTA}/nominal`, { params: { afectacionId } })
    expect(anonimo.status()).toBe(401)
  })

  test('director de nivel 1 obtiene el nominal de la afectacion del operador: su escuela esta en su alcance (GE)', async ({ apiAdmin, apiDirector }) => {
    // La escuela del operador figura en la lista de 12 escuelas del director de nivel 1 (ge_escuela_nivel_jur),
    // aunque el roster la marque con nivel 2. La regla de alcance del nominal usa ge_escuela_nivel_jur.
    const parte = await apiAdmin.get(`${RUTA}/parte`, { params: { cue: CUE_ANEXO_OPERADOR } })
    const afectacionId = ((await parte.json()) as { afectaciones: Array<{ id: string }> }).afectaciones[0]?.id ?? ''

    const respuesta = await apiDirector.get(`${RUTA}/nominal`, { params: { afectacionId } })
    expect(respuesta.status()).toBe(200)
    expect(await respuesta.json()).toEqual({
      cantidad: 12,
      secciones: [{ geSectionId: 990001, curso: '1', division: 'A', turno: 'Mañana', alumnos: [] }],
    })
  })

  test('admin sin afectacionId recibe 400', async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get(`${RUTA}/nominal`)
    expect(respuesta.status()).toBe(400)
    expect(await respuesta.json()).toEqual({ error: 'Falta el parámetro afectacionId' })
  })
})
