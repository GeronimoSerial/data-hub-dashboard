import { CUE_ANEXO_OPERADOR, ESPERADOS, ESPERADOS_RADAR, ESPERADOS_RIESGO } from '../seed/esperados'
import { compararSnapshot } from './snapshot'
import { expect, test } from './base'

// Contratos del grupo riesgo y radar (plan §4.6, B2.8). Cada respuesta se compara con valores
// del manifiesto y con un snapshot normalizado. Los campos que cambian en cada corrida del
// seed (edad relativa a "ahora") se quitan antes del snapshot y se afirman por separado.

type EscuelaRiesgoRespuesta = {
  snapshot: { cueAnexo: string; horizonteHoras: number; nivelRiesgo: string; scoreRiesgo: number; nivelAmenaza: string } | null
  factores: unknown[]
}

type ItemRadar = {
  cueAnexo: string
  departamento: string
  horizonteHoras: number
  scoreRiesgo: number | null
  nivelRiesgo: string
  confianza: string
  scoreAmenaza: number
  scoreVulnerabilidad: number
  exposicionMatricula: number
  exposicionSecciones: number
}

type RespuestaRadar = {
  corte: { runId: string; modeloVersion: string } | null
  escuelas: { items: ItemRadar[]; total: number }
  kpis: { riesgoAltoTotal: number; sinEvidenciaTotal: number }
  puntos: Array<{ cueAnexo: string; nivelRiesgo: string }>
  departamentos: Array<{ departamento: string; horizonteHoras: number; peorNivel: string; celdas: number }>
  hayNivelProvisorio: boolean
}

type RespuestaRadarMeteo = {
  runId: string | null
  gridVersion: string
  sinDatos: boolean
  frescura: { edadMinutos: number; desactualizado: boolean } | null
  unidades: Record<string, string>
  grid: { celdas: Array<{ id: string }> } | null
  valores: Record<string, number[][]>
}

type CeldaObservada = {
  geometryRef: string
  acumuladoMm: number
  granulos: number
  esperados: number
  parcial: boolean
}

type RespuestaObservada = {
  horas: number
  vencida: boolean
  edadHoras: number | null
  geojson: { features: Array<{ properties: CeldaObservada }> }
}

// Escuelas por nivel de riesgo del seed (ESPERADOS.riesgo.escuelas): una por nivel.
const CUE_BAJO = '1801899-00' // Capital, score 12
const CUE_MODERADO = CUE_ANEXO_OPERADOR // 1800554-00, Capital, score 42
const CUE_ALTO = '1801477-00' // Capital, score 61
const CUE_MUY_ALTO = '1800953-00' // Goya, score 88
const CUE_SIN_SNAPSHOT = '1800643-00' // Capital, en el roster sin corrida de riesgo

// El radar devuelve el departamento normalizado por geo-perfil (mayúsculas), no el nombre del roster.
const DEPARTAMENTO_EN_RADAR: Record<string, string> = {
  Capital: 'CAPITAL',
  Goya: 'GOYA',
  'Paso de los Libres': 'PASO DE LOS LIBRES',
  'Santo Tomé': 'SANTO TOME',
}

function esperadoEscuela(cue: string) {
  const esperado = ESPERADOS_RIESGO.escuelas.find((escuela) => escuela.cueAnexo === cue)
  if (!esperado) throw new Error(`CUE ${cue} no está en ESPERADOS_RIESGO.escuelas`)
  return esperado
}

// Quita los valores que dependen del reloj del seed: se afirman aparte, nunca en el snapshot.
function sinEdad<T extends { frescura?: unknown; edadHoras?: unknown }>(cuerpo: T): Omit<T, 'frescura' | 'edadHoras'> {
  const { frescura: _frescura, edadHoras: _edadHoras, ...resto } = cuerpo
  return resto
}

