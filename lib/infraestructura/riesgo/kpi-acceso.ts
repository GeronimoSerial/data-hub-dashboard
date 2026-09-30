// KPI "matrícula potencialmente condicionada por acceso". Función PURA: no
// toca DB ni red. El acceso es una dimensión SEPARADA del estado del edificio,
// así que este agregado NUNCA se suma con la afectación confirmada: una misma
// escuela puede aparecer en ambos universos, y contar su matrícula dos veces
// (una por daño confirmado y otra por acceso en riesgo) infla el total. La
// deduplicación es por `cueAnexo`: se excluyen del conteo las escuelas que ya
// entran al KPI de afectación confirmada existente. Además, ahora también se
// deduplica por `cueAnexo` DENTRO de `snapshots` (varias filas de horizontes
// distintos para la misma escuela cuentan como una sola), con criterio de
// 'peor caso': si alguna fila es 'alto', esa escuela cuenta como 'alto'.

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

  // El acceso no depende del horizonte (mismo aislamiento OSM en los 3 cortes
  // 24/72/240h), pero el caller puede pasar hasta una fila por horizonte sin
  // filtrar. Se deduplica por cueAnexo ANTES de agregar: si alguna fila de esa
  // escuela es 'alto', se la representa con esa fila (peor caso); si ninguna
  // lo es, la fila elegida es indistinta porque no entra al conteo igual.
  const porCue = new Map<string, SnapshotAccesoKpi>()
  for (const snapshot of snapshots) {
    const actual = porCue.get(snapshot.cueAnexo)
    if (actual === undefined || (actual.nivelRiesgoAcceso !== 'alto' && snapshot.nivelRiesgoAcceso === 'alto')) {
      porCue.set(snapshot.cueAnexo, snapshot)
    }
  }

  let escuelas = 0
  let matricula = 0

  for (const snapshot of porCue.values()) {
    if (snapshot.nivelRiesgoAcceso !== 'alto') continue
    if (cuesConAfectacionConfirmada.has(snapshot.cueAnexo)) continue
    escuelas += 1
    matricula += snapshot.exposicionMatricula ?? 0
  }

  return { escuelas, matricula }
}
