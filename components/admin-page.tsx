'use client'

import * as React from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  FORMATOS,
  type BadgeColor,
  type Categoria,
  type Formato,
  type Nivel,
  type Recurso,
  type Tag as TagModel,
  type Tipo,
  categoria as findCategoria,
  formatearFecha,
  nivelNombre,
  tipoNombre,
} from '@/lib/model'
import { useHubData } from '@/components/hub-data'
import { authClient } from '@/lib/auth-client'
import type { Role } from '@/lib/acl'
import { isAllowedUpload } from '@/lib/upload'
import { Button } from '@/components/ui/button'
import { ConfirmDelete } from '@/components/confirm-delete'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioItem } from '@/components/ui/radio'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useAdminSection } from '@/components/admin-shell'
import { adminSectionsForRole, type AdminSectionId } from '@/lib/admin-navigation'
import { useDirtyGuard } from '@/lib/dirty-guard'
import { useAdminDialogFocus } from '@/lib/admin-dialog-focus'
import { useAdminPendingAction } from '@/lib/admin-pending'

const COLORS: BadgeColor[] = [
  'brand',
  'success',
  'warning',
  'danger',
  'informative',
  'severe',
  'important',
  'subtle',
]

type HubUserRow = {
  id: string
  name: string
  email: string
  role: Role
  banned: boolean
  nivelIds: string[]
}

const ROLES: Role[] = ['admin', 'editor', 'consulta']

function rolLabel(role: Role) {
  if (role === 'admin') return 'Admin'
  if (role === 'editor') return 'Editor'
  return 'Consulta'
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function slugId(nombre: string) {
  const base = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `${base || 'item'}-${Math.random().toString(36).slice(2, 6)}`
}

type AdminFieldProps = {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  children: React.ReactNode
}

export function AdminPageTabs({
  tab,
  onTab,
  role,
}: {
  tab: AdminSectionId
  onTab: (section: AdminSectionId) => void
  role: Role | undefined
}) {
  const sections = adminSectionsForRole(role ?? 'editor')
  return (
    <Tabs value={tab} onValueChange={(value) => onTab(value as AdminSectionId)}>
      <TabsList>
        {sections.map(({ id, label }) => (
          <TabsTab key={id} value={id}>{label}</TabsTab>
        ))}
      </TabsList>
    </Tabs>
  )
}

function AdminField({ label, hint, error, required, children }: AdminFieldProps) {
  const id = React.useId()
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden>*</span> : null}
      </label>
      <div className="ui-field__control">{children}</div>
      {error ? <span className="ui-field__error" role="alert">{error}</span> : hint ? <span className="ui-field__description">{hint}</span> : null}
    </div>
  )
}

// ── Recurso editor ─────────────────────────────────────────────────────────

function RecursoDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: Recurso | null
}) {
  const closeRequest = React.useRef<() => void>(onClose)
  const registerClose = React.useCallback((request: () => void) => {
    closeRequest.current = request
  }, [])
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeRequest.current()}>
      {open ? (
        <RecursoForm
          key={editing?.id ?? 'nuevo'}
          editing={editing}
          onClose={onClose}
          onRegisterClose={registerClose}
        />
      ) : null}
    </Dialog>
  )
}

