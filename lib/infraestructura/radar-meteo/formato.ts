const formatoLluviaMm = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const formatoVientoKmh = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 0,
})

export function formatearLluviaMm(valor: number | null | undefined): string {
  return valor == null ? '—' : `${formatoLluviaMm.format(valor)} mm`
}

export function formatearVientoKmh(valor: number | null | undefined): string {
  return valor == null ? '—' : `${formatoVientoKmh.format(valor)} km/h`
}
