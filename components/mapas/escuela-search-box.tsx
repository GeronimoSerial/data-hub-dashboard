'use client'

import { useMemo, useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { buscarEscuelas, normalizarTextoBusqueda, type EscuelaBuscable } from '@/lib/mapas/buscar-escuelas'

export interface EscuelaSearchBoxProps<T extends EscuelaBuscable> {
  /** El padrón COMPLETO de escuelas (no sólo las pintadas en el mapa). */
  escuelas: T[]
  onSeleccionar: (item: T) => void
  /** Placeholder del input. */
  placeholder?: string
}

/** Resalta la subcadena que matcheó la búsqueda dentro de `texto` (insensible a
    mayúsculas/acentos — misma normalización que usa buscarEscuelas para rankear,
    así que "resalta lo que de verdad matcheó"). Sin match visible (p.ej. la
    query matcheó por departamento pero no aparece en este campo) devuelve el
    texto sin marcar. Detalle de presentación, local a este archivo. */
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
      <mark className="mapa-buscador-escuela-match">{texto.slice(indice, fin)}</mark>
      {texto.slice(fin)}
    </>
  )
}

/**
 * Buscador genérico de escuelas sobre un padrón plano que cumpla EscuelaBuscable.
 *
 * Es un combobox accesible (Base UI) con resultados en un popover flotante
 * anclado al input, mismo lenguaje visual que components/ui/select. El ranking
 * (buscarEscuelas) ya viene ordenado, así que se pasa `filter={null}` para que
 * el combobox no vuelva a filtrar por su cuenta.
 *
 * El popover se controla a mano: por debajo de 2 caracteres no se abre (ni
 * siquiera el estado "sin resultados"), y Escape/click afuera lo cierran sin
 * borrar lo escrito. Al seleccionar un item se limpia el input.
 */
export function EscuelaSearchBox<T extends EscuelaBuscable>({
  escuelas,
  onSeleccionar,
  placeholder = 'Nombre, CUE, localidad o departamento…',
}: EscuelaSearchBoxProps<T>) {
  const [query, setQuery] = useState('')
  const [cerradoManualmente, setCerradoManualmente] = useState(false)

  const queryRecortada = query.trim()
  const resultados = useMemo(() => buscarEscuelas(escuelas, query, 8), [escuelas, query])
  const abierto = queryRecortada.length >= 2 && !cerradoManualmente

  function seleccionar(item: T | null) {
    if (!item) return
    onSeleccionar(item)
  }

  return (
    <div className="map-filtro-campo mapa-buscador-escuela">
      <span className="map-filtro-label">Buscar escuela</span>
      <Combobox.Root<T>
        items={resultados}
        itemToStringLabel={(item) => item.nombre}
        filter={null}
        // Input controlado: al seleccionar, el combobox rellena el input con el
        // label del item (fillInputOnItemPress); como el query vive en este
        // estado, vaciarlo en 'item-press' limpia de verdad el campo.
        inputValue={query}
        open={abierto}
        onOpenChange={(next) => {
          if (!next) setCerradoManualmente(true)
        }}
        onValueChange={seleccionar}
        onInputValueChange={(next, eventDetails) => {
          // El combobox por defecto rellena el input con el nombre elegido al
          // seleccionar (fillInputOnItemPress): acá se descarta ese relleno y
          // se limpia la búsqueda (seleccionar vacía el campo).
          if (eventDetails.reason === 'item-press') {
            setQuery('')
            // El relleno se dispara dos veces: primero con 'item-press' (el
            // evento real de selección) y después con 'none' (sync del label
            // seleccionado). Ignorar 'none' evita que repueble el input que
            // acabamos de vaciar.
          } else if (eventDetails.reason !== 'none') {
            setQuery(next)
          }
          setCerradoManualmente(false)
        }}
      >
        <Combobox.Input
          className="ui-input map-filtro-input"
          placeholder={placeholder}
          aria-label="Buscar escuela por nombre, CUE-anexo, localidad o departamento"
        />
        <Combobox.Portal>
          <Combobox.Positioner className="mapa-buscador-escuela-positioner" sideOffset={6} align="start">
            <Combobox.Popup className="mapa-buscador-escuela-popup">
              <Combobox.Empty className="mapa-buscador-escuela-vacio">
                {queryRecortada.length >= 2 ? `Sin resultados para "${queryRecortada}"` : null}
              </Combobox.Empty>
              <Combobox.List className="mapa-buscador-escuela-lista">
                {(item: T) => (
                  <Combobox.Item
                    key={item.cueAnexo}
                    value={item}
                    className="mapa-buscador-escuela-item"
                  >
                    <span className="mapa-buscador-escuela-nombre">
                      {resaltarCoincidencia(item.nombre, queryRecortada)}
                    </span>
                    <span className="mapa-buscador-escuela-meta">
                      {resaltarCoincidencia(item.cueAnexo, queryRecortada)} · {item.localidad} ·{' '}
                      {item.departamento}
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
