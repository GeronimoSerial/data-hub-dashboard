import { cargarReferencias } from '../datasets/repositorio'
import { referencia } from '../datasets/memoria'
import { filasACsv, type Datos } from '../datasets/codec'
// Eventos de terreno (inundaciones reportadas y mediciones) para el veredicto
// diario. Lee los registros publicados en la DB y los reduce a filas
// listas para mostrar; no depende de CSV locales.
//
// TODO(merge): esta misma regla de selección y de cobertura de días debe
// deduplicarse con lib/mapas/eventos-inundaciones.ts de la rama hermana al
// integrar ambas ramas.
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'

export type EventoTerreno = {
  id: string
  fecha: string
  fechaTexto: string
  departamento: string
  lugar: string
  titulo: string
  tipo: 'Evento reportado' | 'Medición hidrométrica'
  confianza: 'alta' | 'media' | 'baja'
  confianzaTexto: 'Confianza alta' | 'Confianza media' | 'Confianza baja'
  fuente: { medio: string; fecha: string; url: string }
}

type Fila = Record<string, string>

const VERIFICACIONES_USABLES = new Set(['verificada_url', 'verificado por orquestador'])
const RANGO_CONFIANZA: Record<string, number> = { alta: 0, media: 1, baja: 2 }
const RANGO_CLASE: Record<string, number> = { evento_publico: 0, medicion_hidrometrica: 1 }
const FECHA_CON_FIN = /(\d{4})-(\d{2})-(\d{2})(?:\/(\d{2}))?/

// RFC 4180: campos entrecomillados con comas, saltos de línea y "" escapado.
export function parsearCsv(texto: string): Fila[] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let entreComillas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          entreComillas = false
        }
      } else {
        campo += c
      }
    } else if (c === '"') {
      entreComillas = true
    } else if (c === ',') {
      fila.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else {
      campo += c
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }

  const [cabecera = [], ...cuerpo] = filas.filter((f) => !(f.length === 1 && f[0] === ''))
  return cuerpo.map((valores) =>
    Object.fromEntries(cabecera.map((nombre, i) => [nombre.trim(), (valores[i] ?? '').trim()])),
  )
}

function listar(valor: string): string[] {
  return valor
    .split(';')
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '')
}

// Primera fecha YYYY-MM-DD del texto; admite la forma "2026-10-12/13".
function primeraFecha(texto: string): { fecha: string; finSlash: string | null } | null {
  const m = FECHA_CON_FIN.exec(texto)
  if (!m) return null
  const [, anio, mes, dia, finDia] = m
  return {
    fecha: `${anio}-${mes}-${dia}`,
    finSlash: finDia ? `${anio}-${mes}-${finDia}` : null,
  }
}

