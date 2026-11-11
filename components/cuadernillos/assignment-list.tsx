import type { BookletAssignmentView } from '@/lib/cuadernillos/types'

export function AssignmentList({ items }: { items: BookletAssignmentView[] }) {
  if (items.length === 0) {
    return <p style={{ margin: '1rem 0 0', color: 'var(--ink-soft)' }}>Todavía no hay escuelas asignadas a esta cuenta.</p>
  }

  return (
    <ul style={{ listStyle: 'none', margin: '1rem 0 0', padding: 0, borderTop: '1px solid var(--line)' }}>
      {items.map((item) => (
        <li key={item.cueAnexo} style={{ display: 'grid', gap: '.4rem', padding: '1rem 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '.5rem 1.5rem' }}>
            <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 600, color: 'var(--ink)' }}>
              {item.schoolName}
            </strong>
            <span style={{ color: 'var(--ink-soft)', fontSize: '.875rem' }}>
              {item.relationship === 'cabecera' ? 'Escuela cabecera' : 'Escuela dependiente'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem 1.25rem', color: 'var(--ink-faint)', fontSize: '.8125rem' }}>
            <span>CUE-anexo: {item.cueAnexo}</span>
            {item.cabeceraCueAnexo ? <span>Cabecera: {item.cabeceraCueAnexo}</span> : null}
            {item.supervisorName ? <span>Supervisor de referencia: {item.supervisorName}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
