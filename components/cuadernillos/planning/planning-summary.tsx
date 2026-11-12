import type { BookletBalanceView, BookletRequestSummary } from '@/lib/cuadernillos/types'

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString()
}

export function PlanningSummary({ balances, requests }: { balances: BookletBalanceView[]; requests: BookletRequestSummary[] }) {
  const products = [...new Map(balances.map((row) => [row.productId, row])).values()]
  const pending = requests.filter((request) => request.status === 'pending').length
  const approvedToday = requests.filter((request) => request.status === 'approved' && request.approvedAt && isToday(request.approvedAt)).length

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <section aria-labelledby="stock-summary-title">
        <h3 id="stock-summary-title" style={sectionTitle}>Stock global</h3>
        <ul style={{ listStyle: 'none', margin: '.75rem 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))', gap: '.75rem' }}>
          {products.map((row) => (
            <li key={row.productId} style={{ border: '1px solid var(--line)', borderRadius: '.5rem', padding: '.75rem 1rem' }}>
              <span style={{ display: 'block', color: 'var(--ink-soft)', fontSize: '.9rem' }}>{row.productLabel}</span>
              <strong style={{ fontSize: '1.5rem', color: 'var(--ink)' }}>{row.globalAvailable ?? 'No disponible'}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="requests-summary-title">
        <h3 id="requests-summary-title" style={sectionTitle}>Solicitudes</h3>
        <dl style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', margin: '.75rem 0 0' }}>
          <div>
            <dt style={{ color: 'var(--ink-soft)', fontSize: '.9rem' }}>Pendientes</dt>
            <dd style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{pending}</dd>
          </div>
          <div>
            <dt style={{ color: 'var(--ink-soft)', fontSize: '.9rem' }}>Aprobadas hoy</dt>
            <dd style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{approvedToday}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="quota-summary-title">
        <h3 id="quota-summary-title" style={sectionTitle}>Cupos por cabecera</h3>
        <div style={{ overflowX: 'auto', marginTop: '.75rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <caption style={{ textAlign: 'left', padding: '0 0 .5rem', color: 'var(--ink-soft)', fontSize: '.9rem' }}>
              Cupo disponible restante, no el total asignado.
            </caption>
            <thead>
              <tr>
                <th scope="col" style={cell}>Producto</th>
                <th scope="col" style={cell}>Cabecera</th>
                <th scope="col" style={cell}>Cupo</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((row) => (
                <tr key={`${row.productId}:${row.cabeceraCueAnexo ?? 'no-head'}`}>
                  <th scope="row" style={cell}>{row.productLabel}</th>
                  <td style={cell}>{row.cabeceraName ? `${row.cabeceraName} · ${row.cabeceraCueAnexo}` : 'Sin cabeceras confirmadas'}</td>
                  <td style={cell}>{row.quotaAvailable ?? 'No disponible'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

const sectionTitle = { margin: 0, color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: '1.15rem' } as const
const cell = { padding: '.5rem .6rem', borderBottom: '1px solid var(--line)', verticalAlign: 'top' } as const
