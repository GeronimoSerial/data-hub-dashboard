'use client'

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { FORMATOS, type BadgeColor, type Categoria, type Formato, type Nivel, type Tag as TagModel, type Tipo } from '@/lib/model'
import { useHubData } from '@/components/hub-data'
import { Button } from '@/components/ui/button'
import { ConfirmDelete } from '@/components/confirm-delete'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogContent, DialogTitle } from '@/components/ui/dialog'
import { COLORS, slugId, AdminField, FormDialog, useEditorDialog, SelectField, BotonEditar, DialogActions } from '@/components/admin/shared'

interface TaxonomyField {
  key: string
  label: string
  type: 'text' | 'number' | 'color' | 'formatos'
  hint?: string
}

function TaxonomyDialog({
  open,
  onClose,
  title,
  fields,
  initial,
  onSave,
}: {
  open: boolean
  onClose: () => void
  title: string
  fields: TaxonomyField[]
  initial: Record<string, unknown>
  onSave: (values: Record<string, unknown>) => void
}) {
  return (
    <FormDialog open={open} onClose={onClose}>
      <TaxonomyForm
        key={title}
        title={title}
        fields={fields}
        initial={initial}
        onSave={onSave}
        onClose={onClose}
      />
    </FormDialog>
  )
}

function TaxonomyForm({
  onClose,
  title,
  fields,
  initial,
  onSave,
}: {
  onClose: () => void
  title: string
  fields: TaxonomyField[]
  initial: Record<string, unknown>
  onSave: (values: Record<string, unknown>) => void
}) {
  const [values, setValues] = React.useState<Record<string, unknown>>(initial)

  const set = (k: string, v: unknown) =>
    setValues((prev) => ({ ...prev, [k]: v }))

  const nombreOk =
    typeof values.nombre === 'string' && values.nombre.trim().length > 0

  return (
    <DialogContent>
      <DialogTitle className="admin-form__title">{title}</DialogTitle>
        <div className="ui-form-grid">
          {fields.map((f) => {
            if (f.type === 'color') {
              const current = (values[f.key] as BadgeColor) ?? 'brand'
              return (
                <SelectField
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  value={current}
                  options={COLORS.map((c) => ({ value: c, label: c }))}
                  onChange={(value) => set(f.key, value)}
                />
              )
            }
            if (f.type === 'formatos') {
              const current = (values[f.key] as Formato[]) ?? []
              return (
                <AdminField key={f.key} label={f.label} hint={f.hint}>
                  <div className="ui-actions">
                    {(Object.keys(FORMATOS) as Formato[]).map((fmt) => (
                      <Checkbox
                        key={fmt}
                        label={FORMATOS[fmt].label}
                        checked={current.includes(fmt)}
                        onCheckedChange={(checked) =>
                          set(
                            f.key,
                            checked
                              ? [...current, fmt]
                              : current.filter((x) => x !== fmt),
                          )
                        }
                      />
                    ))}
                  </div>
                </AdminField>
              )
            }
            return (
              <AdminField
                key={f.key}
                label={f.label}
                hint={f.hint}
                required={f.key === 'nombre'}
              >
                <Input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={String(values[f.key] ?? '')}
                  onChange={(event) =>
                    set(
                      f.key,
                      f.type === 'number' ? Number(event.currentTarget.value) : event.currentTarget.value,
                    )
                  }
                />
              </AdminField>
            )
          })}
        </div>
        <DialogActions
          onClose={onClose}
          onSave={() => {
            onSave(values)
            onClose()
          }}
          disabled={!nombreOk}
        />
</DialogContent>
    )
  }

// ── Taxonomy table wrapper ─────────────────────────────────────────────────

export function TaxonomyAdmin<T extends { id: string }>({
  items,
  columns,
  fields,
  emptyValues,
  onSave,
  onDelete,
  singular,
  inUse,
}: {
  items: T[]
  columns: { header: string; render: (item: T) => React.ReactNode }[]
  fields: TaxonomyField[]
  emptyValues: Record<string, unknown>
  onSave: (values: Record<string, unknown>, editing: T | null) => void
  onDelete: (id: string) => void
  singular: string
  inUse: (id: string) => number
}) {
  const { open, editing, nuevo, editar, onClose } = useEditorDialog<T>()

  return (
    <div>
      <div className="ui-toolbar">
        <span className="ui-hint">
          {items.length} {items.length === 1 ? singular : `${singular}s`}
        </span>
        <Button onClick={nuevo}><Plus size={16} /> Agregar {singular}</Button>
      </div>

      <div className="ui-table-wrap">
        <table className="ui-table" aria-label={`Administración de ${singular}`}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.header}>{c.header}</th>
              ))}
              <th>En uso</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const uses = inUse(item.id)
              return (
                <tr key={item.id}>
                  {columns.map((c) => (
                    <td key={c.header}>{c.render(item)}</td>
                  ))}
                  <td>
                    <span className={uses ? 'badge' : 'badge badge--neutral'}>
                      {uses} {uses === 1 ? 'recurso' : 'recursos'}
                    </span>
                  </td>
                  <td>
                    <div className="ui-actions">
                      <BotonEditar onClick={() => editar(item)} />
                      <ConfirmDelete
                        title={`¿Eliminar ${singular}?`}
                        description={
                          uses
                            ? `No se puede eliminar: hay ${uses} recurso${uses === 1 ? '' : 's'} asociados.`
                            : `La ${singular} se eliminará de forma permanente.`
                        }
                        onConfirm={() => onDelete(item.id)}
                        triggerLabel={`Eliminar ${singular}`}
                        disabled={uses > 0}
                        trigger={
                          uses > 0 ? (
                            <Button variant="ghost" size="icon" aria-label={`Eliminar ${singular}`} disabled title="No se puede eliminar: hay recursos asociados">
                              <Trash2 size={16} />
                            </Button>
                          ) : undefined
                        }
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <TaxonomyDialog
        open={open}
        onClose={onClose}
        title={editing ? `Editar ${singular}` : `Nuevo ${singular}`}
        fields={fields}
        initial={
          editing
            ? (editing as unknown as Record<string, unknown>)
            : emptyValues
        }
        onSave={(values) => onSave(values, editing)}
      />
    </div>
  )
}