function RecursoForm({
  editing,
  onClose,
  onRegisterClose,
}: {
  editing: Recurso | null
  onClose: () => void
  onRegisterClose: (request: () => void) => void
}) {
  const { niveles, tipos, categorias, tags, upsertRecurso, writeError } =
    useHubData()

  const empty: Recurso = {
    id: '',
    titulo: '',
    descripcion: '',
    formato: 'reporte',
    nivelId: niveles[0]?.id ?? '',
    tipoId: '',
    categoriaId: categorias[0]?.id ?? '',
    tagIds: [],
    area: '',
    actualizado: new Date().toISOString().slice(0, 10),
    estado: 'borrador',
    audienciaNivelIds: [],
    audienciaUserIds: [],
  }
  const [initialDraft] = React.useState<Recurso>(() =>
    editing
      ? {
          ...editing,
          audienciaNivelIds: editing.audienciaNivelIds ?? [],
          audienciaUserIds: editing.audienciaUserIds ?? [],
        }
      : empty,
  )
  const [draft, setDraft] = React.useState<Recurso>(initialDraft)
  const [destino, setDestino] = React.useState<'archivo' | 'ruta'>(
    editing?.ruta ? 'ruta' : 'archivo',
  )
  const [pendingFile, setPendingFile] = React.useState<File | null>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)
  const { pending: saving, run: runPending } = useAdminPendingAction()
  const [pickerUsers, setPickerUsers] = React.useState<HubUserRow[]>([])
  const initialDestino = editing?.ruta ? 'ruta' : 'archivo'
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft) || destino !== initialDestino || pendingFile !== null
  const requestClose = useDirtyGuard(dirty, onClose)

  React.useEffect(() => {
    onRegisterClose(requestClose)
  }, [onRegisterClose, requestClose])

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/usuarios')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { usuarios?: HubUserRow[] } | null) => {
        if (cancelled || !data?.usuarios) return
        setPickerUsers(data.usuarios)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Tipos válidos para el formato elegido (consistencia del modelo)
  const tiposValidos = tipos.filter((t) => t.aplicaA.includes(draft.formato))

  const set = <K extends keyof Recurso>(k: K, v: Recurso[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const shownName = pendingFile?.name ?? draft.nombreOriginal
  const shownSize = pendingFile?.size ?? draft.size
  const fileMissing =
    draft.estado === 'publicado' &&
    destino === 'archivo' &&
    !draft.storageKey &&
    !pendingFile
  const rutaMissing =
    draft.estado === 'publicado' &&
    destino === 'ruta' &&
    !draft.ruta?.trim()

  const save = async () => {
    const tipoOk = tiposValidos.some((t) => t.id === draft.tipoId)
    const id = draft.id || slugId(draft.titulo)
    const toSave: Recurso = {
      ...draft,
      id,
      tipoId: tipoOk ? draft.tipoId : (tiposValidos[0]?.id ?? ''),
      actualizado: new Date().toISOString().slice(0, 10),
      audienciaNivelIds: draft.audienciaNivelIds ?? [],
      audienciaUserIds: draft.audienciaUserIds ?? [],
    }
    if (destino === 'ruta') {
      toSave.ruta = draft.ruta?.trim() || undefined
      delete toSave.storageKey
      delete toSave.mime
      delete toSave.nombreOriginal
      delete toSave.size
    } else {
      delete toSave.ruta
    }
    setDraft((d) => ({ ...d, id }))
    await runPending(async () => {
      const ok = await upsertRecurso(
        toSave,
        destino === 'archivo' ? pendingFile : null,
      )
      if (ok) onClose()
    })
  }

  const valido =
    draft.titulo.trim().length > 0 &&
    tiposValidos.length > 0 &&
    draft.categoriaId &&
    !fileMissing &&
    !rutaMissing

  return (
      <DialogContent>
        <DialogTitle>
          {editing ? 'Editar recurso' : 'Nuevo recurso'}
        </DialogTitle>
        <div className="ui-form-grid">
          {writeError ? (
            <div className="ui-messagebar ui-messagebar--error" role="alert">
              {writeError}
            </div>
          ) : null}
          <AdminField label="Título" required>
            <Input
              value={draft.titulo}
              onChange={(event) => set('titulo', event.currentTarget.value)}
              placeholder="Ej.: Boletín de matrícula 2026"
            />
          </AdminField>
          <AdminField label="Descripción">
            <Textarea
              value={draft.descripcion}
              onChange={(event) => set('descripcion', event.currentTarget.value)}
            />
          </AdminField>

          <div className="ui-two-col">
            <AdminField label="Tipo de contenido" required>
              <Select
                value={draft.formato}
                items={Object.fromEntries(
                  (Object.keys(FORMATOS) as Formato[]).map((f) => [f, FORMATOS[f].label]),
                )}
                onValueChange={(value) => {
                  const f = value as Formato
                  const nextTipo = tipos.find((t) => t.aplicaA.includes(f))
                  setDraft((prev) => ({
                    ...prev,
                    formato: f,
                    tipoId: nextTipo?.id ?? '',
                  }))
                }}
              >
                <SelectTrigger aria-label="Tipo de contenido" />
                <SelectContent>
                  {(Object.keys(FORMATOS) as Formato[]).map((f) => (
                    <SelectItem key={f} value={f}>{FORMATOS[f].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminField>

            <AdminField label="Nivel" required>
              <Select
                value={draft.nivelId}
                items={Object.fromEntries([...niveles].sort((a, b) => a.orden - b.orden).map((n) => [n.id, n.nombre]))}
                onValueChange={(value) => set('nivelId', value as string)}
              >
                <SelectTrigger aria-label="Nivel" />
                <SelectContent>
                  {[...niveles]
                    .sort((a, b) => a.orden - b.orden)
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.nombre}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </AdminField>
          </div>

          <div className="ui-two-col">
            <AdminField label="Tipo" hint="Depende del tipo de contenido" required>
              <Select
                value={draft.tipoId}
                items={Object.fromEntries(tiposValidos.map((t) => [t.id, t.nombre]))}
                onValueChange={(value) => set('tipoId', value as string)}
              >
                <SelectTrigger aria-label="Tipo" />
                <SelectContent>
                  {tiposValidos.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminField>

            <AdminField label="Categoría (TAG principal)" required>
              <Select
                value={draft.categoriaId}
                items={Object.fromEntries(categorias.map((c) => [c.id, c.nombre]))}
                onValueChange={(value) => set('categoriaId', value as string)}
              >
                <SelectTrigger aria-label="Categoría" />
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminField>
          </div>

          <AdminField label="Etiquetas">
            <MultiSelect<string>
              value={draft.tagIds}
              onChange={(next) => set('tagIds', next)}
              options={tags.map((t) => ({ value: t.id as string, label: t.nombre }))}
              placeholder="Seleccione etiquetas"
            />
          </AdminField>

          <div className="ui-two-col">
            <AdminField label="Área responsable">
              <Input
                value={draft.area}
                onChange={(event) => set('area', event.currentTarget.value)}
              />
            </AdminField>
            <AdminField label="Estado">
              <Checkbox
                label="Publicado"
                checked={draft.estado === 'publicado'}
                onCheckedChange={(checked) =>
                  set('estado', checked ? 'publicado' : 'borrador')
                }
              />
            </AdminField>
          </div>

          <AdminField label="Origen">
            <RadioGroup value={destino} onValueChange={(value) => setDestino(value === 'ruta' ? 'ruta' : 'archivo')}>
              <RadioItem value="archivo" label="Archivo" />
              <RadioItem value="ruta" label="Ruta interna" />
            </RadioGroup>
          </AdminField>

          {destino === 'archivo' ? (
            <>
              <AdminField
                label="Archivo"
                required={!editing && draft.estado === 'publicado'}
                error={fileError}
              >
                <Input
                  type="file"
                  className="ui-file"
                  aria-label="Seleccionar archivo del recurso"
                  accept=".pdf,.html,.htm,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.docx,application/pdf,text/html,image/png,image/jpeg,image/webp,image/gif,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    if (!file) {
                      setPendingFile(null)
                      setFileError(null)
                      return
                    }
                    const allowed = isAllowedUpload({
                      type: file.type,
                      size: file.size,
                      name: file.name,
                    })
                    if (!allowed.ok) {
                      setPendingFile(null)
                      setFileError(allowed.error)
                      event.currentTarget.value = ''
                      return
                    }
                    setFileError(null)
                    setPendingFile(file)
                  }}
                />
              </AdminField>
              {shownName ? (
                <span className="ui-hint">
                  {shownName}
                  {typeof shownSize === 'number'
                    ? ` · ${formatBytes(shownSize)}`
                    : ''}
                </span>
              ) : null}
            </>
          ) : (
            <AdminField
              label="Ruta interna"
              required={draft.estado === 'publicado'}
            >
              <Input
                value={draft.ruta ?? ''}
                onChange={(event) => set('ruta', event.currentTarget.value)}
                placeholder="/mapas/matricula"
              />
            </AdminField>
          )}

          <AdminField
            label="Audiencia — niveles"
            hint="Si no elegís nadie ni niveles, cualquier usuario logueado puede abrir."
          >
            <MultiSelect<string>
              value={draft.audienciaNivelIds ?? []}
              onChange={(next) => set('audienciaNivelIds', next)}
              options={[...niveles]
                .sort((a, b) => a.orden - b.orden)
                .map((n) => ({ value: n.id as string, label: n.nombre }))}
              placeholder="Seleccione niveles"
            />
          </AdminField>

          <AdminField label="Audiencia — personas">
            <MultiSelect<string>
              value={draft.audienciaUserIds ?? []}
              onChange={(next) => set('audienciaUserIds', next)}
              options={pickerUsers
                .filter(
                  (u) =>
                    !u.banned ||
                    (draft.audienciaUserIds ?? []).includes(u.id),
                )
                .map((u) => ({
                  value: u.id as string,
                  label: `${u.name} (${u.email})`,
                }))}
              placeholder="Seleccione personas"
            />
          </AdminField>
        </div>
        <div className="ui-dialog-actions">
          <Button variant="secondary" onClick={requestClose}>Cancelar</Button>
          <Button
            disabled={!valido || saving}
            onClick={() => void save()}
          >
            Guardar
          </Button>
        </div>
      </DialogContent>
    )
  }

// ── Recursos table ─────────────────────────────────────────────────────────

function RecursosAdmin() {
  const { recursos, niveles, tipos, categorias, removeRecurso, writeError } = useHubData()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Recurso | null>(null)
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const { run: runPending } = useAdminPendingAction()
  const rememberTrigger = useAdminDialogFocus(open)

  const nuevo = () => {
    rememberTrigger()
    setEditing(null)
    setOpen(true)
  }
  const editar = (r: Recurso) => {
    rememberTrigger()
    setEditing(r)
    setOpen(true)
  }
  const eliminar = async (id: string) => {
    if (deleting) return
    setDeleting(id)
    try {
      await runPending(() => removeRecurso(id))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <div className="ui-toolbar">
        <span className="ui-hint">{recursos.length} recursos en el Hub</span>
        <Button onClick={nuevo}><Plus size={16} /> Nuevo recurso</Button>
      </div>
      {writeError ? <div className="ui-messagebar ui-messagebar--error" role="alert">{writeError}</div> : null}

      <div className="ui-table-wrap">
        <table className="ui-table" aria-label="Recursos">
          <thead>
            <tr>
              <th>Recurso</th>
              <th>Contenido</th>
              <th>Nivel</th>
              <th>Tipo</th>
              <th>Categoría</th>
              <th>Estado</th>
              <th>Actualizado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {recursos.map((r) => {
              const cat = findCategoria(categorias, r.categoriaId)
              return (
                <tr key={r.id} aria-busy={deleting === r.id}>
                  <td>{r.titulo}</td>
                  <td><span className="badge">{FORMATOS[r.formato].label}</span></td>
                  <td>{nivelNombre(niveles, r.nivelId)}</td>
                  <td>{tipoNombre(tipos, r.tipoId)}</td>
                  <td>{cat ? <span className="badge badge--neutral">{cat.nombre}</span> : '—'}</td>
                  <td>
                    <span className={r.estado === 'publicado' ? 'badge badge--success' : 'badge badge--warning'}>
                      {r.estado === 'publicado' ? 'Publicado' : 'Borrador'}
                    </span>
                  </td>
                  <td>{formatearFecha(r.actualizado)}</td>
                  <td>
                    <div className="ui-actions">
                      <Tooltip>
                        <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Editar" onClick={() => editar(r)} />}>
                          <Pencil size={16} />
                        </TooltipTrigger>
                        <TooltipContent>Editar</TooltipContent>
                      </Tooltip>
                      <ConfirmDelete
                        title="¿Eliminar recurso?"
                        description="El recurso y su archivo asociado se eliminarán. Esta acción no se puede deshacer."
                        onConfirm={() => void eliminar(r.id)}
                        triggerLabel="Eliminar recurso"
                        trigger={<Button variant="ghost" size="icon" aria-label="Eliminar recurso" disabled={deleting === r.id}><Trash2 size={16} /></Button>}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <RecursoDialog
        open={open}
        editing={editing}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

// ── Generic taxonomy dialog ────────────────────────────────────────────────

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
  onSave: (values: Record<string, unknown>) => void | Promise<boolean>
}) {
  const closeRequest = React.useRef<() => void>(onClose)
  const registerClose = React.useCallback((request: () => void) => {
    closeRequest.current = request
  }, [])
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeRequest.current()}>
      {open ? (
        <TaxonomyForm
          key={title}
          title={title}
          fields={fields}
          initial={initial}
          onSave={onSave}
          onClose={onClose}
          onRegisterClose={registerClose}
        />
      ) : null}
    </Dialog>
  )
}

export function TaxonomyForm({
  onClose,
  title,
  fields,
  initial,
  onSave,
  onRegisterClose,
}: {
  onClose: () => void
  title: string
  fields: TaxonomyField[]
  initial: Record<string, unknown>
  onSave: (values: Record<string, unknown>) => void | Promise<boolean>
  onRegisterClose: (request: () => void) => void
}) {
  const [initialValues] = React.useState(initial)
  const [values, setValues] = React.useState<Record<string, unknown>>(initialValues)
  const { pending: saving, run: runPending } = useAdminPendingAction()
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues)
  const requestClose = useDirtyGuard(dirty, onClose)

  React.useEffect(() => {
    onRegisterClose(requestClose)
  }, [onRegisterClose, requestClose])

  const set = (k: string, v: unknown) =>
    setValues((prev) => ({ ...prev, [k]: v }))

  const nombreOk =
    typeof values.nombre === 'string' && values.nombre.trim().length > 0

  return (
    <DialogContent>
      <DialogTitle>{title}</DialogTitle>
        <div className="ui-form-grid">
          {fields.map((f) => {
            if (f.type === 'color') {
              const current = (values[f.key] as BadgeColor) ?? 'brand'
              return (
                <AdminField key={f.key} label={f.label} hint={f.hint}>
                  <Select
                    value={current}
                    items={Object.fromEntries(COLORS.map((c) => [c, c]))}
                    onValueChange={(value) => set(f.key, value as string)}
                  >
                    <SelectTrigger aria-label={f.label} />
                    <SelectContent>
                      {COLORS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AdminField>
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
        <div className="ui-dialog-actions">
          <Button variant="secondary" onClick={requestClose}>Cancelar</Button>
          <Button
            disabled={!nombreOk || saving}
            onClick={() => void runPending(async () => {
                const result = await onSave(values)
                if (result !== false) onClose()
            })}
          >
            Guardar
          </Button>
        </div>
</DialogContent>
    )
  }

// ── Taxonomy table wrapper ─────────────────────────────────────────────────

export function TaxonomyAdmin<T extends { id: string }>({
  items,
  columns,
  fields,
  emptyValues,
  error,
  onSave,
  onDelete,
  singular,
  inUse,
}: {
  items: T[]
  columns: { header: string; render: (item: T) => React.ReactNode }[]
  fields: TaxonomyField[]
  emptyValues: Record<string, unknown>
  onSave: (values: Record<string, unknown>, editing: T | null) => void | Promise<boolean>
  onDelete: (id: string) => void | Promise<boolean>
  singular: string
  inUse: (id: string) => number
  error?: string | null
}) {
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<T | null>(null)
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const { run: runPending } = useAdminPendingAction()
  const rememberTrigger = useAdminDialogFocus(open)

  const nuevo = () => {
    rememberTrigger()
    setEditing(null)
    setOpen(true)
  }
  const editar = (item: T) => {
    rememberTrigger()
    setEditing(item)
    setOpen(true)
  }
  const eliminar = async (id: string) => {
    if (deleting) return
    setDeleting(id)
    try {
      await runPending(async () => {
        await onDelete(id)
      })
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <div className="ui-toolbar">
        <span className="ui-hint">
          {items.length} {items.length === 1 ? singular : `${singular}s`}
        </span>
        <Button onClick={nuevo}><Plus size={16} /> Agregar {singular}</Button>
      </div>
      {error ? <div className="ui-messagebar ui-messagebar--error" role="alert">{error}</div> : null}

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
                <tr key={item.id} aria-busy={deleting === item.id}>
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
                      <Tooltip>
                        <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Editar" onClick={() => editar(item)} />}>
                          <Pencil size={16} />
                        </TooltipTrigger>
                        <TooltipContent>Editar</TooltipContent>
                      </Tooltip>
                      <ConfirmDelete
                        title={`¿Eliminar ${singular}?`}
                        description={
                          uses
                            ? `No se puede eliminar: hay ${uses} recurso${uses === 1 ? '' : 's'} asociados.`
                            : `La ${singular} se eliminará de forma permanente.`
                        }
                        onConfirm={() => void eliminar(item.id)}
                        triggerLabel={`Eliminar ${singular}`}
                        disabled={uses > 0 || deleting === item.id}
                        trigger={
                          uses > 0 ? (
                            <Button variant="ghost" size="icon" aria-label={`Eliminar ${singular}`} disabled={uses > 0 || deleting === item.id} title="No se puede eliminar: hay recursos asociados">
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
        onClose={() => setOpen(false)}
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

// ── Users (admin only) ─────────────────────────────────────────────────────

function UserDialog({
  open,
  onClose,
  editing,
  niveles,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  editing: HubUserRow | null
  niveles: Nivel[]
  onSaved: () => Promise<void>
}) {
  const closeRequest = React.useRef<() => void>(onClose)
  const registerClose = React.useCallback((request: () => void) => {
    closeRequest.current = request
  }, [])
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeRequest.current()}>
      {open ? (
        <UserForm
          key={editing?.id ?? 'nuevo'}
          editing={editing}
          niveles={niveles}
          onClose={onClose}
          onSaved={onSaved}
          onRegisterClose={registerClose}
        />
      ) : null}
    </Dialog>
  )
}

function UserForm({
  onClose,
  editing,
  niveles,
  onSaved,
  onRegisterClose,
}: {
  onClose: () => void
  editing: HubUserRow | null
  niveles: Nivel[]
  onSaved: () => Promise<void>
  onRegisterClose: (request: () => void) => void
}) {
  const empty = {
    name: '',
    email: '',
    password: '',
    role: 'consulta' as Role,
    banned: false,
    nivelIds: [] as string[],
  }
  const [initialDraft] = React.useState(
    editing
      ? {
          name: editing.name,
          email: editing.email,
          password: '',
          role: editing.role,
          banned: editing.banned,
          nivelIds: editing.nivelIds,
        }
      : empty,
  )
  const [draft, setDraft] = React.useState(initialDraft)
  const { pending: saving, run: runPending } = useAdminPendingAction()
  const [error, setError] = React.useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft)
  const requestClose = useDirtyGuard(dirty, onClose)

  React.useEffect(() => {
    onRegisterClose(requestClose)
  }, [onRegisterClose, requestClose])

  const passwordOk =
    draft.password.length === 0 || draft.password.length >= 8
  const valido =
    draft.name.trim().length > 0 &&
    draft.email.trim().length > 0 &&
    (editing ? passwordOk : draft.password.length >= 8)

  const save = async () => {
    await runPending(async () => {
      setError(null)
      const res = editing
        ? await fetch(`/api/usuarios/${encodeURIComponent(editing.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: draft.name,
              role: draft.role,
              banned: draft.banned,
              password: draft.password,
              nivelIds: draft.nivelIds,
            }),
          })
        : await fetch('/api/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: draft.name,
              email: draft.email,
              password: draft.password,
              role: draft.role,
              nivelIds: draft.nivelIds,
            }),
          })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: unknown
        } | null
        setError(
          typeof data?.error === 'string' ? data.error : 'No se pudo guardar',
        )
        return
      }
      await onSaved()
      onClose()
    })
  }

  return (
    <DialogContent>
      <DialogTitle>
          {editing ? 'Editar usuario' : 'Nuevo usuario'}
        </DialogTitle>
        <div className="ui-form-grid">
          {error ? (
            <div className="ui-messagebar ui-messagebar--error" role="alert">
              {error}
            </div>
          ) : null}
          <AdminField label="Nombre" required>
            <Input
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.currentTarget.value }))}
            />
          </AdminField>
          <AdminField label="Email" required>
            <Input
              type="email"
              value={draft.email}
              disabled={Boolean(editing)}
              onChange={(event) => setDraft((prev) => ({ ...prev, email: event.currentTarget.value }))}
              placeholder="usuario@example.com"
            />
          </AdminField>
          <AdminField
            label={editing ? 'Nueva contraseña' : 'Contraseña'}
            required={!editing}
            hint={
              editing
                ? 'Dejar vacío para no cambiar'
                : 'Mínimo 8 caracteres'
            }
          >
            <Input
              type="password"
              value={draft.password}
              onChange={(event) => setDraft((prev) => ({ ...prev, password: event.currentTarget.value }))}
            />
          </AdminField>
          <AdminField label="Rol" required>
            <Select
              value={draft.role}
              items={Object.fromEntries(ROLES.map((r) => [r, rolLabel(r)]))}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, role: value as Role }))}
            >
              <SelectTrigger aria-label="Rol" />
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{rolLabel(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AdminField>
          <AdminField label="Niveles">
            <MultiSelect<string>
              value={draft.nivelIds}
              onChange={(next) => setDraft((prev) => ({ ...prev, nivelIds: next }))}
              options={[...niveles]
                .sort((a, b) => a.orden - b.orden)
                .map((n) => ({ value: n.id, label: n.nombre }))}
              placeholder="Seleccione niveles"
            />
          </AdminField>
          {editing ? (
            <AdminField label="Estado">
              <Switch
                label="Desactivado"
                checked={draft.banned}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, banned: checked }))}
              />
            </AdminField>
          ) : null}
        </div>
        <div className="ui-dialog-actions">
          <Button variant="secondary" onClick={requestClose}>Cancelar</Button>
          <Button
            disabled={!valido || saving}
            onClick={() => void save()}
          >
            Guardar
          </Button>
        </div>
      </DialogContent>
    )
  }

function UsersAdmin() {
  const { niveles } = useHubData()
  const [usuarios, setUsuarios] = React.useState<HubUserRow[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<HubUserRow | null>(null)
  const rememberTrigger = useAdminDialogFocus(open)

  const requestUsers = React.useCallback(async () => {
    const res = await fetch('/api/usuarios')
    const data = (await res.json().catch(() => null)) as {
      usuarios?: HubUserRow[]
      error?: unknown
    } | null
    if (!res.ok) {
      throw new Error(
        typeof data?.error === 'string' ? data.error : 'No se pudo cargar',
      )
    }
    return data?.usuarios ?? []
  }, [])

  const reload = React.useCallback(async () => {
    const usuarios = await requestUsers()
    setUsuarios(usuarios)
    setLoadError(null)
  }, [requestUsers])

  React.useEffect(() => {
    let cancelled = false
    requestUsers().then(
      (usuarios) => {
        if (!cancelled) setUsuarios(usuarios)
      },
      (error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'No se pudo cargar',
          )
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [requestUsers])

  const nuevo = () => {
    rememberTrigger()
    setEditing(null)
    setOpen(true)
  }
  const editar = (u: HubUserRow) => {
    rememberTrigger()
    setEditing(u)
    setOpen(true)
  }

  return (
    <div>
      <div className="ui-toolbar">
        <span className="ui-hint">
          {usuarios.length} {usuarios.length === 1 ? 'usuario' : 'usuarios'}
        </span>
        <Button onClick={nuevo}><Plus size={16} /> Nuevo usuario</Button>
      </div>

      {loadError ? (
        <div className="ui-messagebar ui-messagebar--error" role="alert">
          {loadError}
        </div>
      ) : null}

      <div className="ui-table-wrap">
        <table className="ui-table" aria-label="Usuarios">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Niveles</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{rolLabel(u.role)}</td>
                <td>
                  {u.nivelIds
                    .map((id) => niveles.find((n) => n.id === id)?.nombre)
                    .filter(Boolean)
                    .join(', ') || '—'}
                </td>
                <td>
                  <span className={u.banned ? 'badge badge--warning' : 'badge badge--success'}>
                    {u.banned ? 'Desactivado' : 'Activo'}
                  </span>
                </td>
                <td>
                  <div className="ui-actions">
                    <Tooltip>
                      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Editar" onClick={() => editar(u)} />}>
                        <Pencil size={16} />
                      </TooltipTrigger>
                      <TooltipContent>Editar</TooltipContent>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UserDialog
        open={open}
        editing={editing}
        niveles={niveles}
        onClose={() => setOpen(false)}
        onSaved={reload}
      />
    </div>
  )
}

// ── Admin page ─────────────────────────────────────────────────────────────

export function AdminPage() {
  const session = authClient.useSession()
  const role = (session.data?.user as { role?: Role } | undefined)?.role
  const canView = (id: AdminSectionId) => adminSectionsForRole(role ?? 'editor').some((item) => item.id === id)
  const { section: tab, navigate: onTab } = useAdminSection()
  const {
    recursos,
    niveles,
    tipos,
    categorias,
    tags,
    writeError,
    upsertNivel,
    removeNivel,
    upsertTipo,
    removeTipo,
    upsertCategoria,
    removeCategoria,
    upsertTag,
    removeTag,
  } = useHubData()

  const usoNivel = (id: string) =>
    recursos.filter((r) => r.nivelId === id).length
  const usoTipo = (id: string) => recursos.filter((r) => r.tipoId === id).length
  const usoCategoria = (id: string) =>
    recursos.filter((r) => r.categoriaId === id).length
  const usoTag = (id: string) =>
    recursos.filter((r) => r.tagIds.includes(id)).length

  return (
    <div>
      <div className="page-stack">
        <div>
          <span className="eyebrow">GESTIÓN DEL HUB</span>
          <h1 className="page-title page-title--sm">Administración</h1>
          <p className="page-intro">
            Gestione los recursos y las taxonomías del Hub. La administración
            respeta el mismo modelo de información que las vistas públicas: los
            recursos referencian niveles, tipos, categorías y etiquetas, sin
            duplicar estructuras.
          </p>
        </div>

        <div className="ui-messagebar ui-messagebar--info">
          <span>
            <strong className="ui-messagebar__title">Modelo único</strong>
            Cada recurso tiene un tipo de contenido (Reporte, Tablero o Mapa) y
            referencia una sola vez cada taxonomía. Las taxonomías en uso no
            pueden eliminarse para preservar la integridad.
          </span>
        </div>

        <AdminPageTabs tab={tab} onTab={onTab} role={role} />

        {tab === 'recursos' && <RecursosAdmin />}

        {canView('categorias') && tab === 'categorias' && (
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
            error={writeError}
            onSave={(v, editing) =>
              upsertCategoria({
                id: editing?.id ?? slugId(String(v.nombre)),
                nombre: String(v.nombre),
                color: (v.color as BadgeColor) ?? 'brand',
              })
            }
            onDelete={removeCategoria}
          />
        )}

        {canView('tags') && tab === 'tags' && (
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
            error={writeError}
            onSave={(v, editing) =>
              upsertTag({
                id: editing?.id ?? slugId(String(v.nombre)),
                nombre: String(v.nombre),
              })
            }
            onDelete={removeTag}
          />
        )}

        {canView('niveles') && tab === 'niveles' && (
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
            error={writeError}
            onSave={(v, editing) =>
              upsertNivel({
                id: editing?.id ?? slugId(String(v.nombre)),
                nombre: String(v.nombre),
                orden: Number(v.orden) || niveles.length + 1,
              })
            }
            onDelete={removeNivel}
          />
        )}

        {canView('tipos') && tab === 'tipos' && (
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
            error={writeError}
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
        )}

        {canView('usuarios') && tab === 'usuarios' && <UsersAdmin />}
      </div>
    </div>
  )
}
