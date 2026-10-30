import { useId } from 'react'
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
    <section aria-labelledby={idTitulo} className="flex flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={idTitulo} className="break-words text-lg font-semibold">
            {etiqueta}
          </h2>
          <p className="text-sm text-slate-600">{`Círculo de ${DIAMETRO_ZONA_KM} km de diámetro`}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCerrar}>
          Cerrar
        </Button>
      </header>

      {sinMiembros ? (
        <p className="text-sm text-slate-700">Sin establecimientos asignados</p>
      ) : (
        <>
          <section aria-labelledby={`${idTitulo}-miembros`} className="flex flex-col gap-2">
            <h3 id={`${idTitulo}-miembros`} className="text-sm font-semibold">
              {`Establecimientos (${FORMATO_NUMERO.format(estadisticas.cantidad)})`}
            </h3>
            <p className="text-sm">
              {`Matrícula total: ${FORMATO_NUMERO.format(estadisticas.matriculaTotal)} alumnos`}
            </p>
            <ul className="flex flex-col gap-1">
              {miembros.map((escuela) => (
                <li key={escuela.cue}>
                  <button
                    type="button"
                    onClick={() => onSeleccionarEscuela(escuela.cue)}
                    className="flex min-h-11 w-full flex-col justify-center rounded px-2 py-1 text-left text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                  >
                    <span className="break-words font-medium">{escuela.nombre}</span>
                    <span className="text-xs text-slate-600">
                      {`CUE ${escuela.cue} · ${FORMATO_NUMERO.format(escuela.matricula)} alumnos`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby={`${idTitulo}-comparable`} className="flex flex-col gap-2">
            <h3 id={`${idTitulo}-comparable`} className="text-sm font-semibold">
              Comparación 2023 y 2026
            </h3>
            <p className="flex items-center gap-2 text-sm font-medium">
              <span
                aria-hidden="true"
                className="inline-block size-3 rounded-full"
                style={{ backgroundColor: estadisticas.colorTendencia }}
              />
              <span>{estadisticas.etiquetaTendencia}</span>
            </p>
            {estadisticas.comparables === 0 ? (
              <p className="text-sm text-slate-600">Ningún establecimiento tiene registro de 2023 y 2026.</p>
            ) : (
              <p className="text-sm">
                {`${FORMATO_NUMERO.format(estadisticas.comparables)} escuelas comparables: ${FORMATO_NUMERO.format(estadisticas.matricula2023 ?? 0)} alumnos en 2023 y ${FORMATO_NUMERO.format(estadisticas.matricula2026 ?? 0)} en 2026.`}
              </p>
            )}
          </section>

          <section aria-labelledby={`${idTitulo}-economia`} className="flex flex-col gap-2">
            <h3 id={`${idTitulo}-economia`} className="text-sm font-semibold">
              Potencial bruto bajo un supuesto
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-slate-600">Escuelas con importe informado</dt>
              <dd>{`${FORMATO_NUMERO.format(economia.escuelasConImporte)} de ${FORMATO_NUMERO.format(economia.totalEscuelas)}`}</dd>
              <dt className="text-slate-600">Personal informado</dt>
              <dd>{`${FORMATO_NUMERO.format(economia.personalInformado)} personas`}</dd>
              <dt className="text-slate-600">Costo informado mensual</dt>
              <dd>{formatearARS(economia.costoInformado)}</dd>
              {economia.referenciaRetenida && (
                <>
                  <dt className="text-slate-600">Referencia retenida</dt>
                  <dd className="break-words">
                    {`${economia.referenciaRetenida.nombre} (CUE ${economia.referenciaRetenida.cue}): ${formatearARS(economia.referenciaRetenida.importe)}`}
                  </dd>
                </>
              )}
            </dl>

            {economia.supuesto && <p className="text-sm text-slate-700">{economia.supuesto}</p>}

            {economia.calculable && economia.potencialBrutoMensual !== null && economia.potencialBrutoAnual !== null ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-600">Potencial bruto mensual</dt>
                <dd className="font-medium">{formatearARS(economia.potencialBrutoMensual)}</dd>
                <dt className="text-slate-600">Potencial bruto anual</dt>
                <dd className="font-medium">{formatearARS(economia.potencialBrutoAnual)}</dd>
              </dl>
            ) : (
              <p className="text-sm font-medium">{`No calculable: ${economia.motivo ?? 'sin importes informados'}`}</p>
            )}

            {economia.cobertura === 'parcial' && (
              <p className="text-sm text-slate-700">
                Cobertura parcial: la cifra representa solo los importes disponibles.
              </p>
            )}

            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-semibold">Advertencias</h4>
              <ul className="list-disc pl-5 text-sm text-slate-700">
                {economia.advertencias.map((advertencia) => (
                  <li key={advertencia}>{advertencia}</li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}
    </section>
  )
}
