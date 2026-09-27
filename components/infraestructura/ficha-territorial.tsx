'use client'

import { useEffect, useState, type JSX } from 'react'

export interface FichaTerritorialProps {
  cueAnexo: string
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

interface RespuestaPeligro {
  pronostico?: PuntoPronostico[]
  climatologia?: unknown[]
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

type EstadoFichaTerritorial =
  | { fase: 'cargando' }
  | { fase: 'sin-perfil' }
  | { fase: 'sin-cobertura'; motivo: string | null }
  | {
      fase: 'listo'
      perfil: PerfilGeografico
      peligro: RespuestaPeligro
      fuentes: FuenteInfraestructura[]
    }
  | { fase: 'error' }

// El resumen sólo mira el corto plazo: más allá de 72h no es "próximas 72h".
const HORIZONTE_MAX_HORAS = 72

// Todos los proveedores de pronóstico que alimentan esta ficha comparten el
// prefijo; la frescura de cualquiera de ellos invalida el dato mostrado.
const PREFIJO_PROVIDER_PRONOSTICO = 'open-meteo'

/**
 * Traduce el `motivoExclusion` que devuelve el perfil a lenguaje claro. Si el
 * backend agrega un motivo nuevo, se muestra tal cual en vez de tragárselo:
 * mejor un identificador crudo visible que un texto vacío.
 */
function traducirMotivoExclusion(motivo: string): string {
  if (motivo === 'sin_coordenadas') return 'no tiene coordenadas cargadas'
  if (motivo === 'coordenada_invalida') return 'coordenada fuera del rango esperado'
  return motivo
}

function formatearValor(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 10) / 10)
}

