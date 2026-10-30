'use client'

import { Fragment, useId, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatearARS } from '@/lib/reorganizacion/economia'
import type { EscuelaV29, OfertaNivel } from '@/lib/reorganizacion/tipos'

export interface FichaEscuelaProps {
  escuela: EscuelaV29
  /** Oferta por nivel del CUE (`ofertaPorCue`). Undefined cuando la fuente no tiene agregados. */
  oferta: Record<string, OfertaNivel> | undefined
  onCerrar: () => void
  onOrigen: (cue: string) => void
  onDestino: (cue: string) => void
  onAcercar: (cue: string) => void
  /** Los botones de medición solo aparecen mientras una medición de recorrido está activa. */
  recorridoActivo: boolean
}

const ANIOS_HISTORIA = ['2023', '2024', '2025', '2026'] as const

/** Período de los importes salariales del corte V29 (mockup: "Sueldos mensuales · septiembre 2026"). */
const PERIODO_LIQUIDACIONES = 'septiembre 2026'

const SIN_DATO = 'Sin dato'

const formatoNumero = new Intl.NumberFormat('es-AR')

function esNumeroFinito(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor)
}

/** Igual que el mockup: un importe nulo o no positivo significa que la fuente no lo informó. */
function esImporteInformado(valor: number | null): valor is number {
  return esNumeroFinito(valor) && valor > 0
}

function textoODato(valor: string | null | undefined): string {
  return valor && valor.trim() !== '' ? valor : SIN_DATO
}

function listaODato(valores: string[]): string {
  return valores.length > 0 ? valores.join(', ') : SIN_DATO
}

function turnosTexto(turnos: Record<string, number>): string {
  const entradas = Object.entries(turnos).sort(([a], [b]) => a.localeCompare(b, 'es'))
  if (entradas.length === 0) return SIN_DATO
  return entradas.map(([turno, cantidad]) => `${turno}: ${formatoNumero.format(cantidad)}`).join(' · ')
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="map-ficha-escuela__fold" open>
      <summary>
        {titulo}
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="map-ficha-escuela__fold-body">{children}</div>
    </details>
  )
}

function EvolucionMatricula({ historia }: { historia: Record<string, number> }) {
  const valores = ANIOS_HISTORIA.map((anio) => historia[anio])
  // Escala común: la barra más larga representa el año de mayor matrícula informada.
  const maximo = Math.max(1, ...valores.filter(esNumeroFinito))
  return (
    <dl className="map-ficha-escuela__kv">
      {ANIOS_HISTORIA.map((anio, indice) => {
        const valor = valores[indice]
        return (
          <Fragment key={anio}>
            <dt>{anio}</dt>
            <dd>
              {esNumeroFinito(valor) ? (
                <>
                  <span>{formatoNumero.format(valor)} alumnos</span>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'block',
                      height: 6,
                      width: `${(valor / maximo) * 100}%`,
                      minWidth: 2,
                      marginTop: 4,
                      background: 'var(--accent)',
                      borderRadius: 'var(--r-xs)',
                    }}
                  />
                </>
              ) : (
                <span>{SIN_DATO}</span>
              )}
            </dd>
          </Fragment>
        )
      })}
    </dl>
  )
}

function OfertaEducativa({ oferta }: { oferta: Record<string, OfertaNivel> | undefined }) {
  const niveles = Object.entries(oferta ?? {})
  if (niveles.length === 0) return <p>Sin datos de oferta</p>
  return (
    <>
      {niveles.map(([nivel, registro]) => (
        <div key={nivel}>
          <h4>{nivel}</h4>
          <dl className="map-ficha-escuela__kv">
            <dt>Matrícula agregada</dt>
            <dd>{formatoNumero.format(registro.total)}</dd>
            <dt>Turnos</dt>
            <dd>{turnosTexto(registro.turnos)}</dd>
            <dt>Modalidades</dt>
            <dd>{listaODato(registro.modalidades)}</dd>
            <dt>Orientaciones</dt>
            <dd>{listaODato(registro.orientaciones)}</dd>
          </dl>
        </div>
      ))}
    </>
  )
}

