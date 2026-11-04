import { calcularVariacion, type DatosNatalidad } from './natalidad'
import { normalizarNombreDepartamento } from './normalizar-departamento'
import { ANIOS_RENAPER, extraerSerieRenaper, type construirSnapshotRenaper } from './renaper-natalidad'

type DatosRenaper = ReturnType<typeof construirSnapshotRenaper>

export function construirDatosNatalidadRenaper(base: DatosNatalidad, renaper: DatosRenaper): DatosNatalidad {
  const series = new Map<string, Record<string, number>>()
  const validar = (serie: Record<string, number>) => extraerSerieRenaper([
    { data: Object.entries(serie).map(([x, y]) => ({ x: Number(x), y })) },
  ])
  for (const departamento of Object.values(renaper.departamentos)) {
    const clave = normalizarNombreDepartamento(departamento.nombre)
    if (series.has(clave)) throw new Error(`Departamento RENAPER duplicado: ${clave}`)
    series.set(clave, validar(departamento.serie))
  }
  if (series.size !== 25 || base.departamentos.length !== 25 ||
      new Set(base.departamentos.map((d) => d.clave)).size !== 25) {
    throw new Error('Se requieren los 25 departamentos de Corrientes')
  }
  const inicio = ANIOS_RENAPER[0]
  const fin = ANIOS_RENAPER[ANIOS_RENAPER.length - 1]
  const provincia = validar(renaper.provincia.serie)
  return {
    ...base,
    meta: { ...base.meta, fuenteNatalidad: renaper.meta.fuente, anios: [...ANIOS_RENAPER],
      anioInicio: inicio, anioFin: fin, extraidoEn: renaper.meta.extraidoEn },
    provincia: { serie: provincia, variacion: calcularVariacion(provincia, inicio, fin) },
    departamentos: base.departamentos.map((departamento) => {
      const serie = series.get(departamento.clave)
      if (!serie) throw new Error(`Sin datos RENAPER para ${departamento.nombre}`)
      return { ...departamento, serie, variacion: calcularVariacion(serie, inicio, fin) }
    }),
  }
}

export function etiquetaNacimientos(datos: DatosNatalidad): string {
  return datos.meta.fuenteNatalidad.nombre.startsWith('RENAPER') ? 'Nacimientos identificados' : 'Nacidos vivos'
}