function formatearFecha(iso: string | null | undefined): string | null {
  if (!iso) return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null
  return fecha.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Ficha territorial compacta (E2): contexto del departamento/celda, calidad de
 * la coordenada, resumen de las próximas 72h de lluvia/ráfagas, caudal del
 * punto de río asociado (si lo hay) y frescura de la fuente.
 *
 * La pertenencia o no de la escuela a la ficha la decide el PADRE server-side
 * vía un flag; este componente, si se monta, asume que corresponde mostrarla.
 *
 * Los tres estados sin datos se distinguen por TEXTO, no sólo por color:
 * «Sin perfil geográfico registrado», «Sin cobertura geográfica» y «Sin
 * peligro estimado». «Fuente vencida» es un aviso ADICIONAL: nunca oculta el
 * dato viejo, lo muestra rotulado como posiblemente desactualizado.
 */
export function FichaTerritorial({ cueAnexo }: FichaTerritorialProps): JSX.Element {
  const [estado, setEstado] = useState<EstadoFichaTerritorial>({ fase: 'cargando' })

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

        const [respuestaPeligro, respuestaFuentes] = await Promise.all([
          fetch(`/api/infraestructura/peligro?geometryRef=${encodeURIComponent(perfil.geometryRef)}`),
          fetch('/api/infraestructura/fuentes'),
        ])
        if (!respuestaPeligro.ok || !respuestaFuentes.ok) {
          throw new Error('no se pudo obtener el contexto territorial')
        }

        const peligro = (await respuestaPeligro.json()) as RespuestaPeligro
        const fuentes = ((await respuestaFuentes.json()) as RespuestaFuentes).fuentes ?? []

        if (vigente) setEstado({ fase: 'listo', perfil, peligro, fuentes })
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
  }, [cueAnexo])

  if (estado.fase === 'cargando') {
    return (
      <p className="ficha-territorial__estado" role="status" data-testid="ficha-territorial-cargando">
        Cargando contexto territorial…
      </p>
    )
  }

  if (estado.fase === 'error') {
    return (
      <p className="ficha-territorial__error" role="alert" data-testid="ficha-territorial-error">
        No se pudo obtener el contexto territorial en este momento.
      </p>
    )
  }

  if (estado.fase === 'sin-perfil') {
    return (
      <p className="ficha-territorial__estado" data-testid="ficha-territorial-sin-perfil">
        Sin perfil geográfico registrado para esta escuela.
      </p>
    )
  }

  if (estado.fase === 'sin-cobertura') {
    return (
      <section
        className="ficha-territorial ficha-territorial--sin-cobertura"
        data-testid="ficha-territorial-sin-cobertura"
      >
        <p className="ficha-territorial__titulo">
          <strong>Sin cobertura geográfica</strong>
        </p>
        {estado.motivo && <p className="ficha-territorial__motivo">Motivo: {traducirMotivoExclusion(estado.motivo)}</p>}
      </section>
    )
  }

  const { perfil, peligro, fuentes } = estado

  const puntos = (peligro.pronostico ?? []).filter(
    (punto) => punto.horizonteHoras <= HORIZONTE_MAX_HORAS,
  )
  const sinPeligro = puntos.length === 0

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

  const proveedores = [...new Set(puntos.map((punto) => punto.provider))]
  const corridaMasReciente = puntos
    .map((punto) => punto.corridaEn ?? punto.validoEn ?? null)
    .filter((valor): valor is string => valor !== null)
    .sort()
    .at(-1)
  const antiguedad = formatearFecha(corridaMasReciente)

  // Corrección de revisión (hallazgo H6, docs/ejecucion-enos/E2/registro.md
  // §5): "vencida" es sobre FRESCURA real (frescuraMinutos > ttlMinutos), no
  // sobre `estado`. Antes: un provider 'degradado' con dato fresco se
  // mostraba como vencido igual, y uno 'ok' con dato realmente viejo no se
  // avisaba. `/api/infraestructura/fuentes` ya expone frescuraMinutos
  // calculado; si faltara (undefined/null), tratamos esa fuente como vencida
  // por precaución (frescura desconocida no es sinónimo de fresca).
  const fuentesVencidas = fuentes.filter((fuente) => {
    if (!fuente.provider.startsWith(PREFIJO_PROVIDER_PRONOSTICO)) return false
    if (fuente.frescuraMinutos == null || fuente.ttlMinutos == null) return true
    return fuente.frescuraMinutos > fuente.ttlMinutos
  })

  return (
    <section className="ficha-territorial" data-testid="ficha-territorial-datos">
      <p className="ficha-territorial__titulo">
        <strong>Contexto territorial</strong>
      </p>

      <p className="ficha-territorial__dato">Departamento: {perfil.departamento ?? 'No registrado'}</p>
      <p className="ficha-territorial__dato">Celda: {perfil.geometryRef}</p>
      <p className="ficha-territorial__dato">
        Calidad de coordenada: {perfil.geoCalidad ?? 'no registrada'}
      </p>

      {fuentesVencidas.length > 0 && (
        <p
          className="ficha-territorial__aviso-vencida"
          role="alert"
          data-testid="ficha-territorial-fuente-vencida"
        >
          <strong>Fuente vencida</strong>: {fuentesVencidas.map((fuente) => fuente.provider).join(', ')}.
          Los datos pueden estar desactualizados.
        </p>
      )}

      {sinPeligro ? (
        <p
          className="ficha-territorial__estado"
          data-testid="ficha-territorial-sin-peligro"
        >
          Sin peligro estimado
        </p>
      ) : (
        <div className="ficha-territorial__resumen">
          {precipitacion.length > 0 && (
            <p className="ficha-territorial__dato">
              Lluvia acumulada próximas 72h: {formatearValor(lluviaAcumulada)}{' '}
              {precipitacion[0].unidad}
            </p>
          )}
          {rafagas.length > 0 && (
            <p className="ficha-territorial__dato">
              Ráfagas máximas próximas 72h: {formatearValor(rafagaMaxima)} {rafagas[0].unidad}
            </p>
          )}
          {caudalMasProximo && (
            <p className="ficha-territorial__dato">
              Caudal del punto de río: {formatearValor(caudalMasProximo.valor)}{' '}
              {caudalMasProximo.unidad}
            </p>
          )}
          {proveedores.length > 0 && (
            <p className="ficha-territorial__fuente">
              Fuente: {proveedores.join(', ')}
              {antiguedad ? ` · ${antiguedad}` : ''}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
