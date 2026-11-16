'use client'

import { DatoFechado } from '@/components/ui/dato-fechado'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { textoActualizado } from '@/lib/infraestructura/presentacion/textos-dato'
import { useEffect, useState, type JSX } from 'react'
import { ResumenPronosticoEscuela } from '@/components/infraestructura/resumen-pronostico-escuela'
import { estadoAltura } from '@/lib/infraestructura/hidrometria/estado-altura'
import {
  cantidadLluvia,
  fechaCorta,
  resumirSituacionEscuela,
  type EntradaResumen,
  type Nivel,
} from '@/lib/infraestructura/riesgo/resumen-escuela'

export type EstadoVistaPeligro = 'con_datos' | 'sin_datos' | 'cargando'

export interface FichaTerritorialProps {
  cueAnexo: string
  // Localidad de la escuela: se usa para buscar la estación de río de referencia.
  localidad?: string
  // Dimensión SEPARADA "acceso territorial" (aislamiento OSM x peligro). No es
  // parte del estado del edificio: son dos estados que pueden coexistir.
  // Opcional para no romper al caller actual: `undefined` = no se renderiza.
  riesgoAcceso?: {
    nivel: 'bajo' | 'moderado' | 'alto' | null
    explicacion: string
  } | null
  // Estado del EDIFICIO (daño/afectación confirmada), deliberadamente separado
  // del acceso. Mismo vocabulario que EscuelaMapa.estado. Opcional: si no viene,
  // la ficha no inventa un estado de edificio.
  estadoEdificio?: 'afectada' | 'sin_afectacion_reportada'
  // Avisa al padre si hay datos de peligro para mostrar (para colapsar la
  // sección cuando no los hay).
  onEstado?: (estado: EstadoVistaPeligro) => void
}

// --- Formas de las rutas de infraestructura (ver README de las rutas) ---
//
// No se importan tipos desde `lib/` acá a propósito: la ficha es una vista
// compacta y de sólo lectura, así que sólo declara lo que consume. Si el
// contrato server-side cambia, el fetch falla controlado (estado 'error') en
// vez de romper el build por un tipo que la ficha ni usa.

interface PerfilGeografico {
  cueAnexo: string
  lat: number | null
  lon: number | null
  geoCalidad: string | null
  departamento: string | null
  geometryRef: string | null
  motivoExclusion: string | null
  perfilVersion?: number | string
  calculadoEn?: string | null
  // `null` = todavía no corrió el job de asociación; con fila pero
  // `puntoRioId: null` = corrió y la escuela quedó fuera del radio de 40 km.
  rioAsociacion?: { puntoRioId: string | null; distanciaKm: number | null } | null
}

interface PuntoPronostico {
  geometryRef: string
  provider: string
  variable: string
  corridaEn?: string | null
  validoEn?: string | null
  horizonteHoras: number
  valor: number
  unidad: string
  pasoHoras?: number
}

type NivelPeligro = 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'sin_dato'
type BaseNivel = 'ensemble' | 'deterministico' | 'sin_dato'
type HorizontePeligro = 24 | 72 | 240

interface NivelHorizonte {
  geometryRef: string
  horizonteHoras: HorizontePeligro
  nivel: NivelPeligro
  base: BaseNivel
  probabilidadP95: number | null
  probabilidadP99: number | null
  precipitacionMm: number | null
  percentilReferencia: 'P90' | 'P95' | 'P99' | null
  emitidoEn: string
  validoHasta: string
  versionRegla: string
}

interface CaudalPeligro {
  puntoId: string
  percentilActual: number | null
  nivel: NivelPeligro
  emitidoEn: string
  validoHasta: string
}

interface ObservadoPeligro {
  geometryRef: string
  provider: string
  variable: string
  valor: number
  unidad: string
  observadoEn: string
  validoDesde: string
  validoHasta: string
}

interface ObservadoAcumulado {
  geometryRef: string
  horizonteHoras: 24 | 72
  acumuladoMm: number | null
  granulosEncontrados: number
  granulosEsperados: number
  cobertura: number
  masRecienteEn: string | null
  // Additive (calidad IMERG): absent in older responses, which count as 'alta'.
  calidadPonderada?: number | null
  confianza?: 'alta' | 'baja'
}

