'use client'

import type { MotivoRow } from '@/lib/infraestructura/motivos'
import * as React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDelete } from '@/components/confirm-delete'
import { Input } from '@/components/ui/input'
import { DialogContent, DialogTitle } from '@/components/ui/dialog'
import { CATEGORIAS, CATEGORIA_META, type CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { slugId, AdminField, FormDialog, useEditorDialog, useListaRemota, SelectField, leerErrorApi, BotonEditar, DialogActions, AdminListToolbar, AdminEmptyRow, useBusqueda, filaEditable } from '@/components/admin/shared'

function MotivoDialog({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  editing: MotivoRow | null
  onSaved: () => Promise<void>
}) {
  return (
    <FormDialog open={open} onClose={onClose}>
      <MotivoForm key={editing?.id ?? 'nuevo'} editing={editing} onClose={onClose} onSaved={onSaved} />
    </FormDialog>
  )
}

function MotivoForm({
  onClose,
  editing,
  onSaved,
}: {
  onClose: () => void
  editing: MotivoRow | null
  onSaved: () => Promise<void>
}) {
  const [nombre, setNombre] = React.useState(editing?.nombre ?? '')
  const [categoria, setCategoria] = React.useState<CategoriaAfectacion>(
    editing?.categoria ?? CATEGORIAS[0],
  )
  const [orden, setOrden] = React.useState(editing?.orden ?? 0)
  const [severidadSugerida, setSeveridadSugerida] = React.useState(
    editing?.severidadSugerida ?? 'ninguna',
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const valido = nombre.trim().length > 0

  const guardar = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/infraestructura/motivos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing?.id ?? slugId(nombre),
          nombre,
          categoria,
          orden,
          severidadSugerida: severidadSugerida === 'ninguna' ? null : severidadSugerida,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null
        setError(leerErrorApi(data, 'No se pudo guardar'))
        return
      }
      await onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="admin-sheet">
      <DialogTitle className="admin-form__title">{editing ? 'Editar motivo' : 'Nuevo motivo'}</DialogTitle>
      <div className="ui-form-grid">
        {error ? (
          <div className="ui-messagebar ui-messagebar--error" role="alert">
            {error}
          </div>
        ) : null}
        <AdminField label="Nombre" required>
          <Input value={nombre} onChange={(event) => setNombre(event.currentTarget.value)} />
        </AdminField>
        <SelectField
          label="Categoría"
          required
          value={categoria}
          options={CATEGORIAS.map((c) => ({ value: c, label: CATEGORIA_META[c].label }))}
          onChange={(value) => setCategoria(value as CategoriaAfectacion)}
        />
        <SelectField
          label="Gravedad sugerida"
          value={severidadSugerida}
          options={[
            { value: 'ninguna', label: 'Sin sugerido' },
            ...SEVERIDADES.map((severidad) => ({ value: severidad, label: severidad })),
          ]}
          onChange={setSeveridadSugerida}
        />
        <AdminField label="Orden" hint="Define el orden dentro de su categoría">
          <Input
            type="number"
            value={String(orden)}
            onChange={(event) => setOrden(Number(event.currentTarget.value) || 0)}
          />
        </AdminField>
      </div>
      <DialogActions onClose={onClose} onSave={() => void guardar()} disabled={!valido || saving} />
    </DialogContent>
  )
}

export function MotivosAdmin() {
  const {
    items: motivos,
    loadError,
    setLoadError,
    reload,
  } = useListaRemota<MotivoRow>({
    url: '/api/infraestructura/motivos',
    clave: 'motivos',
    fallbackError: 'No se pudo cargar',
  })
  const { open, editing, nuevo, editar, onClose } = useEditorDialog<MotivoRow>()

  const eliminar = async (id: string) => {
    const res = await fetch(`/api/infraestructura/motivos?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: unknown } | null
      setLoadError(leerErrorApi(data, 'No se pudo eliminar'))
      return
    }
    await reload()
  }

  const { query, setQuery, filtrados } = useBusqueda(motivos, (m) => [m.nombre, CATEGORIA_META[m.categoria]?.label ?? m.categoria])

  return (
    <div className="admin-motivos">
      <AdminListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Buscar motivo o categoría"
        total={motivos.length}
        visibles={filtrados.length}
        singular="motivo"
        plural="motivos"
        action={<Button onClick={nuevo}><Plus size={16} /> Agregar motivo</Button>}
      />

      {loadError ? (
        <div className="ui-messagebar ui-messagebar--error" role="alert">
          {loadError}
        </div>
      ) : null}

      <div className="ui-table-wrap admin-motivos__table-wrap" data-testid="admin-motivos-table-wrap">
        <table className="ui-table" aria-label="Administración de motivos">
          <colgroup>
            <col className="admin-motivos__col-nombre" />
            <col className="admin-motivos__col-gravedad" />
            <col className="admin-motivos__col-orden" />
            <col className="admin-motivos__col-acciones" />
          </colgroup>
          <thead>
            <tr>
              <th>Motivo</th>
              <th>Gravedad sugerida</th>
              <th>Orden</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((m) => (
              <tr key={m.id} {...filaEditable(() => editar(m))}>
                <td className="admin-motivos__nombre">
                  <div className="admin-motivos__nombre-contenido">
                    <span className="admin-motivos__nombre-texto">{m.nombre}</span>
                    <span className="admin-motivos__categoria">
                      {CATEGORIA_META[m.categoria]?.label ?? m.categoria}
                    </span>
                  </div>
                </td>
                <td data-label="Gravedad sugerida">{m.severidadSugerida ?? '—'}</td>
                <td data-label="Orden">{m.orden}</td>
                <td>
                  <div className="ui-actions admin-motivos__acciones">
                    <BotonEditar onClick={() => editar(m)} />
                    <ConfirmDelete
                      title="¿Eliminar motivo?"
                      description="El motivo se eliminará de forma permanente. Si hay afectaciones que lo usan, no se podrá eliminar."
                      onConfirm={() => void eliminar(m.id)}
                      triggerLabel="Eliminar motivo"
                    />
                  </div>
                </td>
              </tr>
            ))}
            {motivos.length > 0 && filtrados.length === 0 ? (
              <AdminEmptyRow colSpan={4}>Ningún motivo coincide con «{query}».</AdminEmptyRow>
            ) : null}
          </tbody>
        </table>
      </div>

      <MotivoDialog open={open} onClose={onClose} editing={editing} onSaved={reload} />
    </div>
  )
}

// ── Admin page ─────────────────────────────────────────────────────────────

// `role` comes from the server session so SSR and the first client render
// agree on which tabs exist (a client-side session hook is empty during SSR).