function sumarDias(fecha: string, dias: number): string {
  const ms = Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

function diasEntre(inicio: string, fin: string): string[] {
  const dias: string[] = []
  for (let d = inicio; d <= fin; d = sumarDias(d, 1)) dias.push(d)
  return dias
}

function formatearDiaMes(fecha: string): string {
  const [, mes, dia] = fecha.split('-')
  return `${dia}/${mes}`
}

function formatearFechaPublicacion(texto: string): string {
  const primera = primeraFecha(texto)
  if (!primera) return ''
  const [anio, mes, dia] = primera.fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

function primeraFuenteVerificable(evento: Fila, evidencias: Map<string, Fila>): Fila | null {
  for (const id of listar(evento.evidencias ?? '')) {
    const evidencia = evidencias.get(id)
    if (!evidencia) continue
    if (!/^https?:\/\//i.test(evidencia.url ?? '')) continue
    if (!VERIFICACIONES_USABLES.has(evidencia.verificacion ?? '')) continue
    return evidencia
  }
  return null
}

function rangoDeDias(evento: Fila, inicio: string): { inicio: string; fin: string } {
  const fin = primeraFecha(evento.fin_evento ?? '')
  if (fin) return { inicio, fin: fin.fecha < inicio ? inicio : fin.fecha }

  const inicioPrimera = primeraFecha(evento.inicio_evento ?? '')
  if (inicioPrimera?.finSlash && inicioPrimera.finSlash >= inicio) {
    return { inicio, fin: inicioPrimera.finSlash }
  }

  if (evento.estado_temporal === 'vigente_segun_ultimo_reporte') {
    const ultima = primeraFecha(evento.ultima_actualizacion ?? '')
    if (ultima && ultima.fecha >= inicio) return { inicio, fin: ultima.fecha }
  }

  return { inicio, fin: inicio }
}

// tipo_afectacion vacío o que declara explícitamente que no hubo afectación.
const SIN_AFECTACION = /^\s*$|ninguna informada|sin afectaci[oó]n informada/i

export function seleccionarEventosTerreno({
  eventosCsv,
  evidenciasCsv,
  desde,
  hasta,
}: {
  eventosCsv: string
  evidenciasCsv: string
  desde: string
  hasta: string
}): EventoTerreno[] {
  const evidencias = new Map(parsearCsv(evidenciasCsv).map((e) => [e.id_evidencia ?? '', e]))
  const salida: Array<{ orden: [string, number, number, string]; evento: EventoTerreno }> = []

  for (const evento of parsearCsv(eventosCsv)) {
    const confianza = evento.confianza as EventoTerreno['confianza']
    if (!(confianza in RANGO_CONFIANZA)) continue
    // Solo afectaciones en terreno: las mediciones hidrométricas ya están en la traza
    // de Prefectura, y una fila sin afectación informada no confirma nada.
    if (evento.clase === 'medicion_hidrometrica') continue
    if (SIN_AFECTACION.test(evento.tipo_afectacion ?? '')) continue

    const fuente = primeraFuenteVerificable(evento, evidencias)
    if (!fuente) continue

    const inicio = primeraFecha(evento.inicio_evento ?? '')
    if (!inicio) continue

    const { fin } = rangoDeDias(evento, inicio.fecha)
    const departamentos = listar(evento.departamento ?? '').map(normalizarNombreDepartamento)
    const titulo = (evento.tipo_afectacion ?? '').replace(/;\s*/g, ', ').trim()
    const tituloVisible = titulo.charAt(0).toUpperCase() + titulo.slice(1)
    const lugar = listar(evento.localidad ?? '').join(', ')
    const aproximada = /aprox/i.test(evento.inicio_evento ?? '') ? ' (aprox.)' : ''
    const clase = evento.clase ?? ''
    const fuenteVisible = {
      medio: (fuente.fuente || fuente.autor_organismo || '').trim(),
      fecha: formatearFechaPublicacion(fuente.fecha_publicacion ?? ''),
      url: fuente.url,
    }

    for (const dia of diasEntre(inicio.fecha, fin)) {
      if (dia < desde || dia > hasta) continue
      for (const departamento of departamentos) {
        salida.push({
          orden: [dia, RANGO_CLASE[clase] ?? 0, RANGO_CONFIANZA[confianza]!, tituloVisible],
          evento: {
            id: evento.id_evento ?? '',
            fecha: dia,
            fechaTexto: `${formatearDiaMes(dia)}${aproximada}`,
            departamento,
            lugar,
            titulo: tituloVisible,
            tipo: clase === 'medicion_hidrometrica' ? 'Medición hidrométrica' : 'Evento reportado',
            confianza,
            confianzaTexto: `Confianza ${confianza}` as EventoTerreno['confianzaTexto'],
            fuente: fuenteVisible,
          },
        })
      }
    }
  }

  return salida
    .sort((a, b) => {
      for (let i = 0; i < a.orden.length; i++) {
        const x = a.orden[i]!
        const y = b.orden[i]!
        if (x < y) return -1
        if (x > y) return 1
      }
      return 0
    })
    .map((s) => s.evento)
}

export async function cargarEventosTerreno({
  desde,
  hasta,
}: {
  desde: string
  hasta: string
}): Promise<EventoTerreno[]> {
  await cargarReferencias()
  return seleccionarEventosTerreno({
    eventosCsv: filasACsv(referencia<Datos[]>('registro-eventos')),
    evidenciasCsv: filasACsv(referencia<Datos[]>('evidencias-inundaciones')),
    desde, hasta,
  })
}
