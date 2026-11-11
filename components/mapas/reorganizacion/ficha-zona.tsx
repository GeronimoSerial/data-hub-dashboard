import { useId, type CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { RADIO_ZONA_KM, estadisticasDeZona } from '@/lib/reorganizacion/zonas'
import { formatearARS, resumenEconomico } from '@/lib/reorganizacion/economia'
import type { EscuelaV29 } from '@/lib/reorganizacion/tipos'

export interface FichaZonaProps {
  /** Nombre de la zona, p. ej. "Zona 12". */
  etiqueta: string
  /** Zona completa, nunca el subconjunto filtrado: los totales dependen de ella. */
  miembros: EscuelaV29[]
  onCerrar: () => void
  /** Recibe el CUE-Anexo del establecimiento elegido. */
  onSeleccionarEscuela: (cue: string) => void
}

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')
const DIAMETRO_ZONA_KM = RADIO_ZONA_KM * 2

/** Ficha de una zona: miembros, tendencia comparable y resumen económico bajo un supuesto. */
export function FichaZona({ etiqueta, miembros, onCerrar, onSeleccionarEscuela }: FichaZonaProps) {
  const idTitulo = useId()
  const estadisticas = estadisticasDeZona(miembros)
  const economia = resumenEconomico(miembros)
  const sinMiembros = miembros.length === 0

  return (
    <section aria-labelledby={idTitulo} className="rz-detalle">
      <header className="rz-detalle__cab">
        <div>
          <h2 id={idTitulo} className="rz-detalle__titulo">
            {etiqueta}
          </h2>
          <p className="rz-nota">{`Círculo de ${DIAMETRO_ZONA_KM} km de diámetro`}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCerrar}>
          Cerrar
        </Button>
      </header>

      {sinMiembros ? (
        <p className="rz-nota">Sin establecimientos asignados</p>
      ) : (
        <>
          <section aria-labelledby={`${idTitulo}-miembros`} className="rz-seccion">
            <h3 id={`${idTitulo}-miembros`} className="rz-seccion__titulo">
              {`Establecimientos (${FORMATO_NUMERO.format(estadisticas.cantidad)})`}
            </h3>
            <p className="rz-nota">{`Matrícula total: ${FORMATO_NUMERO.format(estadisticas.matriculaTotal)} alumnos`}</p>
            <ul className="rz-miembros">
              {miembros.map((escuela) => (
                <li key={escuela.cue}>
                  <button type="button" onClick={() => onSeleccionarEscuela(escuela.cue)}>
                    <span className="rz-fila__nombre">{escuela.nombre}</span>
                    <span className="rz-fila__meta">
                      {`CUE ${escuela.cue} · ${FORMATO_NUMERO.format(escuela.matricula)} alumnos`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby={`${idTitulo}-comparable`} className="rz-seccion">
            <h3 id={`${idTitulo}-comparable`} className="rz-seccion__titulo">
              Comparación 2023 y 2026
            </h3>
            <p className="rz-tendencias">
              <span
                aria-hidden="true"
                className="rz-muestra"
                style={{ '--muestra': estadisticas.colorTendencia } as CSSProperties}
              />
              <strong>{estadisticas.etiquetaTendencia}</strong>
            </p>
            {estadisticas.comparables === 0 ? (
              <p className="rz-nota">Ningún establecimiento tiene registro de 2023 y 2026.</p>
            ) : (
              <p className="rz-nota">
                {`${FORMATO_NUMERO.format(estadisticas.comparables)} escuelas comparables: ${FORMATO_NUMERO.format(estadisticas.matricula2023 ?? 0)} alumnos en 2023 y ${FORMATO_NUMERO.format(estadisticas.matricula2026 ?? 0)} en 2026.`}
              </p>
            )}
          </section>

          <section aria-labelledby={`${idTitulo}-economia`} className="rz-seccion">
            <h3 id={`${idTitulo}-economia`} className="rz-seccion__titulo">
              Potencial bruto bajo un supuesto
            </h3>
            <dl className="rz-kv">
              <dt>Escuelas con importe informado</dt>
              <dd>{`${FORMATO_NUMERO.format(economia.escuelasConImporte)} de ${FORMATO_NUMERO.format(economia.totalEscuelas)}`}</dd>
              <dt>Personal informado</dt>
              <dd>{`${FORMATO_NUMERO.format(economia.personalInformado)} personas`}</dd>
              <dt>Costo informado mensual</dt>
              <dd>{formatearARS(economia.costoInformado)}</dd>
              {economia.referenciaRetenida && (
                <>
                  <dt>Referencia retenida</dt>
                  <dd>
                    {`${economia.referenciaRetenida.nombre} (CUE ${economia.referenciaRetenida.cue}): ${formatearARS(economia.referenciaRetenida.importe)}`}
                  </dd>
                </>
              )}
            </dl>

            {economia.supuesto && <p className="rz-nota">{economia.supuesto}</p>}

            {economia.calculable && economia.potencialBrutoMensual !== null && economia.potencialBrutoAnual !== null ? (
              <dl className="rz-kv">
                <dt>Potencial bruto mensual</dt>
                <dd>
                  <strong>{formatearARS(economia.potencialBrutoMensual)}</strong>
                </dd>
                <dt>Potencial bruto anual</dt>
                <dd>
                  <strong>{formatearARS(economia.potencialBrutoAnual)}</strong>
                </dd>
              </dl>
            ) : (
              <p className="rz-nota rz-nota--aviso">{`No calculable: ${economia.motivo ?? 'sin importes informados'}`}</p>
            )}

            {economia.cobertura === 'parcial' && (
              <p className="rz-nota">Cobertura parcial: la cifra representa solo los importes disponibles.</p>
            )}

            <h4 className="rz-seccion__titulo">Advertencias</h4>
            <ul className="rz-lista-puntos">
              {economia.advertencias.map((advertencia) => (
                <li key={advertencia}>{advertencia}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  )
}
