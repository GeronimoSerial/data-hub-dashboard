'use client'

import type { Role } from '@/lib/acl'
import * as React from 'react'
import { Pencil, Search } from 'lucide-react'
import { type BadgeColor } from '@/lib/model'
import { type HubSection, type SectionPolicy } from '@/lib/hub-sections'
import { nivelesJurisdiccionales } from '@/lib/model'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { regionPublicaActual } from '@/lib/infraestructura/region/publica'

export const COLORS: BadgeColor[] = [
  'brand',
  'success',
  'warning',
  'danger',
  'informative',
  'severe',
  'important',
  'subtle',
]

export type AccesoRecursos = 'todos' | 'seleccionados'

export type HubUserRow = {
  id: string
  name: string
  email: string
  role: Role
  banned: boolean
  nivelJurIds: number[]
  accesoRecursos: AccesoRecursos
  recursoIds: string[]
  hubPolicy: SectionPolicy
  hubDestination: string | null
}

export type UserAdminOptions = {
  recursos: { id: string; titulo: string; nivelId: string; nivelNombre?: string }[]
  destinos: string[]
}

export const SECTION_LABELS: Record<HubSection, string> = {
  explore: 'Exploración', reports: 'Reportes', maps: 'Mapas',
  dashboards: 'Tableros', infrastructure: 'Infraestructura', situation: 'Situación',
  cuadernillos: 'Cuadernillos',
}

export const DESTINATION_LABELS: Record<string, string> = {
  '/': 'Inicio', '/explorar': 'Exploración', '/reportes': 'Reportes',
  '/mapas': 'Mapas', '/tableros': 'Tableros', '/mapas/infraestructura': 'ENOS Corrientes',
  '/situacion': 'Situación', '/cuadernillos': 'Cuadernillos', '/mapas/matricula': 'Mapa de matrícula', '/mapas/natalidad': 'Mapa de natalidad', '/mapas/reorganizacion': 'Reorganización escolar',
  '/tablero': 'Tablero', '/mapa_interactivo': 'Mapa interactivo', '/mapa_sobreedad': 'Mapa de sobreedad',
  '/mapa_notas': 'Mapa de notas', '/problematicas/parte/nuevo': 'Nuevo parte de infraestructura',
}

// Destination label for the current region: only the infrastructure map carries the region name.
export function etiquetaDestino(path: string): string | undefined {
  if (path === '/mapas/infraestructura') return `ENOS ${regionPublicaActual().nombre}`
  return DESTINATION_LABELS[path]
}

export const ROLES: Role[] = ['admin', 'editor', 'consulta', 'director_nivel', 'operador_establecimiento', 'admin_ge']

export function rolLabel(role: Role) {
  if (role === 'admin') return 'Administrador'
  if (role === 'editor') return 'Editor'
  if (role === 'director_nivel') return 'Director de nivel'
  if (role === 'admin_ge') return 'Administrador GE'
  if (role === 'operador_establecimiento') return 'Operador del establecimiento'
  return 'Consulta'
}

// Direcciones (nivel jurisdiccional de GE): MultiSelect trabaja con strings;
// los ids numéricos se convierten solo aquí.
export const OPCIONES_DIRECCION = nivelesJurisdiccionales.map((n) => ({
  value: String(n.id),
  label: n.nombre,
}))

export function idsADirecciones(ids: number[] | undefined): string[] {
  return (ids ?? []).map(String)
}

export function direccionesAIds(values: string[]): number[] {
  return values.map(Number)
}

export function nombresDirecciones(ids: number[]): string {
  return ids
    .map((id) => nivelesJurisdiccionales.find((n) => n.id === id)?.nombre)
    .filter(Boolean)
    .join(', ')
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function slugId(nombre: string) {
  const base = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `${base || 'item'}-${Math.random().toString(36).slice(2, 6)}`
}

export type AdminFieldProps = {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  children: React.ReactNode
}

export function AdminField({ label, hint, error, required, children }: AdminFieldProps) {
  const id = React.useId()
  const control = React.isValidElement<{ id?: string }>(children)
    ? React.cloneElement(children, { id: children.props.id ?? id })
    : children
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden>*</span> : null}
      </label>
      <div className="ui-field__control">{control}</div>
      {error ? <span className="ui-field__error" role="alert">{error}</span> : hint ? <span className="ui-field__description">{hint}</span> : null}
    </div>
  )
}

export function FormDialog({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open ? children : null}
    </Dialog>
  )
}