interface ClimatologiaPeligro {
  geometryRef: string
  variable: string
  percentil: 'p90' | 'p95' | 'p99'
  muestra: 'todos_los_dias' | 'dias_humedos'
  valor: number
  unidad: string
  periodoDesde: string
  periodoHasta: string
}

interface RespuestaPeligro {
  pronostico?: PuntoPronostico[]
  climatologia?: ClimatologiaPeligro[]
  niveles?: NivelHorizonte[]
  caudal?: CaudalPeligro | null
  observado?: ObservadoPeligro[]
  observadoAcumulado?: ObservadoAcumulado[]
}

interface FuenteInfraestructura {
  provider: string
  estado: 'ok' | 'degradado' | 'no_disponible' | (string & {})
  ultimoExitoEn?: string | null
  ttlMinutos?: number
  frescuraMinutos?: number | null
}

interface RespuestaFuentes {
  fuentes?: FuenteInfraestructura[]
}

interface RespuestaHidrometria {
  tramo: { estacionNombre: string | null } | null
  lectura: {
    lecturaM: number | null
    alertaM: number | null
    evacuacionM: number | null
    medidaEn: string | null
    inconsistente: boolean
  } | null
}

type EstadoFichaTerritorial =
  | { fase: 'cargando' }
  | { fase: 'sin-perfil' }
  | { fase: 'sin-cobertura'; motivo: string | null }
  | {
      fase: 'listo'
      perfil: PerfilGeografico
      peligro: RespuestaPeligro
      fuentes: FuenteInfraestructura[]
      hidrometria: RespuestaHidrometria | null
    }
  | { fase: 'error' }

// El resumen sólo mira el corto plazo: más allá de 72h no es "próximas 72h".
const HORIZONTE_MAX_HORAS = 72

// Prefijo de los proveedores de pronóstico (identificadores internos: nunca se
// muestran tal cual, se traducen a "pronóstico" con su frescura).
const PREFIJO_PROVIDER_PRONOSTICO = 'open-meteo'
const VARIABLE_LLUVIA_OBSERVADA = 'precipitacion_observada_satelital'
// The hazard-level calculation compares daily forecast totals against this
// sample (`MUESTRA_CLIMATOLOGIA` in peligro/nivel.ts), so the ficha must use it too.
const MUESTRA_UMBRAL_TERRITORIAL = 'todos_los_dias'

const VARIABLES_UMBRAL = [
  { variable: 'precipitacion', clave: 'lluvia' },
  { variable: 'rafagas', clave: 'rafagas' },
  { variable: 'caudal', clave: 'caudal' },
] as const

type TextosTerritorio = ReturnType<typeof useTextos>['fichaTerritorio']['territorio']
type DiccionarioVista = ReturnType<typeof useTextos>

const ORDEN_NIVEL: Record<NivelPeligro, number> = {
  sin_dato: -1,
  verde: 0,
  amarillo: 1,
  naranja: 2,
  rojo: 3,
}

function palabraNivel(t: TextosTerritorio, nivel: Exclude<NivelPeligro, 'sin_dato'>): string {
  if (nivel === 'verde') return t.palabraBajo
  if (nivel === 'amarillo') return t.palabraModerado
  if (nivel === 'naranja') return t.palabraAlto
  return t.palabraMuyAlto
}

const NIVEL_RESUMEN: Record<Exclude<NivelPeligro, 'sin_dato'>, Nivel> = {
  verde: 'bajo',
  amarillo: 'moderado',
  naranja: 'alto',
  rojo: 'muy_alto',
}

// Fracción mínima de gránulos satelitales para considerar un acumulado completo.
const COBERTURA_MINIMA = 0.8

function etiquetaHorizonte(t: TextosTerritorio, horizonte: HorizontePeligro): string {
  if (horizonte === 24) return t.proximas24
  if (horizonte === 72) return t.proximas72
  return t.proximos7a10
}

