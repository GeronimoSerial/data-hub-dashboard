'use client'

import type { Role } from '@/lib/acl'
import * as React from 'react'
import { Plus } from 'lucide-react'
import { type Nivel, nivelNombre } from '@/lib/model'
import { useHubData } from '@/components/hub-data'
import { HUB_DESTINATIONS, HUB_SECTIONS, type HubSection } from '@/lib/hub-sections'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioItem } from '@/components/ui/radio'
import { MultiSelect } from '@/components/ui/multi-select'
import { DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { AccesoRecursos, HubUserRow, UserAdminOptions} from '@/components/admin/shared';
import { SECTION_LABELS, DESTINATION_LABELS, ROLES, rolLabel, OPCIONES_DIRECCION, idsADirecciones, direccionesAIds, nombresDirecciones, AdminField, FormDialog, useEditorDialog, useListaRemota, SelectField, leerErrorApi, BotonEditar, DialogActions, AdminListToolbar, AdminEmptyRow, AdminStatus, useBusqueda, filaEditable } from '@/components/admin/shared'

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
  return (
    <FormDialog open={open} onClose={onClose}>
      <UserForm
          key={editing?.id ?? 'nuevo'}
          editing={editing}
          niveles={niveles}
          onClose={onClose}
          onSaved={onSaved}
      />
    </FormDialog>
  )
}