export function useEditorDialog<T>() {
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<T | null>(null)
  const nuevo = () => {
    setEditing(null)
    setOpen(true)
  }
  const editar = (item: T) => {
    setEditing(item)
    setOpen(true)
  }
  const onClose = () => setOpen(false)
  return { open, editing, nuevo, editar, onClose }
}

export function useListaRemota<T>({
  url,
  clave,
  fallbackError,
}: {
  url: string
  clave: string
  fallbackError: string
}) {
  const [items, setItems] = React.useState<T[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const request = React.useCallback(async () => {
    const res = await fetch(url)
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) throw new Error(leerErrorApi(data, fallbackError))
    return (data?.[clave] as T[] | undefined) ?? []
  }, [url, clave, fallbackError])
  const reload = React.useCallback(async () => {
    const rows = await request()
    setItems(rows)
    setLoadError(null)
  }, [request])

  React.useEffect(() => {
    let cancelled = false
    request().then(
      (rows) => {
        if (!cancelled) setItems(rows)
      },
      (error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : fallbackError)
      },
    )
    return () => {
      cancelled = true
    }
  }, [request, fallbackError])

  return { items, loadError, setLoadError, reload }
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  required,
  ariaLabel = label,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  hint?: string
  required?: boolean
  ariaLabel?: string
}) {
  return (
    <AdminField label={label} hint={hint} required={required}>
      <Select value={value} items={options} onValueChange={(next) => onChange(next as string)}>
        <SelectTrigger aria-label={ariaLabel} />
        <SelectContent>
          {options.map(({ value: option, label: text }) => (
            <SelectItem key={option} value={option}>{text}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </AdminField>
  )
}

export function leerErrorApi(data: { error?: unknown } | null, fallback: string) {
  return typeof data?.error === 'string' ? data.error : fallback
}

export function BotonEditar({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Editar" onClick={onClick} />}>
        <Pencil size={16} />
      </TooltipTrigger>
      <TooltipContent>Editar</TooltipContent>
    </Tooltip>
  )
}

export function DialogActions({
  onClose,
  onSave,
  disabled = false,
}: {
  onClose: () => void
  onSave: () => void
  disabled?: boolean
}) {
  return (
    <div className="ui-dialog-actions">
      <Button variant="secondary" onClick={onClose}>Cancelar</Button>
      <Button disabled={disabled} onClick={onSave}>Guardar</Button>
    </div>
  )
}

// ── Recurso editor ─────────────────────────────────────────────────────────


// ── List toolbar ───────────────────────────────────────────────────────────

function normalizar(texto: string) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Case- and accent-insensitive filter over the given text fields. */
export function useBusqueda<T>(items: T[], campos: (item: T) => (string | undefined | null)[]) {
  const [query, setQuery] = React.useState('')
  const needle = normalizar(query.trim())
  const filtrados = needle
    ? items.filter((item) => campos(item).some((campo) => campo && normalizar(campo).includes(needle)))
    : items
  return { query, setQuery, filtrados }
}

export function AdminListToolbar({
  query,
  onQuery,
  placeholder,
  total,
  visibles,
  singular,
  plural,
  action,
}: {
  query?: string
  onQuery?: (value: string) => void
  placeholder?: string
  total: number
  visibles?: number
  singular: string
  plural: string
  action?: React.ReactNode
}) {
  const shown = visibles ?? total
  return (
    <div className="admin-toolbar">
      {onQuery ? (
        <label className="admin-search">
          <Search size={16} aria-hidden />
          <span className="sr-only">{placeholder}</span>
          <input type="search" value={query} placeholder={placeholder} onChange={(event) => onQuery(event.target.value)} />
        </label>
      ) : null}
      <span className="admin-toolbar__count" aria-live="polite">
        {shown === total ? `${total} ${total === 1 ? singular : plural}` : `${shown} de ${total} ${plural}`}
      </span>
      {action ? <div className="admin-toolbar__action">{action}</div> : null}
    </div>
  )
}

export function AdminEmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr className="admin-empty-row">
      <td colSpan={colSpan}>{children}</td>
    </tr>
  )
}

export function AdminStatus({ tone, children }: { tone: 'ok' | 'warn' | 'off'; children: React.ReactNode }) {
  return <span className={`admin-status admin-status--${tone}`}>{children}</span>
}

/** Row props that open the editor on click; buttons and links inside keep their own behavior. The edit button stays as the keyboard path. */
export function filaEditable(onEdit: () => void) {
  return {
    className: 'admin-row--editable',
    onClick: (event: React.MouseEvent<HTMLTableRowElement>) => {
      if ((event.target as HTMLElement).closest('button, a, input, [role="dialog"]')) return
      onEdit()
    },
  }
}
