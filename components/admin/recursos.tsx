'use client'

import { ArchivoMetadata } from '@/components/archivo-metadata'

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { FORMATOS, type Formato, type Recurso, categoria as findCategoria, formatearFecha, nivelNombre, tipoNombre } from '@/lib/model'
import { useHubData } from '@/components/hub-data'
import { isAllowedUpload } from '@/lib/upload'
import { Button } from '@/components/ui/button'
import { ConfirmDelete } from '@/components/confirm-delete'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioItem } from '@/components/ui/radio'
import { MultiSelect } from '@/components/ui/multi-select'
import { DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { HubUserRow} from '@/components/admin/shared';
import { OPCIONES_DIRECCION, idsADirecciones, direccionesAIds, formatBytes, slugId, AdminField, FormDialog, useEditorDialog, SelectField, BotonEditar, DialogActions, AdminListToolbar, AdminEmptyRow, useBusqueda, filaEditable, AdminStatus } from '@/components/admin/shared'

function RecursoDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: Recurso | null
}) {
  return (
    <FormDialog open={open} onClose={onClose}>
      <RecursoForm key={editing?.id ?? 'nuevo'} editing={editing} onClose={onClose} />
    </FormDialog>
  )
}

function RecursoForm({
  editing,
  onClose,
}: {
  editing: Recurso | null
  onClose: () => void
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
    audienciaNivelJurIds: [],
    audienciaUserIds: [],
  }
  const [draft, setDraft] = React.useState<Recurso>(() =>
    editing
      ? {
          ...editing,
          audienciaNivelJurIds: editing.audienciaNivelJurIds ?? [],
          audienciaUserIds: editing.audienciaUserIds ?? [],
        }
      : empty,
  )
  const [destino, setDestino] = React.useState<'archivo' | 'ruta'>(
    editing?.ruta ? 'ruta' : 'archivo',
  )
  const [pendingFile, setPendingFile] = React.useState<File | null>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [pickerUsers, setPickerUsers] = React.useState<HubUserRow[]>([])

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
      audienciaNivelJurIds: draft.audienciaNivelJurIds ?? [],
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
    setSaving(true)
    try {
      const ok = await upsertRecurso(
        toSave,
        destino === 'archivo' ? pendingFile : null,
      )
      if (ok) onClose()
    } finally {
      setSaving(false)
    }
  }

  const valido =
    draft.titulo.trim().length > 0 &&
    tiposValidos.length > 0 &&
    draft.categoriaId &&
    !fileMissing &&
    !rutaMissing

  return (
      <DialogContent className="admin-sheet">
        <DialogTitle className="admin-form__title">
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
            <SelectField
              label="Tipo de contenido"
              required
              value={draft.formato}
              options={(Object.keys(FORMATOS) as Formato[]).map((f) => ({ value: f, label: FORMATOS[f].label }))}
              onChange={(value) => {
                const f = value as Formato
                const nextTipo = tipos.find((t) => t.aplicaA.includes(f))
                setDraft((prev) => ({
                  ...prev,
                  formato: f,
                  tipoId: nextTipo?.id ?? '',
                }))
              }}
            />

            <SelectField
              label="Nivel"
              required
              value={draft.nivelId}
              options={[...niveles].sort((a, b) => a.orden - b.orden).map((n) => ({ value: n.id, label: n.nombre }))}
              onChange={(value) => set('nivelId', value)}
            />
          </div>

          <div className="ui-two-col">
            <SelectField
              label="Tipo"
              hint="Depende del tipo de contenido"
              required
              value={draft.tipoId}
              options={tiposValidos.map((t) => ({ value: t.id, label: t.nombre }))}
              onChange={(value) => set('tipoId', value)}
            />

            <SelectField
              label="Categoría (TAG principal)"
              ariaLabel="Categoría"
              required
              value={draft.categoriaId}
              options={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
              onChange={(value) => set('categoriaId', value)}
            />
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
              {editing ? <ArchivoMetadata recurso={editing} /> : null}
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
            label="Audiencia por dirección"
            hint="Si no elegís a nadie, solo lo ve el equipo administrador."
          >
            <MultiSelect<string>
              value={idsADirecciones(draft.audienciaNivelJurIds)}
              onChange={(next) => set('audienciaNivelJurIds', direccionesAIds(next))}
              options={OPCIONES_DIRECCION}
              placeholder="Seleccione direcciones"
            />
          </AdminField>

          <AdminField label="Visible para — personas">
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
        <DialogActions onClose={onClose} onSave={() => void save()} disabled={!valido || saving} />
      </DialogContent>
    )
  }

