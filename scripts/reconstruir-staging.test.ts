import { describe, expect, it } from 'vitest'
import {
  crearPlan, TABLAS_VACIAS, sanearFila, ordenarPorDependencias, validarDestino,
} from './lib/reconstruir-staging-plan.mjs'
import { validarClasificacion } from './reconstruir-staging.mjs'

describe('reconstrucción acotada de infraestructura', () => {
  it('rechaza producción como destino y nombres ambiguos antes de conectar', () => {
    expect(() => validarDestino({ database: 'hub_prod' }, { database: 'hub_prod' })).toThrow()
    expect(() => validarDestino({ database: 'hub_prod' }, { database: 'hub_staging_copy' })).toThrow()
    expect(() => validarDestino({ database: 'hub_prod' }, { database: 'hub_staging' })).not.toThrow()
  })

  it('aborta ante tablas nuevas sin clasificar y tablas faltantes', () => {
    const plan = crearPlan()
    const tablas = [...plan.map((p) => p.tabla), ...TABLAS_VACIAS]
    expect(() => validarClasificacion(tablas, plan)).not.toThrow()
    expect(() => validarClasificacion([...tablas, 'public.nueva_tabla'], plan)).toThrow('nueva_tabla')
    expect(() => validarClasificacion(tablas.slice(1), plan)).toThrow('faltantes')
    expect(new Set(tablas).size).toBe(tablas.length)
  })

  it('ordena padres antes de hijos y detecta ciclos', () => {
    const plan = ['hija', 'padre', 'abuelo'].map((tabla) => ({ tabla }))
    const relaciones = [{ hija: 'hija', padre: 'padre' }, { hija: 'padre', padre: 'abuelo' }]
    expect(ordenarPorDependencias(plan, relaciones).map((p) => p.tabla)).toEqual(['abuelo', 'padre', 'hija'])
    expect(() => ordenarPorDependencias(plan, [...relaciones, { hija: 'abuelo', padre: 'hija' }])).toThrow('circulares')
  })

  it('conserva usuarios y login por contraseña sin propagar tokens ni leases', () => {
    const account = { user_id: 'usuario-real', password: 'hash', access_token: 'secreto', refresh_token: 'secreto', id_token: 'secreto' }
    const salida = sanearFila('public.account', account)
    expect(salida).toMatchObject({ user_id: 'usuario-real', password: 'hash', access_token: null, refresh_token: null, id_token: null })
    expect(account.access_token).toBe('secreto')
    expect(sanearFila('public.infra_job_run', { id: 'job', lease_owner: 'prod', lease_expira_en: 'futuro' })).toEqual({ id: 'job', lease_owner: null, lease_expira_en: null })
  })

  it('ancla todas las ventanas al mismo snapshot y conserva los cortes de reportes', () => {
    const plan = crearPlan(new Date('2026-10-16T15:00:00Z'))
    expect(plan.find((p) => p.tabla === 'public.hazard_observation')?.params).toEqual(['2026-10-13T15:00:00.000Z'])
    expect(plan.find((p) => p.tabla === 'public.infra_veredicto_dia')?.params).toEqual(['2026-10-02'])
    expect(plan.find((p) => p.tabla === 'ge.ge_corte')?.where).toContain('SELECT corte_id FROM public.infra_parte')
    expect(plan.find((p) => p.tabla === 'public.radar_meteo_run')?.where).toContain("status = 'completo'")
    expect(sanearFila('ge.ge_corte', { estado: 'importando' }).estado).toBe('historico')
  })
})
