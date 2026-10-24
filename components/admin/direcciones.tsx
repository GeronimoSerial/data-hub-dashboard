'use client'

import { nivelesJurisdiccionales } from '@/lib/model'

export function DireccionesGeCatalogo() {
  return (
    <div>
      <div className="ui-toolbar">
        <span className="ui-hint">Se sincroniza desde Gestión Educativa</span>
      </div>
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
                <td>{n.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Users (admin only) ─────────────────────────────────────────────────────

