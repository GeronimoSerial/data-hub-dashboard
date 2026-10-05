/** Indica si terminó de cargarse un estilo distinto al último aplicado. */
export function cambioEstiloCargado(
  estiloAnterior: string | null,
  estiloActual: string,
  estiloCargado: boolean,
): boolean {
  return estiloCargado && estiloAnterior !== null && estiloAnterior !== estiloActual
}