// Traduce el identificador de proveedor a un tipo de dato en palabras.
function tipoFuente(provider: string): string {
  if (provider.startsWith(PREFIJO_PROVIDER_PRONOSTICO)) return 'pronóstico'
  if (provider.includes('imerg')) return 'lluvia observada por satélite'
  if (/caudal|hidro|rio/.test(provider)) return 'caudal de río'
  return 'fuente de datos'
}

// Clave interna de tipoFuente -> texto visible.
function etiquetaTipoFuente(t: TextosTerritorio, tipo: string): string {
  if (tipo === 'pronóstico') return t.tipoPronostico
  if (tipo === 'lluvia observada por satélite') return t.tipoSatelite
  if (tipo === 'caudal de río') return t.tipoCaudal
  return t.tipoGenerico
}

function formatearValor(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 10) / 10)
}

// Fuentes relevantes para la ficha cuya frescura excede su TTL. Frescura
// desconocida no es sinónimo de fresca: se trata como vencida.
function fuentesVencidas(fuentes: FuenteInfraestructura[]): FuenteInfraestructura[] {
  return fuentes.filter((fuente) => {
    if (tipoFuente(fuente.provider) === 'fuente de datos') return false
    if (fuente.frescuraMinutos == null || fuente.ttlMinutos == null) return true
    return fuente.frescuraMinutos > fuente.ttlMinutos
  })
}

function tieneDatoPeligro(peligro: RespuestaPeligro): boolean {
  const hayNivel = (peligro.niveles ?? []).some((fila) => fila.nivel !== 'sin_dato')
  const hayCaudal = peligro.caudal != null && peligro.caudal.nivel !== 'sin_dato'
  const hayLluviaObservada = (peligro.observado ?? []).some(
    (fila) => fila.variable === VARIABLE_LLUVIA_OBSERVADA,
  )
  const hayAcumulado = (peligro.observadoAcumulado ?? []).some((fila) => fila.acumuladoMm !== null)
  return hayNivel || hayCaudal || hayLluviaObservada || hayAcumulado
}

function calcularVista(estado: EstadoFichaTerritorial): EstadoVistaPeligro {
  if (estado.fase === 'cargando') return 'cargando'
  if (estado.fase === 'listo') return tieneDatoPeligro(estado.peligro) ? 'con_datos' : 'sin_datos'
  if (estado.fase === 'error') return 'con_datos' // el aviso de error debe quedar visible
  return 'sin_datos'
}

/**
 * Texto de un acumulado observado 24h/72h en lenguaje llano. Si la cobertura
 * no alcanzó el mínimo, se marca "datos incompletos" en vez de mostrar el
 * porcentaje: nunca se presenta un acumulado sin decir que está incompleto.
 */
function cobertureParcial(fila: { cobertura: number; acumuladoMm: number | null; granulosEncontrados: number }): boolean {
  return fila.cobertura < COBERTURA_MINIMA || (fila.acumuladoMm === null && fila.granulosEncontrados > 0)
}

function textoAcumuladoObservado(t: TextosTerritorio, dic: DiccionarioVista, fila: {
  acumuladoMm: number | null
  granulosEncontrados: number
  granulosEsperados: number
  cobertura: number
}): string {
  const incompleto = cobertureParcial(fila) ? t.datosIncompletos : ''
  if (fila.acumuladoMm === null) return `${t.sinDato}${incompleto}`
  return `${cantidadLluvia(fila.acumuladoMm, dic)}${incompleto}`
}

