'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { RADIO_ZONA_KM, contarAislados, listarZonas } from '@/lib/reorganizacion/zonas'
import type { DatasetV29 } from '@/lib/reorganizacion/tipos'

export interface MetodologiaReorganizacionProps {
  dataset: DatasetV29
}

/** Centros declarados por el mockup: los identificadores mayores son adicionales. */
const CENTROS_ORIGINALES_DECLARADOS = 59

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')

/** AAAA-MM-DD a DD/MM/AAAA sin pasar por la zona horaria del navegador. */
function formatearCorte(corte: string): string {
  const [anio, mes, dia] = corte.split('-')
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : corte
}

const numero = (valor: number) => FORMATO_NUMERO.format(valor)

/** Metodología del mapa: cifras leídas del dataset, nunca fijas en el texto. */
export function MetodologiaReorganizacion({ dataset }: MetodologiaReorganizacionProps) {
  const { cobertura, escuelas, referencias, ofertaPorCue, centros } = dataset

  const centrosSinMiembros = useMemo(
    () =>
      listarZonas(centros, escuelas)
        .filter((zona) => zona.centro !== null && zona.miembros.length === 0)
        .map((zona) => zona.id),
    [centros, escuelas],
  )
  const centrosAdicionales = centros.filter((centro) => centro.id > CENTROS_ORIGINALES_DECLARADOS).length
  const aislados = useMemo(() => contarAislados(escuelas), [escuelas])
  const clavesOferta = Object.keys(ofertaPorCue).length
  const aniosHistoria = Object.keys(cobertura.historiaPorAnio).sort()

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" />}>Metodología</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Metodología de la reorganización</DialogTitle>
        <DialogDescription>Fuentes, períodos, faltantes y límites de cada cálculo del mapa.</DialogDescription>

        <div className="rz-met">
          <section>
            <h3>Universo y corte</h3>
            <dl className="rz-kv">
              <dt>Versión</dt>
              <dd>{dataset.version}</dd>
              <dt>Fecha de corte</dt>
              <dd>{formatearCorte(dataset.corte)}</dd>
              <dt>Establecimientos del universo</dt>
              <dd>{numero(cobertura.escuelas)}</dd>
              <dt>Alumnos de primaria</dt>
              <dd>{numero(cobertura.alumnos)}</dd>
              <dt>Con coordenadas</dt>
              <dd>{numero(cobertura.conCoordenadas)}</dd>
              <dt>Con importe salarial positivo</dt>
              <dd>{numero(cobertura.conImportePositivo)}</dd>
              <dt>Con registros POF</dt>
              <dd>{numero(cobertura.conRegistrosPof)}</dd>
              <dt>Centros de zona</dt>
              <dd>{numero(cobertura.centros)}</dd>
              <dt>Zonas ocupadas</dt>
              <dd>{numero(cobertura.zonasOcupadas)}</dd>
            </dl>
            <p>
              El universo es Primaria común de 1 a 10 alumnos, según el corte que declara el mockup. Tener registros POF
              o liquidaciones no define la pertenencia al universo.
            </p>
          </section>

          <section>
            <h3>Fuentes y períodos</h3>
            <ul>
              <li>Corte V29: establecimientos, matrícula y ubicación del mockup de origen.</li>
              <li>
                Matrícula por año, de 2023 a 2026. Establecimientos con dato:{' '}
                {aniosHistoria.map((anio) => `${anio}: ${numero(cobertura.historiaPorAnio[anio])}`).join(', ')}.
              </li>
              <li>Importes salariales: costo mensual de septiembre 2026 informado por establecimiento.</li>
              <li>Oferta: matrícula agregada, turnos, modalidades y orientaciones por CUE. No contiene datos personales.</li>
              <li>Referencias: establecimientos de primaria y secundaria con su ubicación.</li>
            </ul>
          </section>

          <section>
            <h3>Qué significa sin dato</h3>
            <ul>
              <li>Sin dato no es cero. Un dato ausente se muestra como &quot;Sin dato&quot;.</li>
              <li>Un año sin matrícula registrada no equivale a cero alumnos.</li>
              <li>Un establecimiento sin importe positivo no aporta salario cero a su zona.</li>
              <li>Una referencia sin matrícula primaria informada se muestra como sin dato.</li>
            </ul>
          </section>

          <section>
            <h3>POF y personal de liquidaciones</h3>
            <p>
              {cobertura.conRegistrosPof === 0
                ? 'La fuente POF de este corte no tiene registros para ningún establecimiento.'
                : `La fuente POF de este corte tiene registros para ${numero(cobertura.conRegistrosPof)} de ${numero(cobertura.escuelas)} establecimientos.`}{' '}
              Esto no indica ausencia de personal.
            </p>
            <p>El personal de liquidaciones y los agentes POF son conceptos separados. No se igualan entre sí.</p>
          </section>

          <section>
            <h3>Cómo se agrupan las zonas</h3>
            <ul>
              <li>
                Cada zona es un círculo de 20 km de diámetro (radio de {RADIO_ZONA_KM} km) alrededor de su centro.
              </li>
              <li>Hay {numero(centros.length)} centros de zona.</li>
              <li>El mockup declara {CENTROS_ORIGINALES_DECLARADOS} centros originales.</li>
              <li>
                Centros adicionales (identificador mayor que {CENTROS_ORIGINALES_DECLARADOS}): {numero(centrosAdicionales)}.
                Su procedencia está pendiente de confirmar. Las asignaciones no se recalculan.
              </li>
              <li>
                {centrosSinMiembros.length > 0
                  ? `Centros sin establecimientos asignados: ${centrosSinMiembros.join(', ')}.`
                  : 'Todos los centros tienen establecimientos asignados.'}
              </li>
              <li>
                Establecimientos aislados: {numero(aislados)}. No pertenecen a ninguna zona.
              </li>
              <li>Los círculos y los resúmenes representan la zona completa, aunque el listado esté filtrado.</li>
            </ul>
          </section>

          <section>
            <h3>Tendencia zonal</h3>
            <ul>
              <li>Compara 2023 y 2026 solo en los establecimientos que tienen matrícula registrada en ambos años.</li>
              <li>Una zona sin establecimientos comparables se marca como &quot;Sin comparación&quot;.</li>
            </ul>
          </section>

          <section>
            <h3>Economía de la zona</h3>
            <ul>
              <li>Costo informado: suma de los importes salariales positivos disponibles.</li>
              <li>Referencia retenida: el establecimiento con mayor importe informado.</li>
              <li>Potencial bruto mensual: costo informado menos el importe de la referencia retenida.</li>
              <li>Potencial bruto anual: potencial bruto mensual por 12.</li>
              <li>Se calcula solo con al menos 2 establecimientos y 2 importes positivos en la zona.</li>
              <li>Con cobertura parcial, la cifra considera solo los importes disponibles y lo indica.</li>
            </ul>
            <p className="rz-nota rz-nota--aviso">
              Límites: no descuenta cargos a conservar o reubicar, transporte, adecuaciones ni costos del receptor. Es un
              potencial bruto bajo un supuesto, no un ahorro confirmado ni una recomendación de cierre.
            </p>
          </section>

          <section>
            <h3>Recorridos</h3>
            <ul>
              <li>El tiempo es teórico: no considera el estado del camino ni el clima.</li>
              <li>OpenStreetMap puede tener información incompleta en zonas rurales, y entonces el recorrido puede faltar.</li>
              <li>Si el servicio vial falla o no hay conexión, no se muestra una distancia en línea recta.</li>
            </ul>
          </section>

          <section>
            <h3>Oferta educativa</h3>
            <p>
              Referencias del corte: {numero(referencias.length)}. Claves de agregados de oferta: {numero(clavesOferta)}.
              Si los números no coinciden, la diferencia se informa y no se descarta en silencio.
            </p>
          </section>

          <section>
            <h3>Pendientes</h3>
            <p>
              El fondo satelital usa imágenes de Esri World Imagery, con atribución visible en el mapa. El proveedor vial de
              producción y el fondo topográfico están pendientes de confirmar: fuente, licencia, atribución,
              disponibilidad y condiciones de uso.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
