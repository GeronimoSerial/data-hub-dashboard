import { afterEach, beforeEach, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { replicarRiesgoV04, validarDestinosRiesgoV04 } from './lib/replicacion-riesgo-v04.mjs'

let origen: PGlite
let destino: PGlite
const schema = `
CREATE TABLE infra_periodo (id text PRIMARY KEY);
CREATE TABLE infra_risk_run (id text PRIMARY KEY, periodo_id text REFERENCES infra_periodo(id),
  modelo_version text, modo text, estado text, iniciado_en text, cobertura jsonb, metadatos jsonb);
CREATE UNIQUE INDEX vigente_unico ON infra_risk_run(estado) WHERE estado = 'vigente';
CREATE TABLE infra_risk_snapshot (id text PRIMARY KEY, run_id text REFERENCES infra_risk_run(id),
  cue_anexo text, horizonte_horas int, score_riesgo real, score_amenaza real,
  score_vulnerabilidad real, score_riesgo_acceso real, exposicion_matricula int, resultado_v04 jsonb);
CREATE TABLE infra_risk_factor (id text PRIMARY KEY, snapshot_id text REFERENCES infra_risk_snapshot(id),
  tipo text CHECK (tipo <> 'invalido'), fuente text, valor real);
INSERT INTO infra_periodo VALUES ('periodo');`

beforeEach(async () => {
  origen = new PGlite()
  destino = new PGlite()
  await origen.exec(schema)
  await destino.exec(schema)
  await origen.query(`INSERT INTO infra_risk_run VALUES ('nuevo','periodo','motor-v0.4','operativo','vigente',
    '2026-10-18T14:00:00Z','{"procesadas":3}','{"reglas":"v0.4"}')`)
  await destino.query(`INSERT INTO infra_risk_run VALUES ('anterior','periodo','motor-v0.3','operativo','vigente',
    '2026-10-16T14:00:00Z','{"procesadas":1}',null)`)
  await destino.query(`INSERT INTO infra_risk_snapshot VALUES ('previo','anterior','escuela',72,75,80,50,40,120,null)`)
  await destino.query(`INSERT INTO infra_risk_factor VALUES ('previo-factor','previo','amenaza','lluvia',30)`)
  for (const h of [24, 72, 240]) {
    await origen.query(`INSERT INTO infra_risk_snapshot VALUES ($1,'nuevo','escuela',$2,60,70,50,40,120,$3)`,
      [`s-${h}`, h, { modeloVersion: 'motor-v0.4', horizonteHoras: h }])
    for (const [i, fuente] of ['lluvia', 'caudal', 'historial', 'rio-v04', 'acceso', 'matricula'].entries()) {
      await origen.query(`INSERT INTO infra_risk_factor VALUES ($1,$2,'amenaza',$3,$4)`, [`f-${h}-${i}`, `s-${h}`, fuente, i])
    }
  }
})

afterEach(async () => { await origen.close(); await destino.close() })

it('copia el resultado completo, conserva los factores previos y es idempotente', async () => {
  const resultado = await replicarRiesgoV04(origen, destino, { lote: 2 })
  expect(resultado).toMatchObject({ estado: 'actualizado', snapshots: 3, factores: 18, anterior: 'anterior' })
  expect((await destino.query("SELECT * FROM infra_risk_snapshot WHERE run_id='nuevo' ORDER BY id")).rows)
    .toEqual((await origen.query('SELECT * FROM infra_risk_snapshot ORDER BY id')).rows)
  expect((await destino.query("SELECT * FROM infra_risk_factor WHERE id <> 'previo-factor' ORDER BY id")).rows)
    .toEqual((await origen.query('SELECT * FROM infra_risk_factor ORDER BY id')).rows)
  expect((await destino.query("SELECT estado FROM infra_risk_run WHERE id='anterior'")).rows).toEqual([{ estado: 'vencido' }])
  expect((await destino.query("SELECT valor FROM infra_risk_factor WHERE id='previo-factor'")).rows).toEqual([{ valor: 30 }])
  expect(await replicarRiesgoV04(origen, destino)).toMatchObject({ estado: 'ya_actualizado' })
  expect((await destino.query('SELECT count(*)::int n FROM infra_risk_factor')).rows).toEqual([{ n: 19 }])
})

it('revierte toda la copia si falla un factor y mantiene el vigente anterior', async () => {
  await destino.exec("ALTER TABLE infra_risk_factor ADD CONSTRAINT falla_controlada CHECK (fuente <> 'matricula')")
  await expect(replicarRiesgoV04(origen, destino)).rejects.toThrow()
  expect((await destino.query('SELECT id,estado FROM infra_risk_run')).rows).toEqual([{ id: 'anterior', estado: 'vigente' }])
  expect((await destino.query('SELECT id FROM infra_risk_snapshot')).rows).toEqual([{ id: 'previo' }])
})

it('rechaza una corrida v0.3 en origen sin modificar el destino', async () => {
  await origen.query("UPDATE infra_risk_run SET modelo_version='motor-v0.3'")
  await expect(replicarRiesgoV04(origen, destino)).rejects.toThrow('v0.4 completa')
  expect((await destino.query('SELECT estado FROM infra_risk_run')).rows).toEqual([{ estado: 'vigente' }])
})

it('rechaza una escuela sin los tres horizontes aunque coincida el conteo de cobertura', async () => {
  await origen.query('UPDATE infra_risk_snapshot SET horizonte_horas=24')
  await expect(replicarRiesgoV04(origen, destino)).rejects.toThrow('tres horizontes')
})

it('protege producción como origen y rechaza usarla como destino', () => {
  expect(() => validarDestinosRiesgoV04('postgres://host/hub_prod', 'postgres://host/hub_dev')).not.toThrow()
  expect(() => validarDestinosRiesgoV04('postgres://host/hub_dev', 'postgres://host/hub_prod')).toThrow()
})