// Nivel de peligro por horizonte (sólo corto plazo) a partir de los datos ya
// calculados: se pasa al resumen en lenguaje llano.
function nivelMaximoResumen(peligro: RespuestaPeligro): EntradaResumen['nivelMaximo'] {
  const conNivel = (peligro.niveles ?? []).filter(
    (fila) => fila.nivel !== 'sin_dato' && fila.horizonteHoras <= HORIZONTE_MAX_HORAS,
  )
  const maximo = conNivel.reduce<NivelHorizonte | null>(
    (mejor, fila) => (mejor === null || ORDEN_NIVEL[fila.nivel] > ORDEN_NIVEL[mejor.nivel] ? fila : mejor),
    null,
  )
  if (maximo === null) return { nivel: 'sin_dato', horizonteHoras: null, motivo: null }
  const nivel: Nivel = NIVEL_RESUMEN[maximo.nivel as Exclude<NivelPeligro, 'sin_dato'>]
  const caudal = peligro.caudal && peligro.caudal.nivel !== 'sin_dato' ? peligro.caudal : null
  let motivo: EntradaResumen['nivelMaximo']['motivo'] = null
  if (caudal && ORDEN_NIVEL[caudal.nivel] >= ORDEN_NIVEL[maximo.nivel]) motivo = 'caudal'
  else if (maximo.precipitacionMm !== null) motivo = 'lluvia'
  return { nivel, horizonteHoras: maximo.horizonteHoras, motivo }
}

function razonSinDatos(t: TextosTerritorio, perfil: PerfilGeografico, fuentes: FuenteInfraestructura[]): string {
  const vencida = fuentesVencidas(fuentes)[0]
  if (vencida) return t.sinDatosDisponibles
  if (perfil.lat == null || perfil.lon == null) return t.sinCoordenadas
  return t.sinCoberturaUbicacion
}

function SinDatosPeligro({ razon }: { razon: string }): JSX.Element {
  const t = useTextos().fichaTerritorio.territorio
  return (
    <section className="ficha-territorial ficha-territorial--sin-datos" data-testid="ficha-territorial-sin-datos">
      <p className="ficha-territorial__titulo">
        <strong>{t.sinDatosPeligro}</strong>
      </p>
      <p className="ficha-territorial__razon">{razon}</p>
    </section>
  )
}

/**
 * Ficha de peligro hidrometeorológico de la escuela. Primero la conclusión
 * (nivel más alto y su causa), después los números de respaldo en un detalle
 * colapsado. Sin datos de peligro muestra una sola línea con el motivo.
 *
 * La pertenencia o no de la escuela a la ficha la decide el PADRE server-side
 * vía un flag; este componente, si se monta, asume que corresponde mostrarla.
 */
export function FichaTerritorial(props: FichaTerritorialProps): JSX.Element {
  return (
    <>
      <ResumenPronosticoEscuela cueAnexo={props.cueAnexo} />
      <DatosTerritoriales {...props} />
    </>
  )
}