// ── Direcciones GE (solo lectura) ──────────────────────────────────────────


// ── Taxonomy sections ──────────────────────────────────────────────────────

export function CategoriasAdmin() {
  const { recursos, categorias, upsertCategoria, removeCategoria } = useHubData()
  const usoCategoria = (id: string) => recursos.filter((r) => r.categoriaId === id).length
  return (
    <TaxonomyAdmin<Categoria>
      singular="categoría"
      items={categorias}
      inUse={usoCategoria}
      columns={[
        {
          header: 'Categoría',
          render: (c) => (
            <span className="badge badge--neutral">{c.nombre}</span>
          ),
        },
        { header: 'Color', render: (c) => c.color },
      ]}
      fields={[
        { key: 'nombre', label: 'Nombre', type: 'text' },
        {
          key: 'color',
          label: 'Color del TAG',
          type: 'color',
          hint: 'Se usa en el badge visible del recurso',
        },
      ]}
      emptyValues={{ nombre: '', color: 'brand' }}
      onSave={(v, editing) =>
        upsertCategoria({
          id: editing?.id ?? slugId(String(v.nombre)),
          nombre: String(v.nombre),
          color: (v.color as BadgeColor) ?? 'brand',
        })
      }
      onDelete={removeCategoria}
    />
  )
}

export function EtiquetasAdmin() {
  const { recursos, tags, upsertTag, removeTag } = useHubData()
  const usoTag = (id: string) => recursos.filter((r) => r.tagIds.includes(id)).length
  return (
    <TaxonomyAdmin<TagModel>
      singular="etiqueta"
      items={tags}
      inUse={usoTag}
      columns={[
        {
          header: 'Etiqueta',
          render: (t) => (
            <span className="badge badge--neutral">{t.nombre}</span>
          ),
        },
      ]}
      fields={[{ key: 'nombre', label: 'Nombre', type: 'text' }]}
      emptyValues={{ nombre: '' }}
      onSave={(v, editing) =>
        upsertTag({
          id: editing?.id ?? slugId(String(v.nombre)),
          nombre: String(v.nombre),
        })
      }
      onDelete={removeTag}
    />
  )
}

export function NivelesAdmin() {
  const { recursos, niveles, upsertNivel, removeNivel } = useHubData()
  const usoNivel = (id: string) => recursos.filter((r) => r.nivelId === id).length
  return (
    <TaxonomyAdmin<Nivel>
      singular="nivel"
      items={[...niveles].sort((a, b) => a.orden - b.orden)}
      inUse={usoNivel}
      columns={[
        { header: 'Nivel', render: (n) => n.nombre },
        { header: 'Orden', render: (n) => n.orden },
      ]}
      fields={[
        { key: 'nombre', label: 'Nombre', type: 'text' },
        { key: 'orden', label: 'Orden', type: 'number' },
      ]}
      emptyValues={{ nombre: '', orden: niveles.length + 1 }}
      onSave={(v, editing) =>
        upsertNivel({
          id: editing?.id ?? slugId(String(v.nombre)),
          nombre: String(v.nombre),
          orden: Number(v.orden) || niveles.length + 1,
        })
      }
      onDelete={removeNivel}
    />
  )
}

export function TiposAdmin() {
  const { recursos, tipos, upsertTipo, removeTipo } = useHubData()
  const usoTipo = (id: string) => recursos.filter((r) => r.tipoId === id).length
  return (
    <TaxonomyAdmin<Tipo>
      singular="tipo"
      items={tipos}
      inUse={usoTipo}
      columns={[
        { header: 'Tipo', render: (t) => t.nombre },
        {
          header: 'Aplica a',
          render: (t) => (
            <div className="ui-actions">
              {t.aplicaA.map((f) => (
                <span key={f} className="badge badge--neutral">
                  {FORMATOS[f].label}
                </span>
              ))}
            </div>
          ),
        },
      ]}
      fields={[
        { key: 'nombre', label: 'Nombre', type: 'text' },
        {
          key: 'aplicaA',
          label: 'Aplica a',
          type: 'formatos',
          hint: 'Tipos de contenido que pueden usar este tipo',
        },
      ]}
      emptyValues={{ nombre: '', aplicaA: ['reporte'] }}
      onSave={(v, editing) =>
        upsertTipo({
          id: editing?.id ?? slugId(String(v.nombre)),
          nombre: String(v.nombre),
          aplicaA:
            (v.aplicaA as Formato[])?.length > 0
              ? (v.aplicaA as Formato[])
              : ['reporte'],
        })
      }
      onDelete={removeTipo}
    />
  )
}
