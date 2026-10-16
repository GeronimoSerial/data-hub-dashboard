// Dataset explícito para infraestructura. Todo lo que no figure aquí debe
// clasificarse antes de poder borrar staging: una tabla nueva nunca se ignora.
const recurso = "recurso_id = 'recurso-infraestructura'"
const cortes = "SELECT id FROM ge.ge_corte WHERE estado = 'vigente' UNION SELECT corte_id FROM public.infra_parte"
const secciones = `SELECT corte_id, ge_section_id FROM ge.ge_seccion
  WHERE corte_id IN (${cortes}) AND cue_anexo IN (SELECT cue_anexo FROM ge.ge_localizacion)`
const miembros = `SELECT ge_person_id FROM ge.ge_alumno_seccion WHERE (corte_id, ge_section_id) IN (${secciones})`
const riesgo = "SELECT id FROM public.infra_risk_run WHERE estado IN ('vigente','vencido') ORDER BY publicado_en DESC NULLS LAST, iniciado_en DESC LIMIT 2"
const situaciones = `SELECT id FROM public.infra_situacion_corte WHERE risk_run_id IN (${riesgo})`
const veredictos = "SELECT id FROM public.infra_veredicto_dia WHERE fecha >= $1"
const pronosticos = `SELECT provider, variable, corrida_en FROM (
  SELECT *, row_number() OVER (PARTITION BY provider, variable ORDER BY corrida_en DESC) AS posicion
  FROM (SELECT DISTINCT provider, variable, corrida_en FROM public.hazard_forecast) fechas
) ordenadas WHERE posicion <= 2`

const completas = [
  'niveles', 'tipos', 'categorias', 'tags', 'niveles_jurisdiccionales',
  'user', 'user_niveles', 'user_niveles_jur', 'infra_motivo', 'infra_periodo',
  'infra_parte', 'infra_afectacion', 'infra_afectacion_seccion', 'infra_afectacion_alumno',
  'infra_servicio_alcance', 'infra_movimiento', 'infra_adjunto',
  'infra_geo_profile', 'infra_geo_rio', 'infra_aislamiento_osm',
  'infra_susceptibilidad_estatica', 'infra_acceso_osm_geometria',
  'infra_exposicion_ruta_inundacion', 'infra_exposicion_rio_dem',
  'hazard_climatology', 'hazard_precipitacion_serie', 'hazard_source_health',
  'hidro_referencia', 'infra_episodio_derivado', 'infra_episodio_miembro',
]

export const TABLAS_VACIAS = [
  'public.session', 'public.verification', 'public.ge_sso_evento',
  'public.infra_acceso_nominal_log', 'public.infra_borrador', 'public.infra_borrador_cierre',
  'public.infra_verificacion', 'public.infra_verificacion_evento',
  'public.infra_veredicto_enlace', 'public.infra_briefing_presupuesto_mes',
  'public.om_cupo_contador', 'public.om_cupo_cooldown',
]

