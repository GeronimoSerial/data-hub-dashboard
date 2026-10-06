export function cantidadFiltrosEnLinea(entrada: {
  anchos: readonly number[]
  anchoDisponible: number
  anchoBotonMas: number
  separacion: number
}): number {
  const { anchos, anchoDisponible, anchoBotonMas, separacion } = entrada

  if (
    anchos.length === 0 ||
    !Number.isFinite(anchoDisponible) || anchoDisponible <= 0 ||
    !Number.isFinite(anchoBotonMas) || anchoBotonMas < 0 ||
    !Number.isFinite(separacion) || separacion < 0 ||
    anchos.some((ancho) => !Number.isFinite(ancho) || ancho < 0)
  ) {
    return 0
  }

  const anchoTotalSinBoton = anchos.reduce((total, ancho) => total + ancho, 0) + separacion * (anchos.length - 1)
  if (anchoTotalSinBoton <= anchoDisponible) return anchos.length

  let anchoFiltros = 0
  for (let cantidad = 1; cantidad < anchos.length; cantidad += 1) {
    anchoFiltros += anchos[cantidad - 1]
    const anchoConBoton = anchoFiltros + separacion * cantidad + anchoBotonMas
    if (anchoConBoton > anchoDisponible) return cantidad - 1
  }

  return anchos.length - 1
}