for (const [nivel, cue] of [
  ['bajo', CUE_BAJO],
  ['moderado', CUE_MODERADO],
  ['alto', CUE_ALTO],
  ['muy_alto', CUE_MUY_ALTO],
] as const) {
  test(`riesgo por escuela (${nivel}): ${cue} devuelve el nivel y el score del seed`, async ({ apiAdmin }) => {
    const esperado = esperadoEscuela(cue)

    const respuesta = await apiAdmin.get(`/api/infraestructura/riesgo/escuela/${cue}`)
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as EscuelaRiesgoRespuesta

    expect(cuerpo.snapshot).not.toBeNull()
    expect(cuerpo.snapshot).toMatchObject({
      cueAnexo: cue,
      horizonteHoras: ESPERADOS_RIESGO.horizonteHoras,
      nivelRiesgo: esperado.nivelRiesgo,
      scoreRiesgo: esperado.scoreRiesgo,
      nivelAmenaza: esperado.nivelAmenaza,
    })
    compararSnapshot(`riesgo-radar-riesgo-escuela-${nivel}`, cuerpo)
  })
}

test('riesgo por escuela: escuela sin corrida vigente responde snapshot null y sin factores', async ({ apiAdmin }) => {
  const respuesta = await apiAdmin.get(`/api/infraestructura/riesgo/escuela/${CUE_SIN_SNAPSHOT}`)
  expect(respuesta.status()).toBe(200)
  const cuerpo = (await respuesta.json()) as EscuelaRiesgoRespuesta
  expect(cuerpo.snapshot).toBeNull()
  expect(cuerpo.factores).toEqual([])
  compararSnapshot('riesgo-radar-riesgo-escuela-sin-snapshot', cuerpo)
})

test('riesgo por escuela: la escuela del operador responde con su nivel moderado (score 42)', async ({ apiAdmin, apiOperador }) => {
  const respuesta = await apiAdmin.get(`/api/infraestructura/riesgo/escuela/${CUE_ANEXO_OPERADOR}`)
  expect(respuesta.status()).toBe(200)
  const cuerpo = (await respuesta.json()) as EscuelaRiesgoRespuesta
  expect(cuerpo.snapshot).toMatchObject({ nivelRiesgo: 'moderado', scoreRiesgo: 42 })

  const respuestaOperador = await apiOperador.get(`/api/infraestructura/riesgo/escuela/${CUE_ANEXO_OPERADOR}`)
  expect(respuestaOperador.status()).toBe(403)
  compararSnapshot('riesgo-radar-riesgo-escuela-operador-sin-acceso', await respuestaOperador.json())
})

test('riesgo por escuela: sin sesión responde 401', async ({ apiAnonimo }) => {
  const respuesta = await apiAnonimo.get(`/api/infraestructura/riesgo/escuela/${CUE_MODERADO}`)
  expect(respuesta.status()).toBe(401)
})

