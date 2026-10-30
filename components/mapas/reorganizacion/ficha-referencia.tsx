'use client'

import { useId } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OfertaNivel, ReferenciaV29 } from '@/lib/reorganizacion/tipos'

export interface FichaReferenciaProps {
  referencia: ReferenciaV29
  /** Oferta por nivel del CUE (`ofertaPorCue`). Undefined cuando la fuente no tiene agregados. */
  oferta: Record<string, OfertaNivel> | undefined
  onCerrar: () => void
  onOrigen: (cue: string) => void
  onDestino: (cue: string) => void
  onAcercar: (cue: string) => void
  /** Los botones de medición solo aparecen mientras una medición de recorrido está activa. */
  recorridoActivo: boolean
}

const SIN_DATO = 'Sin dato'

const formatoNumero = new Intl.NumberFormat('es-AR')

function textoODato(valor: string | null | undefined): string {
  return valor && valor.trim() !== '' ? valor : SIN_DATO
}

/** Los niveles salen de las banderas de la fuente: un establecimiento puede ofrecer ambos. */
function nivelesQueOfrece(referencia: ReferenciaV29): string {
  const niveles = [
    referencia.primaria ? 'Primaria' : null,
    referencia.secundaria ? 'Secundaria' : null,
  ].filter((nivel): nivel is string => nivel !== null)
  return niveles.length > 0 ? niveles.join(', ') : SIN_DATO
}

function turnosTexto(turnos: Record<string, number>): string {
  const entradas = Object.entries(turnos).sort(([a], [b]) => a.localeCompare(b, 'es'))
  if (entradas.length === 0) return SIN_DATO
  return entradas.map(([turno, cantidad]) => `${turno}: ${formatoNumero.format(cantidad)}`).join(' · ')
}

function listaODato(valores: string[]): string {
  return valores.length > 0 ? valores.join(', ') : SIN_DATO
}

function OfertaReferencia({ oferta }: { oferta: Record<string, OfertaNivel> | undefined }) {
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

export function FichaReferencia({
  referencia,
  oferta,
  onCerrar,
  onOrigen,
  onDestino,
  onAcercar,
  recorridoActivo,
}: FichaReferenciaProps) {
  const tituloId = useId()
  const matricula = referencia.matriculaPrimaria
  const matriculaTexto =
    typeof matricula === 'number' && Number.isFinite(matricula) ? formatoNumero.format(matricula) : SIN_DATO

  return (
    <article className="map-ficha-escuela" aria-labelledby={tituloId}>
      <header className="map-ficha-escuela__head">
        <h2 id={tituloId}>{referencia.nombre}</h2>
        <p>CUE-Anexo {referencia.cue}</p>
        <p>Establecimiento de referencia: no integra el universo de hasta 10 alumnos</p>
      </header>

      <dl className="map-ficha-escuela__kv">
        <dt>Departamento</dt>
        <dd>{textoODato(referencia.departamento)}</dd>
        <dt>Localidad</dt>
        <dd>{textoODato(referencia.localidad)}</dd>
        <dt>Niveles que ofrece</dt>
        <dd>{nivelesQueOfrece(referencia)}</dd>
        <dt>Matrícula primaria 2026</dt>
        <dd>{matriculaTexto}</dd>
      </dl>

      <div role="group" aria-label="Acciones del establecimiento">
        <Button variant="secondary" onClick={() => onAcercar(referencia.cue)}>
          Acercar
        </Button>
        {recorridoActivo && (
          <>
            <Button variant="secondary" onClick={() => onOrigen(referencia.cue)}>
              Medir desde aquí
            </Button>
            <Button variant="secondary" onClick={() => onDestino(referencia.cue)}>
              Medir hasta aquí
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={onCerrar}>
          <X aria-hidden="true" />
          Cerrar
        </Button>
      </div>

      <section>
        <h3>Oferta educativa</h3>
        <OfertaReferencia oferta={oferta} />
      </section>
    </article>
  )
}
