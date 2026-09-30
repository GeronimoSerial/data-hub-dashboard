'use client'

import { COPY, semaforoGlosa } from '@/lib/copy/didactica'
import { SEMAFORO_ORDER, type SobreofertaData } from '@/lib/sobreoferta'
import { TREND_COLORS, type Summary, type Trend } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { UMBRAL_SIN_REPORTAR_HORAS } from '@/lib/infraestructura/umbrales'
import { COLOR_SIN_AFECTACION } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'
import { PeligroLegend } from '@/components/mapas/peligro-legend'
import { CircleSlash, Clock, DoorOpen, Tent, TriangleAlert } from 'lucide-react'

// Color neutro del borde del punto y del trazo de los íconos del badge. Mismo
// valor que ANILLO_COLOR en map-infraestructura-page.tsx: el color de severidad
// ya está tomado por el relleno, así que el estado usa un neutro, nunca una
// segunda escala de color.
const COLOR_NEUTRO_ESTADO = '#1c1c1c'

type Props = {
  summary: Summary
  sobreofertaOn?: boolean
  sobreoferta?: SobreofertaData | null
}

const ORDER: Trend[] = ['up', 'down', 'flat', 'partial']

export function LegendPanel({
  summary,
  sobreofertaOn = false,
  sobreoferta = null,
}: Props) {
  const styles = useOverlayStyles()
  const pct =
    summary.pctChange == null
      ? '—'
      : `${summary.pctChange > 0 ? '+' : ''}${summary.pctChange}%`

  return (
    <div className={`${styles.panel} ${styles.legendPanel}`}>
      <b>{COPY.legend.evolutionTitle}</b>
      <div className={styles.hint}>{COPY.legend.evolutionHint}</div>
      {COPY.legend.comparableLabel}: <b>{summary.comparableEstablishments}</b>
      <br />
      {COPY.legend.enrollment2023}: <b>{summary.enrollment2023}</b>
      <br />
      {COPY.legend.enrollment2026}: <b>{summary.enrollment2026}</b>
      <br />
      {COPY.legend.variation}: <b>{pct}</b>
      <br />
      <br />
      {ORDER.map((trend) => {
        const c = TREND_COLORS[trend]
        return (
          <div key={trend} className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: c.fill, border: `2px solid ${c.stroke}` }}
            />
            {c.label}
          </div>
        )
      })}

      {sobreofertaOn && sobreoferta && (
        <>
          <br />
          <b>{COPY.legend.sobreofertaTitle}</b>
          <div className={styles.hint}>{COPY.legend.sobreofertaPurpose}</div>
          {SEMAFORO_ORDER.map((key) => {
            const c = sobreoferta.meta.colors[key]
            return (
              <div key={key} className={styles.legendItemStack}>
                <div className={styles.legendItem}>
                  <span
                    className={styles.swatch}
                    style={{
                      background: c.fill,
                      border: `2px solid ${c.stroke}`,
                    }}
                  />
                  {c.label}
                </div>
                <div className={styles.hint}>{semaforoGlosa(key)}</div>
              </div>
            )
          })}
          <br />
          {COPY.legend.tips.map((tip) => (
            <div key={tip} className={styles.hint}>
              {tip}
            </div>
          ))}
        </>
      )}

      {sobreofertaOn && !sobreoferta && (
        <>
          <br />
          <span className={styles.hint}>{COPY.legend.noSobreofertaData}</span>
        </>
      )}
    </div>
  )
}