function DatosTerritoriales({
  cueAnexo,
  localidad,
  riesgoAcceso,
  estadoEdificio,
  onEstado,
}: FichaTerritorialProps): JSX.Element {
  const [estado, setEstado] = useState<EstadoFichaTerritorial>({ fase: 'cargando' })
  const dic = useTextos()
  const t = dic.fichaTerritorio.territorio
  const vista = calcularVista(estado)

  useEffect(() => {
    onEstado?.(vista)
  }, [vista, onEstado])

  useEffect(() => {
    let vigente = true

    async function cargar() {
      try {
        const respuestaPerfil = await fetch(
          `/api/infraestructura/geo-perfiles/${encodeURIComponent(cueAnexo)}`,
        )

        // 404 = la escuela no tiene fila de perfil: es un estado de negocio,
        // no un error, y por eso no se pide peligro ni fuentes.
        if (respuestaPerfil.status === 404) {
          if (vigente) setEstado({ fase: 'sin-perfil' })
          return
        }
        if (!respuestaPerfil.ok) throw new Error('no se pudo obtener el perfil')

        const perfil = (await respuestaPerfil.json()) as PerfilGeografico

        if (perfil.motivoExclusion) {
          if (vigente) setEstado({ fase: 'sin-cobertura', motivo: perfil.motivoExclusion })
          return
        }
        // Sin geometryRef no hay celda que consultar: se trata como sin
        // cobertura en vez de pegarle a /peligro con un valor vacío.
        if (!perfil.geometryRef) {
          if (vigente) setEstado({ fase: 'sin-cobertura', motivo: perfil.motivoExclusion })
          return
        }

        const puntoRioId = perfil.rioAsociacion?.puntoRioId
        const urlPeligro = `/api/infraestructura/peligro?geometryRef=${encodeURIComponent(
          perfil.geometryRef,
        )}${puntoRioId ? `&puntoRioId=${encodeURIComponent(puntoRioId)}` : ''}`

        // Río de referencia por localidad: si falla, la ficha sigue sin estación.
        const pedidoHidrometria = localidad
          ? fetch(`/api/infraestructura/hidrometria/estado?localidad=${encodeURIComponent(localidad)}`)
              .then((r) => (r.ok ? (r.json() as Promise<RespuestaHidrometria>) : null))
              .catch(() => null)
          : Promise.resolve(null)

        const [respuestaPeligro, respuestaFuentes, hidrometria] = await Promise.all([
          fetch(urlPeligro),
          fetch('/api/infraestructura/fuentes'),
          pedidoHidrometria,
        ])
        if (!respuestaPeligro.ok || !respuestaFuentes.ok) {
          throw new Error('no se pudo obtener el contexto territorial')
        }

        const peligro = (await respuestaPeligro.json()) as RespuestaPeligro
        const fuentes = ((await respuestaFuentes.json()) as RespuestaFuentes).fuentes ?? []

        if (vigente) setEstado({ fase: 'listo', perfil, peligro, fuentes, hidrometria })
      } catch {
        // Un fallo de red/ACL no se reintenta solo: mostrar el aviso una vez
        // es más honesto que quedar reintentando en background.
        if (vigente) setEstado({ fase: 'error' })
      }
    }

    cargar()
    return () => {
      vigente = false
    }
  }, [cueAnexo, localidad])

  if (estado.fase === 'cargando') {
    return (
      <p className="ficha-territorial__estado" role="status" data-testid="ficha-territorial-cargando">
        {t.cargando}
      </p>
    )
  }

  if (estado.fase === 'error') {
    return (
      <p className="ficha-territorial__error" role="alert" data-testid="ficha-territorial-error">
        {t.errorContexto}
      </p>
    )
  }

  if (estado.fase === 'sin-perfil') {
    return <SinDatosPeligro razon={t.sinCoberturaUbicacion} />
  }

  if (estado.fase === 'sin-cobertura') {
    return (
      <SinDatosPeligro
        razon={
          estado.motivo === 'sin_coordenadas'
            ? t.sinCoordenadas
            : t.sinCoberturaUbicacion
        }
      />
    )
  }

  const { perfil, peligro, fuentes, hidrometria } = estado

  if (!tieneDatoPeligro(peligro)) {
    return <SinDatosPeligro razon={razonSinDatos(t, perfil, fuentes)} />
  }

  const vencidas = fuentesVencidas(fuentes)

  const puntos = (peligro.pronostico ?? []).filter(
    (punto) => punto.horizonteHoras <= HORIZONTE_MAX_HORAS,
  )
  const precipitacion = puntos.filter((punto) => punto.variable === 'precipitacion')
  const rafagas = puntos.filter((punto) => punto.variable === 'rafagas')
  const caudales = puntos.filter((punto) => punto.variable === 'caudal')

  const lluviaAcumulada = precipitacion.reduce((total, punto) => total + punto.valor, 0)
  const rafagaMaxima = rafagas.reduce((maximo, punto) => Math.max(maximo, punto.valor), 0)
  const caudalMasProximo =
    caudales.length > 0
      ? caudales.reduce((proximo, punto) =>
          punto.horizonteHoras < proximo.horizonteHoras ? punto : proximo,
        )
      : null

  // --- Umbrales climatológicos por variable (referencia, no probabilidad) ---
  // Una variable sin climatología muestra "Sin dato" por percentil.
  const umbralesPorVariable = VARIABLES_UMBRAL.flatMap(({ variable, clave }) => {
    const delVariable = puntos.filter((punto) => punto.variable === variable)
    if (delVariable.length === 0) return []
    const actual = delVariable.reduce((proximo, punto) =>
      punto.horizonteHoras < proximo.horizonteHoras ? punto : proximo,
    )
    const climVariable = (peligro.climatologia ?? []).filter(
      (fila) => fila.variable === variable && fila.muestra === MUESTRA_UMBRAL_TERRITORIAL,
    )
    const umbral = (percentil: ClimatologiaPeligro['percentil']) =>
      climVariable.find((fila) => fila.percentil === percentil) ?? null
    const percentiles = [
      { etiqueta: 'P90', umbral: umbral('p90') },
      { etiqueta: 'P95', umbral: umbral('p95') },
      { etiqueta: 'P99', umbral: umbral('p99') },
    ].filter((p): p is { etiqueta: string; umbral: ClimatologiaPeligro } => p.umbral !== null)
    // Variable sin ningún umbral: se omite por completo.
    if (percentiles.length === 0) return []
    return [{ variable, etiqueta: t[clave], actual, percentiles }]
  })

  const valorVariable = (variable: string, valor: number, unidad: string): string =>
    variable === 'precipitacion' ? cantidadLluvia(valor, dic) : `${formatearValor(valor)} ${unidad}`

  const tiposFuente = [...new Set(puntos.map((punto) => etiquetaTipoFuente(t, tipoFuente(punto.provider))))]
  const corridaMasReciente = puntos
    .map((punto) => punto.corridaEn ?? punto.validoEn ?? null)
    .filter((valor): valor is string => valor !== null)
    .sort()
    .at(-1)
  const actualizado = corridaMasReciente ? fechaCorta(corridaMasReciente) : null

  // --- Peligro por horizonte (texto explícito, sin color como única señal) ---
  const niveles = peligro.niveles ?? []

  // --- Caudal con percentil ---
  const caudal: JSX.Element | null = (() => {
    if (peligro.caudal) {
      const nivelCaudal =
        peligro.caudal.nivel === 'sin_dato' ? t.sinDato : palabraNivel(t, peligro.caudal.nivel)
      const percentil = peligro.caudal.percentilActual ?? t.sinDato
      return (
        <p className="ficha-territorial__dato" data-testid="ficha-territorial-caudal">
          {t.caudalPercentil(percentil, nivelCaudal)}
        </p>
      )
    }
    if (perfil.rioAsociacion?.puntoRioId) {
      return (
        <p className="ficha-territorial__dato" data-testid="ficha-territorial-caudal">
          {t.caudalSinDato}
        </p>
      )
    }
    // `rioAsociacion` ausente (no `null`) = backend sin el campo todavía: se
    // cae al resumen viejo de `pronostico` para no perder el dato si existiera.
    if (perfil.rioAsociacion === undefined && caudalMasProximo) {
      return (
        <p className="ficha-territorial__dato" data-testid="ficha-territorial-caudal">
          {t.caudalValor(formatearValor(caudalMasProximo.valor), caudalMasProximo.unidad)}
        </p>
      )
    }
    return null
  })()

  // --- Lluvia observada por satélite (acumulados) ---
  const acumulados = peligro.observadoAcumulado ?? []
  const acumulado24h = acumulados.find((fila) => fila.horizonteHoras === 24) ?? null
  const acumulado72h = acumulados.find((fila) => fila.horizonteHoras === 72) ?? null
  const lluviaSateliteBajaConfianza = [acumulado24h, acumulado72h].some(
    (fila) => fila !== null && fila.acumuladoMm !== null && fila.confianza === 'baja',
  )

  // --- Resumen en lenguaje llano (datos ya calculados arriba) ---
  const lluviaPronosticada24h = precipitacion
    .filter((punto) => punto.horizonteHoras <= 24)
    .reduce<number | null>((total, punto) => (total ?? 0) + punto.valor, null)
  const corridaPronostico24h =
    precipitacion
      .filter((punto) => punto.horizonteHoras <= 24)
      .map((punto) => punto.corridaEn ?? null)
      .filter((valor): valor is string => valor !== null)
      .sort()
      .at(-1) ?? null
  const lectura = hidrometria?.lectura ?? null
  const entrada: EntradaResumen = {
    nivelMaximo: nivelMaximoResumen(peligro),
    lluviaObservada72h: acumulado72h
      ? {
          mm: acumulado72h.acumuladoMm,
          parcial: cobertureParcial(acumulado72h),
          hasta: acumulado72h.masRecienteEn,
          confianzaBaja: acumulado72h.confianza === 'baja',
        }
      : { mm: null, parcial: false, hasta: null },
    lluviaPronosticada24h: { mm: lluviaPronosticada24h, corridaEn: corridaPronostico24h },
    rio: hidrometria?.tramo
      ? {
          estado: estadoAltura(
            lectura
              ? {
                  lecturaM: lectura.lecturaM,
                  variacionM: null,
                  alertaM: lectura.alertaM,
                  evacuacionM: lectura.evacuacionM,
                  inconsistente: lectura.inconsistente,
                }
              : null,
          ).estado,
          estacionNombre: hidrometria.tramo.estacionNombre ?? 'sin nombre',
          alturaM: lectura?.lecturaM ?? null,
          medidaEn: lectura?.medidaEn ?? null,
          alertaM: lectura?.alertaM ?? null,
          evacuacionM: lectura?.evacuacionM ?? null,
        }
      : null,
    pronosticoDesactualizadoDesde:
      vencidas.find((fuente) => tipoFuente(fuente.provider) === 'pronóstico')?.ultimoExitoEn ?? null,
  }
  const resumen = resumirSituacionEscuela(entrada, dic)

  return (
    <section className="ficha-territorial" data-testid="ficha-territorial-datos">
      {/* La conclusión de la escuela sale del motor de riesgo (RiesgoEscuela); acá sólo los datos de apoyo. */}
      <ul className="ficha-territorial__puntos" data-testid="ficha-territorial-puntos">
        {resumen.puntos.map((punto) => (
          <li key={punto.texto}>
            {/* Sin avisos de frescura en el texto: la fecha va al tooltip y un dato vencido se ve atenuado. */}
            {/* Sin fecha conocida no hay tooltip: nunca un "Sin fecha de actualización" técnico. */}
            {punto.actualizado ? (
              <DatoFechado actualizado={textoActualizado(punto.actualizado, dic)} vencido={punto.vencido}>
                {punto.texto}
              </DatoFechado>
            ) : (
              <span className={punto.vencido ? 'dato-fechado--vencido' : undefined}>{punto.texto}</span>
            )}
            {punto.detalle && <span className="ficha-territorial__detalle-punto">{punto.detalle}</span>}
          </li>
        ))}
      </ul>

      <details className="ficha-territorial__detalle" data-testid="ficha-territorial-detalle">
        <summary>{t.verDetalle}</summary>

        <p className="ficha-territorial__dato">Departamento: {perfil.departamento ?? t.noRegistrado}</p>

        <div className="ficha-territorial__peligro">
          <p className="ficha-territorial__subtitulo">
            <strong>{t.peligroPorHorizonte}</strong>
          </p>
          {niveles.length === 0 ? (
            <p className="ficha-territorial__dato">{t.sinDatoCorto}</p>
          ) : (
            niveles.map((fila) => (
              <p
                key={fila.horizonteHoras}
                className="ficha-territorial__dato"
                data-testid="ficha-territorial-nivel-peligro"
              >
                {etiquetaHorizonte(t, fila.horizonteHoras)}:{' '}
                <span className={`ficha-territorial__nivel ficha-territorial__nivel--${fila.nivel}`}>
                  {fila.nivel === 'sin_dato' ? t.sinDato : palabraNivel(t, fila.nivel)}
                </span>
              </p>
            ))
          )}
        </div>

        {precipitacion.length > 0 && (
          <p className="ficha-territorial__dato">
            {t.lluviaPronosticada(cantidadLluvia(lluviaAcumulada, dic))}
          </p>
        )}
        {rafagas.length > 0 && (
          <p className="ficha-territorial__dato">
            {t.rafagasMaximas(formatearValor(rafagaMaxima), rafagas[0].unidad)}
          </p>
        )}

        {umbralesPorVariable.length > 0 && (
          <div className="ficha-territorial__umbrales" data-testid="ficha-territorial-umbrales">
            <p className="ficha-territorial__subtitulo">
              <strong>{t.umbralesHabituales}</strong>
            </p>
            {umbralesPorVariable.map((fila) => (
              <div
                key={fila.variable}
                className="ficha-territorial__umbral"
                data-testid={`ficha-territorial-umbral-${fila.variable}`}
              >
                <p className="ficha-territorial__dato">
                  {t.umbralPronostico(fila.etiqueta, valorVariable(fila.variable, fila.actual.valor, fila.actual.unidad))}
                </p>
                <dl className="ficha-territorial__umbral-lista">
                  {fila.percentiles.map(({ etiqueta, umbral }) => (
                    <div key={etiqueta} className="ficha-territorial__umbral-item">
                      <dt>{etiqueta}</dt>
                      <dd>{valorVariable(fila.variable, umbral.valor, umbral.unidad)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            <p className="ficha-territorial__fuente">
              {t.umbralesNota}
            </p>
          </div>
        )}

        {caudal}

        {(acumulado24h || acumulado72h) && (
          <div className="ficha-territorial__observado-acumulado">
            <p className="ficha-territorial__subtitulo">
              <strong>{t.lluviaSatelite}</strong>
            </p>
            {acumulado24h && (
              <p className="ficha-territorial__dato" data-testid="ficha-territorial-observado-24h">
                {t.ultimas24(textoAcumuladoObservado(t, dic, acumulado24h))}
              </p>
            )}
            {acumulado72h && (
              <p className="ficha-territorial__dato" data-testid="ficha-territorial-observado-72h">
                {t.ultimas72(textoAcumuladoObservado(t, dic, acumulado72h))}
              </p>
            )}
            {lluviaSateliteBajaConfianza && (
              <p className="ficha-territorial__fuente" data-testid="ficha-territorial-observado-baja-confianza">
                {dic.libTextos2.resumenEscuela.lluviaBajaConfianza}
              </p>
            )}
          </div>
        )}

        {tiposFuente.length > 0 && (
          <p className="ficha-territorial__fuente">
            {t.fuente(tiposFuente.join(', '))}
            {actualizado ? t.actualizado(actualizado) : ''}
          </p>
        )}
      </details>

      {/* Estado del edificio y acceso: dos dimensiones SEPARADAS. Se muestran
          a la vez cuando ambos datos existen, nunca una en lugar de la otra. */}
      {estadoEdificio !== undefined && (
        <div className="ficha-territorial__estado-edificio" data-testid="ficha-territorial-estado-edificio">
          <p className="ficha-territorial__subtitulo">
            <strong>{t.estadoEdificio}</strong>
          </p>
          <p className="ficha-territorial__dato">
            {estadoEdificio === 'afectada' ? t.afectacionConfirmada : t.sinAfectacion}
          </p>
        </div>
      )}

      {riesgoAcceso !== undefined && (
        <div className="ficha-territorial__acceso" data-testid="ficha-territorial-riesgo-acceso">
          <p className="ficha-territorial__subtitulo">
            <strong>{t.acceso}</strong>
          </p>
          <p className="ficha-territorial__dato" data-testid="ficha-territorial-acceso-nivel">
            {t.riesgoAcceso}{' '}
            {riesgoAcceso === null || riesgoAcceso.nivel === null
              ? t.sinDatosAcceso
              : riesgoAcceso.nivel === 'bajo'
                ? t.bajo
                : riesgoAcceso.nivel === 'moderado'
                  ? t.moderado
                  : t.alto}
          </p>
          {riesgoAcceso === null || riesgoAcceso.nivel === null ? (
            <p className="ficha-territorial__dato" data-testid="ficha-territorial-acceso-sin-dato">
              {t.sinDatosAcceso}
            </p>
          ) : (
            <p className="ficha-territorial__dato" data-testid="ficha-territorial-acceso-explicacion">
              {riesgoAcceso.explicacion}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
