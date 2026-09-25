'use client'

import { useMemo, useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import type { Feature, FeatureCollection, Point } from 'geojson'
import { buscarEscuelas, normalizarTextoBusqueda, type EscuelaProperties } from '@/lib/mapas/natalidad'

type EscuelaFeature = Feature<Point, EscuelaProperties>

interface EscuelaSearchBoxProps {
  escuelas: FeatureCollection<Point, EscuelaProperties>
  onSeleccionar: (feature: EscuelaFeature) => void
}

/** Resalta la subcadena que matcheó la búsqueda dentro de `texto` (insensible a
    mayúsculas/acentos — misma normalización que usa buscarEscuelas para rankear,
    así que "resalta lo que de verdad matcheó"). Sin match visible (p.ej. la
    query matcheó por localidad/departamento pero no aparece en este campo)
    devuelve el texto sin marcar. */
function resaltarCoincidencia(texto: string, query: string) {
  const normalizadoTexto = normalizarTextoBusqueda(texto)
  const normalizadoQuery = normalizarTextoBusqueda(query)
  if (normalizadoQuery.length === 0) return texto

  const indice = normalizadoTexto.indexOf(normalizadoQuery)
  if (indice === -1) return texto

  const fin = indice + normalizadoQuery.length
  return (
    <>
      {texto.slice(0, indice)}
      <mark className="natalidad-buscador-match">{texto.slice(indice, fin)}</mark>
      {texto.slice(fin)}
    </>
  )
}

/**
 * Buscador de escuelas (T10, feedback 2026-09-25 "se ven pésimos" — antes era
 * una lista inline dentro del panel de título, con filas centradas/alineadas
 * sin criterio y sin jerarquía visual). Ahora es un combobox accesible con
 * resultados en un popover flotante anclado al input, mismo lenguaje visual
 * que components/ui/select (Base UI): superficie, borde, radio y sombra por
 * tokens de tema (ver .ui-select-popup/.ui-select-item en globals.css), con
 * scroll propio a partir de ~6 filas visibles.
 *
 * Se usa @base-ui/react/combobox en vez de reimplementar el manejo de
 * teclado/aria a mano (como hacía la versión anterior con un <ul role="listbox">
 * casero): el primitivo ya resuelve role=combobox/listbox/option,
 * aria-activedescendant, ↑/↓/Enter/Escape y cierre al click afuera.
 *
 * El ranking (buscarEscuelas, lib/mapas/natalidad.ts) ya viene ordenado, así
 * que se pasa `filter={null}` para que el combobox no vuelva a filtrar por su
 * cuenta — sólo se le pasan los resultados ya calculados.
 */
export function EscuelaSearchBox({ escuelas, onSeleccionar }: EscuelaSearchBoxProps) {
  const [query, setQuery] = useState('')
  // Popover controlado a mano (en vez de dejar que el combobox decida cuándo
  // abrir): "mínimo 2 caracteres" tiene que significar que ni siquiera se
  // muestra el popover (ni el estado "sin resultados") por debajo de eso, y
  // Escape/click afuera tienen que poder cerrarlo sin borrar lo escrito.
  const [cerradoManualmente, setCerradoManualmente] = useState(false)

  const queryRecortada = query.trim()
  const resultados = useMemo(() => buscarEscuelas(escuelas, query, 8), [escuelas, query])
  const abierto = queryRecortada.length >= 2 && !cerradoManualmente

  function seleccionar(feature: EscuelaFeature | null) {
    if (!feature) return
    onSeleccionar(feature)
  }

  return (
    <div className="map-filtro-campo natalidad-buscador">
      <span className="map-filtro-label">Buscar escuela</span>
      <Combobox.Root<EscuelaFeature>
        items={resultados}
        itemToStringLabel={(feature) => feature.properties.nombre}
        filter={null}
        open={abierto}
        onOpenChange={(next) => {
          if (!next) setCerradoManualmente(true)
        }}
        onValueChange={seleccionar}
        onInputValueChange={(next, eventDetails) => {
          // El combobox por defecto rellena el input con el nombre elegido al
          // seleccionar (fillInputOnItemPress): acá se descarta ese relleno y
          // se limpia la búsqueda, que es el comportamiento que ya tenía este
          // buscador (seleccionar vacía el campo).
          if (eventDetails.reason === 'item-press') {
            setQuery('')
          } else {
            setQuery(next)
          }
          setCerradoManualmente(false)
        }}
      >
        <Combobox.Input
          className="ui-input map-filtro-input"
          placeholder="Nombre, CUE o localidad…"
          aria-label="Buscar escuela por nombre, CUE-anexo o localidad"
        />
        <Combobox.Portal>
          <Combobox.Positioner className="natalidad-buscador-positioner" sideOffset={6} align="start">
            <Combobox.Popup className="natalidad-buscador-popup">
              <Combobox.Empty className="natalidad-buscador-vacio">
                {queryRecortada.length >= 2 ? `Sin resultados para "${queryRecortada}"` : null}
              </Combobox.Empty>
              <Combobox.List className="natalidad-buscador-lista">
                {(feature: EscuelaFeature) => (
                  <Combobox.Item
                    key={feature.properties.cueAnexo}
                    value={feature}
                    className="natalidad-buscador-item"
                  >
                    <span className="natalidad-buscador-nombre">
                      {resaltarCoincidencia(feature.properties.nombre, queryRecortada)}
                    </span>
                    <span className="natalidad-buscador-meta">
                      {resaltarCoincidencia(feature.properties.cueAnexo, queryRecortada)} ·{' '}
                      {feature.properties.localidad} · {feature.properties.departamento}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  )
}