function RegistrosPof({ agentes, pof }: { agentes: number; pof: Record<string, unknown> }) {
  const situaciones = Object.entries(pof)
  if (situaciones.length === 0) {
    return (
      <p>
        La fuente no registra datos POF para este establecimiento. Esto no indica ausencia de personal.
      </p>
    )
  }
  return (
    <dl className="map-ficha-escuela__kv">
      <dt>Agentes</dt>
      <dd>{formatoNumero.format(agentes)}</dd>
      {situaciones.map(([situacion, valor]) => (
        <Fragment key={situacion}>
          <dt>{situacion}</dt>
          <dd>
            {esNumeroFinito(valor)
              ? formatoNumero.format(valor)
              : typeof valor === 'string'
                ? valor
                : SIN_DATO}
          </dd>
        </Fragment>
      ))}
    </dl>
  )
}

function Liquidaciones({ escuela }: { escuela: EscuelaV29 }) {
  const importe = escuela.sueldosTotal
  return (
    <>
      <dl className="map-ficha-escuela__kv">
        <dt>Importe mensual</dt>
        <dd>{esImporteInformado(importe) ? formatearARS(importe) : 'Sin importe informado'}</dd>
        <dt>Período</dt>
        <dd>{PERIODO_LIQUIDACIONES}</dd>
        <dt>Personal informado</dt>
        <dd>
          {esNumeroFinito(escuela.personasSueldos)
            ? formatoNumero.format(escuela.personasSueldos)
            : SIN_DATO}
        </dd>
        <dt>Clasificación de zona</dt>
        <dd>{textoODato(escuela.clasificacionZonaSueldos)}</dd>
      </dl>
      <p>Costo salarial informado por la fuente. No es ahorro realizable.</p>
    </>
  )
}

export function FichaEscuela({
  escuela,
  oferta,
  onCerrar,
  onOrigen,
  onDestino,
  onAcercar,
  recorridoActivo,
}: FichaEscuelaProps) {
  const tituloId = useId()
  return (
    <article className="map-ficha-escuela" aria-labelledby={tituloId}>
      <header className="map-ficha-escuela__head">
        <h2 id={tituloId}>{escuela.nombre}</h2>
        <p>CUE-Anexo {escuela.cue}</p>
      </header>

      <dl className="map-ficha-escuela__kv">
        <dt>Departamento</dt>
        <dd>{textoODato(escuela.departamento)}</dd>
        <dt>Localidad</dt>
        <dd>{textoODato(escuela.localidad)}</dd>
        <dt>Zona</dt>
        <dd>{escuela.zona || 'Sin ubicación'}</dd>
        <dt>Matrícula primaria 2026</dt>
        <dd>{formatoNumero.format(escuela.matricula)}</dd>
      </dl>

      <div role="group" aria-label="Acciones del establecimiento">
        <Button variant="secondary" onClick={() => onAcercar(escuela.cue)}>
          Acercar
        </Button>
        {recorridoActivo && (
          <>
            <Button variant="secondary" onClick={() => onOrigen(escuela.cue)}>
              Medir desde aquí
            </Button>
            <Button variant="secondary" onClick={() => onDestino(escuela.cue)}>
              Medir hasta aquí
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={onCerrar}>
          <X aria-hidden="true" />
          Cerrar
        </Button>
      </div>

      <Seccion titulo="Evolución de matrícula primaria, 2023 a 2026">
        <EvolucionMatricula historia={escuela.historia} />
      </Seccion>
      <Seccion titulo="Oferta educativa">
        <OfertaEducativa oferta={oferta} />
      </Seccion>
      <Seccion titulo="POF">
        <RegistrosPof agentes={escuela.agentes} pof={escuela.pof} />
      </Seccion>
      <Seccion titulo="Liquidaciones">
        <Liquidaciones escuela={escuela} />
      </Seccion>
    </article>
  )
}
