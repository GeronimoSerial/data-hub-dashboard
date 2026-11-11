// Cuenta alumnos distintos entre varias afectaciones de una misma escuela.
// Misma clave que el dedupe a nivel parte de parte-mapa: `ge:<id>` para los
// alumnos de `secciones[].alumnos` y `mat:<id>` para los de `carreras[].alumnos`
// (ids de persona GE y de matrícula son espacios distintos).
// Una afectación sin ids de alumno no se puede deduplicar: suma su total.

interface AfectacionConAlumnos {
  secciones?: { alumnos: number[] }[]
  carreras?: { alumnos: number[] }[]
  totales: { alumnos: number }
}

export function contarAlumnosUnicos(afectaciones: AfectacionConAlumnos[]): number {
  const distintos = new Set<string>()
  let sinIds = 0
  for (const afectacion of afectaciones) {
    const ids = [
      ...(afectacion.secciones ?? []).flatMap((s) => s.alumnos.map((id) => `ge:${id}`)),
      ...(afectacion.carreras ?? []).flatMap((c) => c.alumnos.map((id) => `mat:${id}`)),
    ]
    if (ids.length === 0) {
      sinIds += afectacion.totales.alumnos
      continue
    }
    for (const id of ids) distintos.add(id)
  }
  return distintos.size + sinIds
}