test('radar: 12 escuelas con riesgo vigente a 72 h, con los valores del manifiesto', async ({ apiAdmin }) => {
  const respuesta = await apiAdmin.get('/api/infraestructura/radar?horizonte=72&pageSize=200')
  expect(respuesta.status()).toBe(200)
  const cuerpo = (await respuesta.json()) as RespuestaRadar

  expect(cuerpo.corte?.modeloVersion).toBeTruthy()
  expect(cuerpo.escuelas.total).toBe(ESPERADOS_RIESGO.escuelas.length)
  expect(cuerpo.kpis.riesgoAltoTotal).toBe(ESPERADOS_RIESGO.porNivel.alto + ESPERADOS_RIESGO.porNivel.muy_alto)
  expect(cuerpo.kpis.sinEvidenciaTotal).toBe(0)

  for (const esperado of ESPERADOS_RIESGO.escuelas) {
    const item = cuerpo.escuelas.items.find((fila) => fila.cueAnexo === esperado.cueAnexo)
    expect(item, `escuela ${esperado.cueAnexo} en el ranking`).toMatchObject({
      departamento: DEPARTAMENTO_EN_RADAR[esperado.departamento],
      horizonteHoras: ESPERADOS_RIESGO.horizonteHoras,
      scoreRiesgo: esperado.scoreRiesgo,
      nivelRiesgo: esperado.nivelRiesgo,
      confianza: esperado.confianza,
      scoreAmenaza: esperado.scoreAmenaza,
      scoreVulnerabilidad: esperado.scoreVulnerabilidad,
      exposicionMatricula: esperado.exposicionMatricula,
      exposicionSecciones: esperado.exposicionSecciones,
    })
  }

  for (const nivel of ['bajo', 'moderado', 'alto', 'muy_alto'] as const) {
    const filtrada = await apiAdmin.get(`/api/infraestructura/radar?horizonte=72&nivel=${nivel}&pageSize=200`)
    expect(filtrada.status()).toBe(200)
    const cuerpoFiltrado = (await filtrada.json()) as RespuestaRadar
    expect(cuerpoFiltrado.escuelas.total, `escuelas en nivel ${nivel}`).toBe(ESPERADOS_RIESGO.porNivel[nivel])
  }


  // Peligro por departamento: el seed escribe pronóstico de precipitación por celda, sin climatología,
  // así que los niveles salen del umbral provisorio (hayNivelProvisorio).
  expect(cuerpo.hayNivelProvisorio).toBe(true)
  for (const [departamento, { nivel }] of Object.entries(ESPERADOS_RADAR.peligroPorDepartamento)) {
    for (const horizonte of [24, 72, 240] as const) {
      const fila = cuerpo.departamentos.find(
        (entrada) => entrada.departamento === DEPARTAMENTO_EN_RADAR[departamento] && entrada.horizonteHoras === horizonte,
      )
      expect(fila?.peorNivel, `${departamento} a ${horizonte} h`).toBe(nivel[horizonte])
    }
  }
  compararSnapshot('riesgo-radar-radar', cuerpo)
})

test('radar (consulta-infra): responde el mismo cuerpo que admin', async ({ apiAdmin, apiConsultaInfra }) => {
  const respuesta = await apiConsultaInfra.get('/api/infraestructura/radar?horizonte=72&pageSize=200')
  expect(respuesta.status()).toBe(200)
  const cuerpo = (await respuesta.json()) as RespuestaRadar
  const cuerpoAdmin = (await (await apiAdmin.get('/api/infraestructura/radar?horizonte=72&pageSize=200')).json()) as RespuestaRadar
  expect(cuerpo).toEqual(cuerpoAdmin)
  compararSnapshot('riesgo-radar-radar-consulta-infra', cuerpo)
})

test('radar: sin sesión responde 401', async ({ apiAnonimo }) => {
  const respuesta = await apiAnonimo.get('/api/infraestructura/radar?horizonte=72')
  expect(respuesta.status()).toBe(401)
})

test('radar-meteo: grilla con la versión del seed, 24 mm acumulados por celda en las primeras 24 h', async ({ apiAdmin }) => {
  const respuesta = await apiAdmin.get('/api/infraestructura/radar-meteo?variables=precipitation&paso=3')
  expect(respuesta.status()).toBe(200)
  const cuerpo = (await respuesta.json()) as RespuestaRadarMeteo

  expect(cuerpo.sinDatos).toBe(false)
  expect(cuerpo.gridVersion).toBe(ESPERADOS_RADAR.gridVersion)
  expect(cuerpo.gridVersion).toBe('corrientes-0.2-v1')
  expect(cuerpo.unidades.precipitation).toBe('mm')
  expect(cuerpo.frescura?.desactualizado).toBe(false)

  const celdas = cuerpo.grid?.celdas.length ?? 0
  expect(celdas).toBeGreaterThan(0)
  const grupos = cuerpo.valores.precipitation
  // Paso de 3 h: los 8 primeros grupos suman 1 mm/h x 3 h = 3 mm cada uno; el resto es 0.
  expect(grupos).toHaveLength(24)
  for (let celda = 0; celda < celdas; celda++) {
    const acumulado = grupos.reduce((suma, grupo) => suma + (grupo[celda] ?? 0), 0)
    expect(acumulado, `acumulado 24 h de la celda ${celda}`).toBe(ESPERADOS_RADAR.corrida.lluviaAcumulada24hMm)
    expect(grupos[0][celda]).toBe(3)
    expect(grupos[8][celda]).toBe(0)
  }

  compararSnapshot('riesgo-radar-radar-meteo', sinEdad(cuerpo as unknown as Record<string, unknown>))
})

