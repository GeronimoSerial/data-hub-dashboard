'use client'

import { nivelesJurisdiccionales } from '@/lib/model'
import { AdminListToolbar } from '@/components/admin/shared'

export function DireccionesGeCatalogo() {
  return (
    <div>
      <AdminListToolbar total={nivelesJurisdiccionales.length} singular="dirección" plural="direcciones" action={<span className="ui-hint">Se sincroniza desde Gestión Educativa</span>} />
      <div className="ui-table-wrap">
        <table className="ui-table" aria-label="Direcciones de Gestión Educativa">
          <thead>
            <tr>
              <th>Dirección</th>
              <th>Código GE</th>
            </tr>
          </thead>
          <tbody>
            {nivelesJurisdiccionales.map((n) => (
              <tr key={n.id}>
                <td>{n.nombre}</td>
                <td data-label="Código GE" className="admin-cell-mono">{n.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Users (admin only) ─────────────────────────────────────────────────────