// ── Leyenda del mapa de infraestructura ─────────────────────────────────────
//
// Dominio distinto del resto de este archivo (evolución de matrícula) y,
// desde Fase 2, distinto también de la leyenda anterior: una escuela = un
// punto, y los canales visuales son color (severidad) y badge de estado
// (íconos lucide-react, uno solo por escuela) — ver map-infraestructura-page.tsx
// para la codificación exacta. El tamaño es fijo por escuela; los clusters
// crecen con la cantidad agrupada. El símbolo por categoría desapareció (la
// categoría pasó a filtro y a la ficha), así que esta leyenda ya no lo explica.
//
// Esta leyenda ya no recibe `indicadores`: los números consolidados los
// muestra <Indicadores>, arriba en la misma columna. Tenerlos en los dos
// lados era duplicar la misma fuente en la misma pantalla.
export function InfraLegendPanel({
  departamentosSinMatch = [],
  mostrarLeyendaPeligro = false,
  // E6: cuando está prendido, se inserta un bloque breve de leyenda de riesgo
  // de acceso (dimensión separada, "caminos y cruces" no el edificio).
  mostrarLeyendaAcceso = false,
  hayNivelProvisorio = false,
}: {
  // F2.4: un departamento de la base que no matchea ningún polígono del
  // GeoJSON no se silencia (gotcha de nombres, ver lib/mapas/departamentos.ts)
  // — se loguea en consola Y se muestra acá, para que sea visible también
  // para quien mira el mapa y no la consola del navegador.
  departamentosSinMatch?: string[]
  // Modo Radar (E4): cuando está prendido, se inserta el bloque de niveles de
  // peligro DENTRO de esta misma leyenda (no se monta un panel paralelo). El
  // componente <PeligroLegend> ya trae su propio título y lista accesible.
  mostrarLeyendaPeligro?: boolean
  mostrarLeyendaAcceso?: boolean
  // P1: alguna celda del corte vigente usa umbral provisorio (falta su
  // climatología ERA5). Pasa directo a <PeligroLegend> para el aviso.
  hayNivelProvisorio?: boolean
}) {
  const styles = useOverlayStyles()

  return (
    // Colapsable y cerrada por defecto. La referencia se consulta una vez y
    // después estorba: abierta ocupa media columna y empuja los filtros y la
    // lista fuera de la vista. `<details>` nativo en vez de estado propio
    // porque el navegador ya resuelve teclado y accesibilidad.
    // Los números consolidados NO van acá: los muestra <Indicadores> justo
    // arriba, en esta misma columna, y repetirlos era duplicar una fuente.
    <details className={`${styles.panel} ${styles.legendPanel}`}>
      <summary className={styles.legendSummary}>Referencias</summary>
      {/*
        Leyenda propia de cada modo. En Radar/Replay (`mostrarLeyendaPeligro`)
        el contenido de "Situación actual" (severidad + badges de estado +
        hints de tamaño/cluster) NO aplica: se oculta entero y la leyenda pasa
        a ser la del peligro meteorológico (más el bloque de riesgo de acceso
        si está activo). Fuera de Radar/Replay se mantiene igual que antes.
      */}
      {!mostrarLeyendaPeligro && (
        <>
          <div className={styles.hint}>
            Color: severidad de la peor afectación vigente. Tamaño: fijo para cada escuela
            individual; los grupos (clusters) sí crecen con la cantidad de escuelas agrupadas, de
            forma intencional. Ícono: estado del establecimiento (ver más abajo).
          </div>

          {SEVERIDADES.map((severidad) => (
            <div key={severidad} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: colorSeveridad(severidad) }} />
              {severidad}
            </div>
          ))}

          <div className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: COLOR_SIN_AFECTACION }} />
            Sin afectación reportada (cluster gris)
          </div>

          <br />
          {/*
            Badge de estado (V2): un solo ícono por escuela, sin color propio de
            severidad (el color del punto ya comunica gravedad). El orden de las
            filas replica la prioridad de `iconoEstadoEscuela`
            (lib/mapas/severidad-visual.ts): de mayor a menor urgencia.
          */}
          <div className={styles.legendItem}>
            <Tent size={16} color={COLOR_NEUTRO_ESTADO} aria-hidden />
            Centro de evacuados
          </div>
          <div className={styles.legendItem}>
            <DoorOpen size={16} color={COLOR_NEUTRO_ESTADO} aria-hidden />
            Evacuado
          </div>
          <div className={styles.legendItem}>
            <CircleSlash size={16} color={COLOR_NEUTRO_ESTADO} aria-hidden />
            Servicio suspendido
          </div>
          <div className={styles.legendItem}>
            <TriangleAlert size={16} color={COLOR_NEUTRO_ESTADO} aria-hidden />
            Servicio parcial
          </div>
          <div className={styles.legendItem}>
            <Clock size={16} color={COLOR_NEUTRO_ESTADO} aria-hidden />
            Sin reportar (+{UMBRAL_SIN_REPORTAR_HORAS} h sin actualizar)
          </div>

          <div className={styles.hint}>
            Si una escuela cumple más de una condición, se muestra sólo la de mayor urgencia (el
            orden de arriba hacia abajo).
          </div>

          <br />
          <div className={styles.hint}>
            Grupos (clusters): el número es la cantidad de escuelas AFECTADAS dentro del grupo (no
            el total agrupado ni de alumnos); si el grupo no tiene ninguna afectada, no muestra
            número. El color es la severidad más alta entre las escuelas agrupadas.
          </div>

          <br />
          <div className={styles.hint}>
            Departamentos: la intensidad del relleno (no el color) sube con la cantidad de escuelas
            con servicio suspendido o parcial en ese departamento; la etiqueta muestra el nombre y,
            si hay alguna, el conteo.
          </div>
        </>
      )}

      {departamentosSinMatch.length > 0 && (
        <div className={`${styles.hint} ${styles.statusError}`}>
          Departamento(s) sin coincidencia geográfica: {departamentosSinMatch.join(', ')}
        </div>
      )}

      {mostrarLeyendaAcceso && (
        <>
          <br />
          <div className={styles.hint}>
            Riesgo de acceso (caminos y cruces), no del edificio.
          </div>
          {(
            [
              ['bajo', '#719c29'],
              ['moderado', '#facd05'],
              ['alto', '#f68e13'],
              ['sin_cobertura', '#8a8886'],
            ] as const
          ).map(([nivel, color]) => (
            <div key={nivel} className={styles.legendItem}>
              <span
                className={styles.swatch}
                style={{
                  background: color,
                  border: nivel === 'alto' ? '3px solid #1c1c1c' : undefined,
                }}
              />
              {nivel === 'sin_cobertura' ? 'Sin cobertura' : nivel}
            </div>
          ))}
        </>
      )}

      {mostrarLeyendaPeligro && (
        <>
          <br />
          <PeligroLegend hayNivelProvisorio={hayNivelProvisorio} />
        </>
      )}

    </details>
  )
}
