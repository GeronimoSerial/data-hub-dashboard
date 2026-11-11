import Link from 'next/link'

export type LlamadaFicha = {
  id: string
  callerNombre: string
  justificacion: string
  respuestaDirector: string
  creadaEn: string
}

const MAXIMO_VISIBLES = 5

function formatearFecha(valor: string): string {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor
  return fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export function LlamadasFicha({ llamadas }: { llamadas: LlamadaFicha[] }) {
  const visibles = llamadas.slice(0, MAXIMO_VISIBLES)
  const ocultas = llamadas.length - visibles.length
  return (
    <section
      aria-labelledby="titulo-llamadas"
      data-testid="seccion-llamadas"
      style={{ display: 'grid', gap: 'var(--s-3)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--s-3)' }}>
        <h3 id="titulo-llamadas" style={{ margin: 0, fontSize: 'var(--t-h3)' }}>
          Llamadas del call center
        </h3>
        <Link href="/call-center" className="admin-link">
          Ir al call center
        </Link>
      </div>
      {visibles.length === 0 ? (
        <p className="ui-hint">Todavía no hay llamadas registradas para esta escuela.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-3)' }}>
          {visibles.map((llamada) => (
            <li
              key={llamada.id}
              style={{ display: 'grid', gap: 'var(--s-1)', paddingBottom: 'var(--s-3)', borderBottom: '1px solid var(--line)' }}
            >
              <p className="ui-hint" style={{ margin: 0 }}>
                {formatearFecha(llamada.creadaEn)} · {llamada.callerNombre}
              </p>
              <p style={{ margin: 0, fontSize: 'var(--t-small)' }}>
                <span style={{ fontWeight: 600 }}>Motivo: </span>
                {llamada.justificacion}
              </p>
              <p style={{ margin: 0, fontSize: 'var(--t-small)' }}>
                <span style={{ fontWeight: 600 }}>Director: </span>
                {llamada.respuestaDirector}
              </p>
            </li>
          ))}
        </ul>
      )}
      {ocultas > 0 && (
        <p className="ui-hint">
          {ocultas === 1 ? 'Hay 1 llamada anterior más.' : `Hay ${ocultas} llamadas anteriores más.`}
        </p>
      )}
    </section>
  )
}