function UserForm({
  onClose,
  editing,
  niveles,
  onSaved,
}: {
  onClose: () => void
  editing: HubUserRow | null
  niveles: Nivel[]
  onSaved: () => Promise<void>
}) {
  const empty = {
    name: '',
    email: '',
    password: '',
    role: 'consulta' as Role,
    banned: false,
    nivelJurIds: [] as string[],
    accesoRecursos: 'todos' as AccesoRecursos,
    recursoIds: [] as string[],
    enabledSections: [] as HubSection[],
    landing: false,
    destination: null as string | null,
  }
  const [draft, setDraft] = React.useState(() =>
    editing
      ? {
          name: editing.name,
          email: editing.email,
          password: '',
          role: editing.role,
          banned: editing.banned,
          nivelJurIds: idsADirecciones(editing.nivelJurIds),
          accesoRecursos: editing.accesoRecursos,
          recursoIds: editing.recursoIds,
          enabledSections: editing.hubPolicy.enabledSections === undefined ? [...HUB_SECTIONS] : [...editing.hubPolicy.enabledSections],
          landing: editing.hubPolicy.landing ?? true,
          destination: editing.hubDestination ?? (editing.hubPolicy.enabledSections === undefined && editing.hubPolicy.landing === undefined ? '/' : null),
        }
      : empty,
  )
  const esStaff = draft.role === 'admin' || draft.role === 'editor'
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [managedResources, setManagedResources] = React.useState<UserAdminOptions['recursos']>([])
  const [optionsLoading, setOptionsLoading] = React.useState(true)
  const [resourcesError, setResourcesError] = React.useState<string | null>(null)
  const [destinationResult, setDestinationResult] = React.useState<{ key: string; destinos: string[]; error: string | null } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/usuarios/opciones').then(async (res) => {
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(leerErrorApi(data, 'No se pudieron cargar los recursos administrables.'))
      return data as { recursos?: UserAdminOptions['recursos'] }
    }).then((data) => { if (!cancelled) setManagedResources(data.recursos ?? []) })
      .catch((cause: unknown) => { if (!cancelled) setResourcesError(cause instanceof Error ? cause.message : 'No se pudieron cargar las opciones.') })
      .finally(() => { if (!cancelled) setOptionsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const targetAcl = React.useMemo(() => ({
    ...(editing ? { userId: editing.id } : {}),
    role: draft.role,
    nivelJurIds: direccionesAIds(draft.nivelJurIds),
    accesoRecursos: draft.accesoRecursos,
    recursoIds: draft.recursoIds,
  }), [editing, draft.role, draft.nivelJurIds, draft.accesoRecursos, draft.recursoIds])
  const targetAclKey = JSON.stringify(targetAcl)
  const destinationLoading = destinationResult?.key !== targetAclKey
  const allowedDestinations = destinationLoading ? [] : destinationResult.destinos
  const destinationError = destinationLoading ? null : destinationResult.error

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/usuarios/opciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(targetAcl) })
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(leerErrorApi(data, 'No se pudieron validar los destinos.'))
        return data as { destinos?: string[] }
      }).then((data) => {
        if (!cancelled) setDestinationResult({ key: targetAclKey, destinos: data.destinos ?? [], error: null })
      }).catch((cause: unknown) => {
        if (!cancelled) setDestinationResult({ key: targetAclKey, destinos: [], error: cause instanceof Error ? cause.message : 'No se pudieron validar los destinos.' })
      })
    return () => { cancelled = true }
  }, [targetAcl, targetAclKey])

  const destinationOptions = HUB_DESTINATIONS
    .filter((entry) => allowedDestinations.includes(entry.path))
    .filter((entry) => entry.kind === 'landing' ? draft.landing : entry.kind === 'special' || draft.enabledSections.includes(entry.section))
    .map((entry) => ({ value: entry.path, label: DESTINATION_LABELS[entry.path] ?? entry.path }))
  const destinationInvalid = Boolean(draft.destination && !destinationOptions.some((item) => item.value === draft.destination))
  const noAccessPolicy = draft.enabledSections.length === 0 && !draft.landing
  const noDestinationNeeded = noAccessPolicy && draft.destination === null

  const passwordOk =
    draft.password.length === 0 || draft.password.length >= 8
  const valido =
    draft.name.trim().length > 0 &&
    draft.email.trim().length > 0 &&
    (editing ? passwordOk : draft.password.length >= 8) &&
    (noDestinationNeeded || Boolean(draft.destination && !destinationInvalid)) &&
    !optionsLoading && !destinationLoading && !resourcesError && !destinationError

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = editing
        ? await fetch(`/api/usuarios/${encodeURIComponent(editing.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: draft.name,
              role: draft.role,
              banned: draft.banned,
              password: draft.password,
              nivelJurIds: direccionesAIds(draft.nivelJurIds),
              accesoRecursos: draft.accesoRecursos,
              recursoIds: draft.recursoIds,
              hubAccess: { enabledSections: draft.enabledSections, landing: draft.landing, destination: draft.destination },
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
              nivelJurIds: direccionesAIds(draft.nivelJurIds),
              accesoRecursos: draft.accesoRecursos,
              recursoIds: draft.recursoIds,
              hubAccess: { enabledSections: draft.enabledSections, landing: draft.landing, destination: draft.destination },
            }),
          })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: unknown
        } | null
        setError(leerErrorApi(data, 'No se pudo guardar el usuario. Intente nuevamente.'))
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
      <DialogTitle className="admin-form__title">
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
          <AdminField label="Correo" required>
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
          <SelectField
            label="Rol"
            required
            value={draft.role}
            options={ROLES.map((r) => ({ value: r, label: rolLabel(r) }))}
            onChange={(value) => setDraft((prev) => ({ ...prev, role: value as Role }))}
          />
          <AdminField label="Direcciones (nivel jurisdiccional)">
            <MultiSelect<string>
              value={draft.nivelJurIds}
              onChange={(next) => setDraft((prev) => ({ ...prev, nivelJurIds: next }))}
              options={OPCIONES_DIRECCION}
              placeholder="Seleccione direcciones"
            />
          </AdminField>
          <AdminField
            label="Acceso a recursos"
            hint={esStaff ? 'Admin y editor ven todos los recursos' : undefined}
          >
            <RadioGroup
              value={draft.accesoRecursos}
              onValueChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  accesoRecursos: value === 'seleccionados' ? 'seleccionados' : 'todos',
                }))
              }
            >
              <RadioItem value="todos" label="Todos" disabled={esStaff} />
              <RadioItem
                value="seleccionados"
                label="Solo los seleccionados"
                disabled={esStaff}
              />
            </RadioGroup>
          </AdminField>
          {!esStaff && draft.accesoRecursos === 'seleccionados' ? (
            <AdminField label="Recursos">
              <MultiSelect<string>
                value={draft.recursoIds}
                onChange={(next) => setDraft((prev) => ({ ...prev, recursoIds: next }))}
                options={[...managedResources]
                  .sort((a, b) => a.titulo.localeCompare(b.titulo))
                  .map((r) => ({
                    value: r.id,
                    label: `${r.titulo} - ${r.nivelNombre ?? nivelNombre(niveles, r.nivelId)}`,
                  }))}
                placeholder="Seleccione recursos"
              />
            </AdminField>
          ) : null}
          <fieldset className="ui-field" aria-describedby="hub-access-help">
            <legend className="ui-field__label">Acceso al Hub</legend>
            <p id="hub-access-help" className="ui-field__description">
              {editing && editing.hubPolicy.enabledSections === undefined && editing.hubPolicy.landing === undefined
                ? 'Este usuario conserva el acceso heredado: todas las secciones e Inicio.'
                : 'Elija las secciones que puede abrir. Estos permisos no reemplazan las restricciones de rol, recursos ni jurisdicción.'}
            </p>
            <div className="ui-form-grid">
              {HUB_SECTIONS.map((section) => (
                <label key={section}>
                  <input type="checkbox" checked={draft.enabledSections.includes(section)} onChange={(event) => setDraft((prev) => ({
                    ...prev,
                    enabledSections: event.currentTarget.checked ? [...prev.enabledSections, section] : prev.enabledSections.filter((item) => item !== section),
                  }))} />{' '}{SECTION_LABELS[section]}
                </label>
              ))}
              <label><input type="checkbox" checked={draft.landing} onChange={(event) => setDraft((prev) => ({ ...prev, landing: event.currentTarget.checked }))} />{' '}Permitir Inicio</label>
            </div>
          </fieldset>
          {optionsLoading || destinationLoading ? <p role="status">Cargando destinos y recursos administrables…</p> : null}
          {resourcesError || destinationError ? <div className="ui-messagebar ui-messagebar--error" role="alert">{resourcesError ?? destinationError}</div> : null}
          {!noDestinationNeeded ? (
            <SelectField
              label="Destino inicial"
              required
              value={draft.destination ?? ''}
              options={[
                { value: '', label: 'Seleccione un destino' },
                ...destinationOptions,
                ...(destinationInvalid && draft.destination ? [{ value: draft.destination, label: `${DESTINATION_LABELS[draft.destination] ?? draft.destination} (ya no válido)` }] : []),
              ]}
              hint={destinationInvalid ? 'El destino guardado ya no es válido con los permisos actuales. Elija otro antes de guardar.' : 'Solo se ofrecen destinos válidos para el rol, los recursos y el alcance de este usuario.'}
              onChange={(destination) => setDraft((prev) => ({ ...prev, destination: destination || null }))}
            />
          ) : <p className="ui-messagebar ui-messagebar--info">Sin secciones ni Inicio: la cuenta quedará sin un destino disponible.</p>}
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
        <DialogActions onClose={onClose} onSave={() => void save()} disabled={!valido || saving} />
      </DialogContent>
    )
  }

export function UsersAdmin() {
  const { niveles } = useHubData()
  const {
    items: usuarios,
    loadError,
    reload,
  } = useListaRemota<HubUserRow>({
    url: '/api/usuarios',
    clave: 'usuarios',
    fallbackError: 'No se pudieron cargar los usuarios.',
  })
  const { open, editing, nuevo, editar, onClose } = useEditorDialog<HubUserRow>()
  const { query, setQuery, filtrados } = useBusqueda(usuarios, (u) => [u.name, u.email, rolLabel(u.role)])

  return (
    <div>
      <AdminListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Buscar por nombre, correo o rol"
        total={usuarios.length}
        visibles={filtrados.length}
        singular="usuario"
        plural="usuarios"
        action={<Button onClick={nuevo}><Plus size={16} /> Nuevo usuario</Button>}
      />

      {loadError ? (
        <div className="ui-messagebar ui-messagebar--error" role="alert">
          {loadError}
        </div>
      ) : null}

      <div className="ui-table-wrap">
        <table className="ui-table" aria-label="Usuarios">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Acceso al Hub</th>
              <th>Estado</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((u) => {
              const heredado = u.hubPolicy.enabledSections === undefined && u.hubPolicy.landing === undefined
              const secciones = u.hubPolicy.enabledSections === undefined
                ? 'Todas las secciones'
                : u.hubPolicy.enabledSections.length === 0
                  ? 'Sin secciones'
                  : u.hubPolicy.enabledSections.map((section) => SECTION_LABELS[section]).join(', ')
              const destino = u.hubDestination
                ? DESTINATION_LABELS[u.hubDestination] ?? u.hubDestination
                : heredado
                  ? u.role === 'operador_establecimiento' ? 'Entrada GE según CUE; si no aplica, Inicio' : 'Inicio'
                  : 'Sin configurar'
              const direcciones = nombresDirecciones(u.nivelJurIds)
              return (
                <tr key={u.id} {...filaEditable(() => editar(u))}>
                  <td>
                    <div className="admin-cell-stack">
                      <strong>{u.name}</strong>
                      <span className="ui-hint">{u.email}</span>
                    </div>
                  </td>
                  <td data-label="Rol">
                    <div className="admin-cell-stack">
                      <span>{rolLabel(u.role)}</span>
                      {direcciones || u.accesoRecursos === 'seleccionados' ? (
                        <span className="ui-hint">
                          {[direcciones, u.accesoRecursos === 'seleccionados' ? `${u.recursoIds.length} recurso${u.recursoIds.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td data-label="Acceso al Hub">
                    <div className="admin-cell-stack">
                      <span>
                        {secciones}
                        {u.hubPolicy.landing === false ? <span className="admin-flag"> · Inicio no permitido</span> : null}
                      </span>
                      <span className="ui-hint">
                        Entra a: {destino}{heredado ? ' · acceso heredado' : ''}
                      </span>
                    </div>
                  </td>
                  <td data-label="Estado">
                    <AdminStatus tone={u.banned ? 'off' : 'ok'}>{u.banned ? 'Desactivado' : 'Activo'}</AdminStatus>
                  </td>
                  <td>
                    <div className="ui-actions">
                      <BotonEditar onClick={() => editar(u)} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {usuarios.length > 0 && filtrados.length === 0 ? (
              <AdminEmptyRow colSpan={5}>Ningún usuario coincide con «{query}».</AdminEmptyRow>
            ) : null}
          </tbody>
        </table>
      </div>

      <UserDialog
        open={open}
        editing={editing}
        niveles={niveles}
        onClose={onClose}
        onSaved={reload}
      />
    </div>
  )
}

// ── Motivos de infraestructura (ABM) ───────────────────────────────────────
//
// No reutiliza TaxonomyAdmin: esa tabla cuenta "en uso" contra `recursos`
// (ver taxonomyInUseCount), mientras que un motivo está en uso cuando hay
// filas en infra_afectacion — dominios distintos, API propia
// (/api/infraestructura/motivos, ver spec de diseño §3).
