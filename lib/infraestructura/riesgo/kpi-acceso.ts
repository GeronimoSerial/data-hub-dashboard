// KPI "matrícula potencialmente condicionada por acceso". Función PURA: no
// toca DB ni red. El acceso es una dimensión SEPARADA del estado del edificio,
// así que este agregado NUNCA se suma con la afectación confirmada: una misma
// escuela puede aparecer en ambos universos, y contar su matrícula dos veces
// (una por daño confirmado y otra por acceso en riesgo) infla el total. La
// deduplicación es por `cueAnexo`: se excluyen del conteo las escuelas que ya
// entran al KPI de afectación confirmada existente.

export interface SnapshotAccesoKpi {
  cueAnexo: string
  nivelRiesgoAcceso: string | null
  exposicionMatricula: number | null
}

export interface ResultadoMatriculaCondicionadaPorAcceso {
  // Cantidad de escuelas efectivamente sumadas (alto riesgo de acceso y NO
  // ya contadas en afectación confirmada).
  escuelas: number
  // Suma de `exposicionMatricula`; un `null` se trata como 0 sin descartar la
  // escuela del conteo de `escuelas`.
  matricula: number
}

export function calcularMatriculaCondicionadaPorAcceso(params: {
  snapshots: Array<SnapshotAccesoKpi>
  cuesConAfectacionConfirmada: ReadonlySet<string>
}): ResultadoMatriculaCondicionadaPorAcceso {
  const { snapshots, cuesConAfectacionConfirmada } = params

  let escuelas = 0
  let matricula = 0

  for (const snapshot of snapshots) {
    if (snapshot.nivelRiesgoAcceso !== 'alto') continue
    if (cuesConAfectacionConfirmada.has(snapshot.cueAnexo)) continue
    escuelas += 1
    matricula += snapshot.exposicionMatricula ?? 0
  }

  return { escuelas, matricula }
}