// ── Recursos table ─────────────────────────────────────────────────────────

export function RecursosAdmin() {
  const { recursos, niveles, tipos, categorias, removeRecurso } = useHubData()
  const { open, editing, nuevo, editar, onClose } = useEditorDialog<Recurso>()
  const { query, setQuery, filtrados } = useBusqueda(recursos, (r) => [
    r.titulo,
    findCategoria(categorias, r.categoriaId)?.nombre,
    tipoNombre(tipos, r.tipoId),
    nivelNombre(niveles, r.nivelId),
  ])

  return (
    <div>
      <AdminListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Buscar por título, categoría, tipo o nivel"
        total={recursos.length}
        visibles={filtrados.length}
        singular="recurso"
        plural="recursos"
        action={<Button onClick={nuevo}><Plus size={16} /> Nuevo recurso</Button>}
      />

      <div className="ui-table-wrap">
        <table className="ui-table" aria-label="Recursos">
          <thead>
            <tr>
              <th>Recurso</th>
              <th>Clasificación</th>
              <th>Estado</th>
              <th>Actualizado</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((r) => {
              const cat = findCategoria(categorias, r.categoriaId)
              return (
                <tr key={r.id} {...filaEditable(() => editar(r))}>
                  <td>
                    <div className="admin-cell-stack">
                      <strong>{r.titulo}</strong>
                      <ArchivoMetadata recurso={r} />
                      <span className="ui-hint">{FORMATOS[r.formato].label} · {tipoNombre(tipos, r.tipoId)}</span>
                    </div>
                  </td>
                  <td data-label="Clasificación">
                    <div className="admin-cell-stack">
                      <span>{cat?.nombre ?? 'Sin categoría'}</span>
                      <span className="ui-hint">{nivelNombre(niveles, r.nivelId)}</span>
                    </div>
                  </td>
                  <td data-label="Estado">
                    <AdminStatus tone={r.estado === 'publicado' ? 'ok' : 'warn'}>
                      {r.estado === 'publicado' ? 'Publicado' : 'Borrador'}
                    </AdminStatus>
                  </td>
                  <td data-label="Actualizado" className="admin-cell-nowrap">{formatearFecha(r.actualizado)}</td>
                  <td>
                    <div className="ui-actions">
                      <BotonEditar onClick={() => editar(r)} />
                      <ConfirmDelete
                        title="¿Eliminar recurso?"
                        description="El recurso y su archivo asociado se eliminarán. Esta acción no se puede deshacer."
                        onConfirm={() => removeRecurso(r.id)}
                        triggerLabel="Eliminar recurso"
                        trigger={<Button variant="ghost" size="icon" aria-label="Eliminar recurso"><Trash2 size={16} /></Button>}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
            {recursos.length === 0 ? (
              <AdminEmptyRow colSpan={5}>Todavía no hay recursos. Use «Nuevo recurso» para publicar el primero.</AdminEmptyRow>
            ) : filtrados.length === 0 ? (
              <AdminEmptyRow colSpan={5}>Ningún recurso coincide con «{query}».</AdminEmptyRow>
            ) : null}
          </tbody>
        </table>
      </div>

      <RecursoDialog
        open={open}
        editing={editing}
        onClose={onClose}
      />
    </div>
  )
}

// ── Generic taxonomy dialog ────────────────────────────────────────────────
