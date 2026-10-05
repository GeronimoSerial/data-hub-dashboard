export function colapsarAtribucion(contenedor: ParentNode): void {
  const control = contenedor.querySelector('.maplibregl-ctrl-attrib')
  control?.removeAttribute('open')
  control?.classList.remove('maplibregl-compact-show')
}
