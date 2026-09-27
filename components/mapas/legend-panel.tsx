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
// punto, y los canales visuales son color (severidad), tamaño (fijo, igual
// para todas) y anillo (servicio) — ver map-infraestructura-page.tsx para la codificación
// exacta. El símbolo por categoría desapareció (la categoría pasó a filtro y
// a la ficha), así que esta leyenda ya no lo explica.
//
// Esta leyenda ya no recibe `indicadores`: los números consolidados los
// muestra <Indicadores>, arriba en la misma columna. Tenerlos en los dos
// lados era duplicar la misma fuente en la misma pantalla.
export function InfraLegendPanel({
  departamentosSinMatch = [],
  mostrarLeyendaPeligro = false,
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
      <div className={styles.hint}>
        Color: severidad de la peor afectación vigente. Tamaño: fijo, igual para todas las
        escuelas. Anillo: estado del servicio educativo.
      </div>

      {SEVERIDADES.map((severidad) => (
        <div key={severidad} className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: colorSeveridad(severidad) }} />
          {severidad}
        </div>
      ))}

      <div className={styles.legendItem}>
        <span className={styles.swatch} style={{ background: COLOR_SIN_AFECTACION }} />
        Sin afectación reportada
      </div>

      <br />
      {/*
        El anillo no puede usar color (ya está tomado por severidad): se
        distingue por grosor y opacidad de trazo. Estos tres swatches son
        ilustrativos de esa codificación, no una escala de color nueva.
      */}
      <div className={styles.legendItem}>
        <span
          className={styles.swatch}
          style={{ background: 'transparent', border: '3px solid #1c1c1c', borderRadius: '50%' }}
        />
        Servicio suspendido (anillo grueso)
      </div>
      <div className={styles.legendItem}>
        <span
          className={styles.swatch}
          style={{
            background: 'transparent',
            border: '2px solid #1c1c1c',
            borderRadius: '50%',
            opacity: 0.55,
          }}
        />
        Servicio parcial (anillo fino)
      </div>
      <div className={styles.legendItem}>
        <span
          className={styles.swatch}
          style={{ background: 'transparent', border: '1px solid #1c1c1c', borderRadius: '50%' }}
        />
        Servicio normal (sin anillo)
      </div>

      <br />
      {/*
        Evacuación (F2.3): dos formas, no dos colores — evacuado y
        centro_evacuados son opuestos (daño vs. recurso) y en emergencia el
        recurso es lo primero que se busca, así que no pueden compartir
        símbolo. Capa aparte, apagada por defecto (ver InfraLayerControl).
      */}
      <div className={styles.legendItem}>
        <span
          className={styles.swatch}
          style={{ background: 'transparent', border: '2px solid #1c1c1c' }}
        />
        Evacuado (cuadrado): daño en el establecimiento
      </div>
      <div className={styles.legendItem}>
        <span
          className={styles.swatch}
          style={{
            background: 'transparent',
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: '12px solid #1c1c1c',
            width: 0,
            height: 0,
          }}
        />
        Centro de evacuados (triángulo): la escuela aloja gente
      </div>
      <div className={styles.legendItem}>
        <span
          className={styles.swatch}
          style={{ background: 'transparent', border: '2px solid #6b7280', borderRadius: '50%' }}
        />
        Sin reportar (halo gris): más de {UMBRAL_SIN_REPORTAR_HORAS} h sin actualización — ausencia
        de información, no severidad
      </div>

      <br />
      <div className={styles.hint}>
        Departamentos: la intensidad del relleno (no el color) sube con la cantidad de escuelas
        con servicio suspendido o parcial en ese departamento; la etiqueta muestra el nombre y, si
        hay alguna, el conteo.
      </div>

      {departamentosSinMatch.length > 0 && (
        <div className={`${styles.hint} ${styles.statusError}`}>
          Departamento(s) sin coincidencia geográfica: {departamentosSinMatch.join(', ')}
        </div>
      )}

      {mostrarLeyendaPeligro && (
        <>
          <br />
          <PeligroLegend />
        </>
      )}

    </details>
  )
}