test('radar-meteo: sin sesión responde 401', async ({ apiAnonimo }) => {
  const respuesta = await apiAnonimo.get('/api/infraestructura/radar-meteo?variables=precipitation')
  expect(respuesta.status()).toBe(401)
})

test('radar-meteo/alertas: una alerta SMN de Tormentas sobre Capital y Goya', async ({ apiAdmin }) => {
  const respuesta = await apiAdmin.get('/api/infraestructura/radar-meteo/alertas')
  expect(respuesta.status()).toBe(200)
  const cuerpo = (await respuesta.json()) as { alertas: Array<Record<string, unknown>> }

  expect(cuerpo.alertas).toHaveLength(1)
  expect(cuerpo.alertas[0]).toMatchObject({
    id: ESPERADOS.radar.alerta.id,
    event: ESPERADOS_RADAR.alerta.event,
    severity: ESPERADOS_RADAR.alerta.severidadEspanol,
    severityCap: ESPERADOS_RADAR.alerta.severity,
    headline: ESPERADOS_RADAR.alerta.headline,
    departamentos: ESPERADOS_RADAR.alerta.departamentos.map((nombre) => ({ nombre })),
  })
  compararSnapshot('riesgo-radar-radar-meteo-alertas', cuerpo)
})

test('radar-meteo/alertas: sin sesión responde 401', async ({ apiAnonimo }) => {
  const respuesta = await apiAnonimo.get('/api/infraestructura/radar-meteo/alertas')
  expect(respuesta.status()).toBe(401)
})

for (const horas of [24, 72] as const) {
  test(`peligro observado-grilla (${horas} h): acumulado IMERG por celda del seed, con cobertura parcial`, async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get(`/api/infraestructura/peligro/observado-grilla?horas=${horas}`)
    expect(respuesta.status()).toBe(200)
    const cuerpo = (await respuesta.json()) as RespuestaObservada

    expect(cuerpo.horas).toBe(horas)
    // Los granulos del seed son recientes (30 min antes de sembrar): la observación no está vencida.
    expect(cuerpo.vencida).toBe(false)
    expect(cuerpo.edadHoras).toBeLessThanOrEqual(6)

    const porCelda = new Map(cuerpo.geojson.features.map((feature) => [feature.properties.geometryRef, feature.properties]))
    expect(porCelda.size).toBe(ESPERADOS_RADAR.lluviaObservada.celdas.length)
    for (const esperada of ESPERADOS_RADAR.lluviaObservada.celdas) {
      expect(porCelda.get(esperada.geometryRef), `celda ${esperada.geometryRef}`).toMatchObject({
        acumuladoMm: esperada.acumuladoMm,
        granulos: esperada.granulosMm.length,
        esperados: horas * 2,
        parcial: true,
      })
    }

    compararSnapshot(`riesgo-radar-peligro-observado-grilla-${horas}h`, sinEdad(cuerpo as unknown as Record<string, unknown>))
  })
}

test('peligro observado-grilla: sin sesión responde 401', async ({ apiAnonimo }) => {
  const respuesta = await apiAnonimo.get('/api/infraestructura/peligro/observado-grilla?horas=24')
  expect(respuesta.status()).toBe(401)
})