export function crearPlan(ahora = new Date()) {
  if (!Number.isFinite(ahora.getTime())) throw new Error('Fecha de extracción inválida')
  const horas72 = new Date(ahora.getTime() - 72 * 3600_000).toISOString()
  const dias14 = new Date(ahora.getTime() - 14 * 86400_000).toISOString().slice(0, 10)
  const plan = completas.map((tabla) => ({ tabla: `public.${tabla}`, where: 'TRUE', params: [] }))
  const agregar = (tabla, where, params = []) => plan.push({ tabla, where, params })
  agregar('public.account', 'TRUE')
  agregar('public.recursos', "id = 'recurso-infraestructura'")
  for (const tabla of ['recurso_tags', 'recurso_audiencia_niveles', 'recurso_audiencia_niveles_jur', 'recurso_audiencia_usuarios', 'user_recursos']) {
    agregar(`public.${tabla}`, recurso)
  }
  for (const tabla of ['ge_localizacion', 'ge_nivel_jurisdiccional']) agregar(`ge.${tabla}`, 'TRUE')
  agregar('ge.ge_escuela_nivel_jur', 'cue_anexo IN (SELECT cue_anexo FROM ge.ge_localizacion)')
  agregar('ge.ge_corte', `id IN (${cortes})`)
  agregar('ge.ge_seccion', `(corte_id, ge_section_id) IN (${secciones})`)
  agregar('ge.ge_alumno_seccion', `(corte_id, ge_section_id) IN (${secciones})`)
  agregar('ge.ge_alumno_identidad', `ge_person_id IN (${miembros} UNION SELECT ge_person_id FROM public.infra_afectacion_alumno)`)
  agregar('public.infra_permiso_nominal', 'revocado_en IS NULL AND vence_en > $1', [ahora.toISOString()])
  agregar('public.infra_risk_run', `id IN (${riesgo})`)
  agregar('public.infra_risk_snapshot', `run_id IN (${riesgo})`)
  agregar('public.infra_risk_factor', `snapshot_id IN (SELECT id FROM public.infra_risk_snapshot WHERE run_id IN (${riesgo}))`)
  agregar('public.infra_situacion_corte', `id IN (${situaciones})`)
  agregar('public.infra_briefing', `corte_id IN (${situaciones})`)
  agregar('public.infra_veredicto_dia', `id IN (${veredictos})`, [dias14])
  // Sólo los jobs necesarios para explicar los cortes/veredictos conservados.
  agregar('public.infra_job_run', `id IN (
    SELECT generado_por_job_run_id FROM public.infra_situacion_corte WHERE id IN (${situaciones})
    UNION SELECT job_run_id FROM public.infra_veredicto_dia WHERE id IN (${veredictos})
  )`, [dias14])
  agregar('public.hazard_forecast', `(provider, variable, corrida_en) IN (${pronosticos})`)
  agregar('public.hazard_observation', 'observado_en >= $1', [horas72])
  agregar('public.hazard_ensemble_prob', 'corrida_en IN (SELECT DISTINCT corrida_en FROM public.hazard_ensemble_prob ORDER BY corrida_en DESC LIMIT 2)')
  agregar('public.hazard_seasonal_trend', 'emision_en IN (SELECT DISTINCT emision_en FROM public.hazard_seasonal_trend ORDER BY emision_en DESC LIMIT 2)')
  for (const [tabla, columna] of [['hidro_lectura', 'medida_en'], ['lluvia_estacion', 'observado_en'], ['radar_meteo_verificacion', 'fecha'], ['smn_alerta', 'sent']]) {
    agregar(`public.${tabla}`, `${columna} >= $1`, [dias14])
  }
  for (const [tabla, grupos] of [['radar_meteo_run', 'provider, model, grid_version'], ['radar_meteo_ensemble_run', 'model']]) {
    agregar(`public.${tabla}`, `id IN (SELECT id FROM (
      SELECT id, row_number() OVER (PARTITION BY ${grupos} ORDER BY run_at DESC, fetched_at DESC) AS posicion
      FROM public.${tabla} WHERE status = 'completo'
    ) ordenadas WHERE posicion <= 2)`)
  }
  return plan
}

export function citarIdentificador(nombre) {
  return '"' + nombre.replaceAll('"', '""') + '"'
}

export function citarTabla(nombre) {
  return nombre.split('.').map(citarIdentificador).join('.')
}

export function sqlExtraccion(entrada) {
  return `SELECT * FROM ${citarTabla(entrada.tabla)} WHERE ${entrada.where}`
}

export function sanearFila(tabla, fila) {
  const salida = { ...fila }
  if (tabla === 'public.account') {
    for (const campo of ['access_token', 'refresh_token', 'id_token', 'access_token_expires_at', 'refresh_token_expires_at']) salida[campo] = null
  }
  if (tabla === 'public.infra_job_run') {
    salida.lease_owner = null
    salida.lease_expira_en = null
  }
  // Un corte antes en importación sólo se conserva si un reporte lo referencia.
  if (tabla === 'ge.ge_corte' && salida.estado === 'importando') salida.estado = 'historico'
  return salida
}

export function ordenarPorDependencias(plan, relaciones) {
  const pendientes = new Map(plan.map((entrada) => [entrada.tabla, entrada]))
  const orden = []
  while (pendientes.size) {
    const disponibles = [...pendientes.keys()].filter((tabla) => !relaciones.some(
      ({ hija, padre }) => hija === tabla && padre !== tabla && pendientes.has(padre),
    ))
    if (!disponibles.length) throw new Error('Hay dependencias circulares en la carga')
    for (const tabla of disponibles.sort()) {
      orden.push(pendientes.get(tabla))
      pendientes.delete(tabla)
    }
  }
  return orden
}

export function validarDestino(origen, destino) {
  if (origen.database !== 'hub_prod' || destino.database !== 'hub_staging') {
    throw new Error('La reconstrucción sólo admite hub_prod → hub_staging')
  }
  if (origen.database === destino.database) throw new Error('Origen y destino deben ser distintos')
}
