export type AlertaRadar = {
  id: string
  nivelSat: string | null
  severidad: string
  evento: string
  headline: string | null
  description: string | null
  instruction: string | null
  onset: string
  expires: string
  departamentos: Array<string | { id: string; nombre: string }>
}

export function departamentosAlertaLabel(departamentos: AlertaRadar['departamentos']) {
  return departamentos.map((depto) => typeof depto === 'string' ? depto : depto.nombre).join(', ')
}

export interface GrupoAlertaRadar {
  clave: string
  evento: string
  severidad: string
  nivelSat: string | null
  headline: string | null
  description: string | null
  instruction: string | null
  onset: string
  expires: string
  proxima: boolean
  departamentos: string[]
  ids: string[]
  alertas: AlertaRadar[]
}

const aliasNivel: Record<string, 'red' | 'orange' | 'yellow'> = {
  red: 'red', rojo: 'red', roja: 'red',
  orange: 'orange', naranja: 'orange',
  yellow: 'yellow', amarillo: 'yellow', amarilla: 'yellow',
}
const gravedadNivel: Record<string, number> = { red: 3, orange: 2, yellow: 1 }

function gravedadAlerta(nivel: string | null): number {
  if (!nivel) return 0
  return gravedadNivel[nivelNormalizado(nivel) ?? ''] ?? 0.5
}

function nivelNormalizado(nivel: string | null): 'red' | 'orange' | 'yellow' | null {
  if (!nivel) return null
  return aliasNivel[nivel.toLocaleLowerCase('es')] ?? null
}

export function agruparAlertas(alertas: AlertaRadar[], ahoraMs: number): GrupoAlertaRadar[] {
  const grupos = new Map<string, AlertaRadar[]>()
  for (const alerta of alertas) {
    const clave = `${alerta.evento}|${alerta.severidad}|${alerta.onset}|${alerta.expires}`
    grupos.set(clave, [...(grupos.get(clave) ?? []), alerta])
  }

  return [...grupos].map(([clave, alertasGrupo]) => {
    const primera = alertasGrupo[0]
    const departamentos = new Set(alertasGrupo.flatMap((alerta) => alerta.departamentos.map((depto) => typeof depto === 'string' ? depto : depto.nombre)))
    const nivelSat = [...alertasGrupo].sort((a, b) => gravedadAlerta(b.nivelSat) - gravedadAlerta(a.nivelSat))[0]?.nivelSat ?? null
    return {
      clave,
      evento: primera.evento,
      severidad: primera.severidad,
      nivelSat,
      headline: primera.headline,
      description: primera.description,
      instruction: primera.instruction,
      onset: primera.onset,
      expires: primera.expires,
      proxima: Date.parse(primera.onset) > ahoraMs,
      departamentos: [...departamentos].sort((a, b) => a.localeCompare(b, 'es')),
      ids: alertasGrupo.map((alerta) => alerta.id),
      alertas: alertasGrupo,
    }
  }).sort((a, b) => Number(a.proxima) - Number(b.proxima) || Date.parse(a.onset) - Date.parse(b.onset) || a.evento.localeCompare(b.evento, 'es'))
}

export interface ResumenAlertasRadar {
  total: number
  vigentes: number
  proximas: number
  texto: string
  nivel: 'red' | 'orange' | 'yellow' | null
}

export function fechaCorta(fecha: string): string {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(fecha))
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value ?? ''
  const diaSemana = parte('weekday').replace(/[.,]$/u, '')
  return `${diaSemana} ${parte('day')}, ${parte('hour')}:${parte('minute')}`
}

export function formatearVentanaAlerta(onset: string, expires: string): string {
  return `${fechaCorta(onset)} – ${fechaCorta(expires)}`
}

export function resumirAlertas(grupos: GrupoAlertaRadar[]): ResumenAlertasRadar {
  const vigentes = grupos.filter((grupo) => !grupo.proxima).length
  const proximas = grupos.length - vigentes
  const nivel = grupos.map((grupo) => nivelNormalizado(grupo.nivelSat)).filter((valor): valor is 'red' | 'orange' | 'yellow' => valor !== null)
    .sort((a, b) => gravedadNivel[b] - gravedadNivel[a])[0] ?? null
  let texto = ''
  if (vigentes && proximas) {
    texto = `${vigentes} vigente${vigentes === 1 ? '' : 's'} · ${proximas} próxima${proximas === 1 ? '' : 's'}`
  } else if (proximas) {
    const onset = grupos.filter((grupo) => grupo.proxima).sort((a, b) => Date.parse(a.onset) - Date.parse(b.onset))[0].onset
    texto = `${proximas} alerta${proximas === 1 ? '' : 's'} del SMN · próxima${proximas === 1 ? '' : 's'} desde ${fechaCorta(onset)}`
  } else if (vigentes) {
    texto = `${vigentes} alerta${vigentes === 1 ? '' : 's'} vigente${vigentes === 1 ? '' : 's'} del SMN`
  }
  return { total: grupos.length, vigentes, proximas, texto, nivel }
}
