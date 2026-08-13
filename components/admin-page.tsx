'use client'

import * as React from 'react'
import {
  makeStyles,
  tokens,
  typographyStyles,
  Badge,
  Body1,
  Button,
  Caption1,
  Checkbox,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tag,
  TagGroup,
  Textarea,
  Title3,
  Tooltip,
  type SelectTabData,
  type SelectTabEvent,
} from '@fluentui/react-components'
import {
  Add20Regular,
  Delete20Regular,
  Edit20Regular,
} from '@fluentui/react-icons'
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

function slugId(nombre: string) {
  const base = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `${base || 'item'}-${Math.random().toString(36).slice(2, 6)}`
}

const useStyles = makeStyles({
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalL,
  },
  eyebrow: {
    ...typographyStyles.caption1Strong,
    letterSpacing: '1.2px',
    color: tokens.colorBrandForeground1,
  },
  intro: { color: tokens.colorNeutralForeground2, maxWidth: '680px' },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalL,
    marginBottom: tokens.spacingVerticalM,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  formGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: '320px',
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
})

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
  const styles = useStyles()
  const { niveles, tipos, categorias, tags, upsertRecurso } = useHubData()

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
  }
  const [draft, setDraft] = React.useState<Recurso>(empty)

  React.useEffect(() => {
    setDraft(editing ? { ...editing } : empty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, open])

  // Tipos válidos para el formato elegido (consistencia del modelo)
  const tiposValidos = tipos.filter((t) => t.aplicaA.includes(draft.formato))

  const set = <K extends keyof Recurso>(k: K, v: Recurso[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const save = () => {
    const tipoOk = tiposValidos.some((t) => t.id === draft.tipoId)
    const toSave: Recurso = {
      ...draft,
      id: draft.id || slugId(draft.titulo),
      tipoId: tipoOk ? draft.tipoId : (tiposValidos[0]?.id ?? ''),
      actualizado: new Date().toISOString().slice(0, 10),
    }
    upsertRecurso(toSave)
    onClose()
  }

  const valido =
    draft.titulo.trim().length > 0 && tiposValidos.length > 0 && draft.categoriaId

  return (
    <Dialog open={open} onOpenChange={(_e, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>
            {editing ? 'Editar recurso' : 'Nuevo recurso'}
          </DialogTitle>
          <DialogContent>
            <div className={styles.formGrid}>
              <Field label="Título" required>
                <Input
                  value={draft.titulo}
                  onChange={(_e, d) => set('titulo', d.value)}
                  placeholder="Ej.: Boletín de matrícula 2026"
                />
              </Field>
              <Field label="Descripción">
                <Textarea
                  value={draft.descripcion}
                  onChange={(_e, d) => set('descripcion', d.value)}
                  resize="vertical"
                />
              </Field>

              <div className={styles.twoCol}>
                <Field label="Tipo de contenido" required>
                  <Dropdown
                    selectedOptions={[draft.formato]}
                    value={FORMATOS[draft.formato].label}
                    onOptionSelect={(_e, d) => {
                      const f = d.optionValue as Formato
                      const nextTipo = tipos.find((t) =>
                        t.aplicaA.includes(f),
                      )
                      setDraft((prev) => ({
                        ...prev,
                        formato: f,
                        tipoId: nextTipo?.id ?? '',
                      }))
                    }}
                  >
                    {(Object.keys(FORMATOS) as Formato[]).map((f) => (
                      <Option key={f} value={f} text={FORMATOS[f].label}>
                        {FORMATOS[f].label}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>

                <Field label="Nivel" required>
                  <Dropdown
                    selectedOptions={[draft.nivelId]}
                    value={nivelNombre(niveles, draft.nivelId)}
                    onOptionSelect={(_e, d) =>
                      set('nivelId', d.optionValue as string)
                    }
                  >
                    {[...niveles]
                      .sort((a, b) => a.orden - b.orden)
                      .map((n) => (
                        <Option key={n.id} value={n.id} text={n.nombre}>
                          {n.nombre}
                        </Option>
                      ))}
                  </Dropdown>
                </Field>
              </div>

              <div className={styles.twoCol}>
                <Field
                  label="Tipo"
                  required
                  hint="Depende del tipo de contenido"
                >
                  <Dropdown
                    selectedOptions={[draft.tipoId]}
                    value={tipoNombre(tipos, draft.tipoId)}
                    onOptionSelect={(_e, d) =>
                      set('tipoId', d.optionValue as string)
                    }
                  >
                    {tiposValidos.map((t) => (
                      <Option key={t.id} value={t.id} text={t.nombre}>
                        {t.nombre}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>

                <Field label="Categoría (TAG principal)" required>
                  <Dropdown
                    selectedOptions={[draft.categoriaId]}
                    value={
                      findCategoria(categorias, draft.categoriaId)?.nombre ?? ''
                    }
                    onOptionSelect={(_e, d) =>
                      set('categoriaId', d.optionValue as string)
                    }
                  >
                    {categorias.map((c) => (
                      <Option key={c.id} value={c.id} text={c.nombre}>
                        {c.nombre}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
              </div>

              <Field label="Etiquetas">
                <Combobox
                  multiselect
                  placeholder="Seleccione etiquetas"
                  selectedOptions={draft.tagIds}
                  value={draft.tagIds
                    .map((id) => tags.find((t) => t.id === id)?.nombre)
                    .filter(Boolean)
                    .join(', ')}
                  onOptionSelect={(_e, d) => set('tagIds', d.selectedOptions)}
                >
                  {tags.map((t) => (
                    <Option key={t.id} value={t.id} text={t.nombre}>
                      {t.nombre}
                    </Option>
                  ))}
                </Combobox>
              </Field>

              <div className={styles.twoCol}>
                <Field label="Área responsable">
                  <Input
                    value={draft.area}
                    onChange={(_e, d) => set('area', d.value)}
                  />
                </Field>
                <Field label="Estado">
                  <Checkbox
                    label="Publicado"
                    checked={draft.estado === 'publicado'}
                    onChange={(_e, d) =>
                      set('estado', d.checked ? 'publicado' : 'borrador')
                    }
                  />
                </Field>
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button appearance="primary" disabled={!valido} onClick={save}>
              Guardar
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

// ── Recursos table ─────────────────────────────────────────────────────────

function RecursosAdmin() {
  const styles = useStyles()
  const { recursos, niveles, tipos, categorias, removeRecurso } = useHubData()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Recurso | null>(null)

  const nuevo = () => {
    setEditing(null)
    setOpen(true)
  }
  const editar = (r: Recurso) => {
    setEditing(r)
    setOpen(true)
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <Caption1>{recursos.length} recursos en el Hub</Caption1>
        <Button appearance="primary" icon={<Add20Regular />} onClick={nuevo}>
          Nuevo recurso
        </Button>
      </div>

      <Table aria-label="Recursos" size="small">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Recurso</TableHeaderCell>
            <TableHeaderCell>Contenido</TableHeaderCell>
            <TableHeaderCell>Nivel</TableHeaderCell>
            <TableHeaderCell>Tipo</TableHeaderCell>
            <TableHeaderCell>Categoría</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Actualizado</TableHeaderCell>
            <TableHeaderCell>Acciones</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recursos.map((r) => {
            const cat = findCategoria(categorias, r.categoriaId)
            return (
              <TableRow key={r.id}>
                <TableCell>
                  <TableCellLayout>{r.titulo}</TableCellLayout>
                </TableCell>
                <TableCell>
                  <Badge appearance="filled" color={FORMATOS[r.formato].color}>
                    {FORMATOS[r.formato].label}
                  </Badge>
                </TableCell>
                <TableCell>{nivelNombre(niveles, r.nivelId)}</TableCell>
                <TableCell>{tipoNombre(tipos, r.tipoId)}</TableCell>
                <TableCell>
                  {cat ? (
                    <Badge appearance="tint" color={cat.color}>
                      {cat.nombre}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    appearance="outline"
                    color={r.estado === 'publicado' ? 'success' : 'warning'}
                  >
                    {r.estado === 'publicado' ? 'Publicado' : 'Borrador'}
                  </Badge>
                </TableCell>
                <TableCell>{formatearFecha(r.actualizado)}</TableCell>
                <TableCell>
                  <div className={styles.actions}>
                    <Tooltip content="Editar" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<Edit20Regular />}
                        aria-label="Editar"
                        onClick={() => editar(r)}
                      />
                    </Tooltip>
                    <Tooltip content="Eliminar" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<Delete20Regular />}
                        aria-label="Eliminar"
                        onClick={() => removeRecurso(r.id)}
                      />
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

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
  onSave: (values: Record<string, unknown>) => void
}) {
  const styles = useStyles()
  const [values, setValues] = React.useState<Record<string, unknown>>(initial)

  React.useEffect(() => {
    setValues(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (k: string, v: unknown) =>
    setValues((prev) => ({ ...prev, [k]: v }))

  const nombreOk =
    typeof values.nombre === 'string' && values.nombre.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={(_e, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <div className={styles.formGrid}>
              {fields.map((f) => {
                if (f.type === 'color') {
                  const current = (values[f.key] as BadgeColor) ?? 'brand'
                  return (
                    <Field key={f.key} label={f.label} hint={f.hint}>
                      <Dropdown
                        selectedOptions={[current]}
                        value={current}
                        onOptionSelect={(_e, d) =>
                          set(f.key, d.optionValue as string)
                        }
                      >
                        {COLORS.map((c) => (
                          <Option key={c} value={c} text={c}>
                            {c}
                          </Option>
                        ))}
                      </Dropdown>
                    </Field>
                  )
                }
                if (f.type === 'formatos') {
                  const current = (values[f.key] as Formato[]) ?? []
                  return (
                    <Field key={f.key} label={f.label} hint={f.hint}>
                      <div className={styles.actions}>
                        {(Object.keys(FORMATOS) as Formato[]).map((fmt) => (
                          <Checkbox
                            key={fmt}
                            label={FORMATOS[fmt].label}
                            checked={current.includes(fmt)}
                            onChange={(_e, d) =>
                              set(
                                f.key,
                                d.checked
                                  ? [...current, fmt]
                                  : current.filter((x) => x !== fmt),
                              )
                            }
                          />
                        ))}
                      </div>
                    </Field>
                  )
                }
                return (
                  <Field key={f.key} label={f.label} hint={f.hint} required={f.key === 'nombre'}>
                    <Input
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={String(values[f.key] ?? '')}
                      onChange={(_e, d) =>
                        set(
                          f.key,
                          f.type === 'number' ? Number(d.value) : d.value,
                        )
                      }
                    />
                  </Field>
                )
              })}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              appearance="primary"
              disabled={!nombreOk}
              onClick={() => {
                onSave(values)
                onClose()
              }}
            >
              Guardar
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

// ── Taxonomy table wrapper ─────────────────────────────────────────────────

function TaxonomyAdmin<T extends { id: string }>({
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
  const styles = useStyles()
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

  return (
    <div>
      <div className={styles.toolbar}>
        <Caption1>
          {items.length} {items.length === 1 ? singular : `${singular}s`}
        </Caption1>
        <Button appearance="primary" icon={<Add20Regular />} onClick={nuevo}>
          Agregar {singular}
        </Button>
      </div>

      <Table aria-label={`Administración de ${singular}`} size="small">
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHeaderCell key={c.header}>{c.header}</TableHeaderCell>
            ))}
            <TableHeaderCell>En uso</TableHeaderCell>
            <TableHeaderCell>Acciones</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const uses = inUse(item.id)
            return (
              <TableRow key={item.id}>
                {columns.map((c) => (
                  <TableCell key={c.header}>
                    <TableCellLayout>{c.render(item)}</TableCellLayout>
                  </TableCell>
                ))}
                <TableCell>
                  <Badge appearance="ghost" color={uses ? 'brand' : 'subtle'}>
                    {uses} {uses === 1 ? 'recurso' : 'recursos'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className={styles.actions}>
                    <Tooltip content="Editar" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<Edit20Regular />}
                        aria-label="Editar"
                        onClick={() => editar(item)}
                      />
                    </Tooltip>
                    <Tooltip
                      content={
                        uses
                          ? 'No se puede eliminar: hay recursos asociados'
                          : 'Eliminar'
                      }
                      relationship="label"
                    >
                      <Button
                        appearance="subtle"
                        icon={<Delete20Regular />}
                        aria-label="Eliminar"
                        disabled={uses > 0}
                        onClick={() => onDelete(item.id)}
                      />
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

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

// ── Admin page ─────────────────────────────────────────────────────────────

export function AdminPage() {
  const styles = useStyles()
  const {
    recursos,
    niveles,
    tipos,
    categorias,
    tags,
    upsertNivel,
    removeNivel,
    upsertTipo,
    removeTipo,
    upsertCategoria,
    removeCategoria,
    upsertTag,
    removeTag,
  } = useHubData()

  const [tab, setTab] = React.useState('recursos')
  const onTab = (_e: SelectTabEvent, d: SelectTabData) =>
    setTab(d.value as string)

  const usoNivel = (id: string) =>
    recursos.filter((r) => r.nivelId === id).length
  const usoTipo = (id: string) => recursos.filter((r) => r.tipoId === id).length
  const usoCategoria = (id: string) =>
    recursos.filter((r) => r.categoriaId === id).length
  const usoTag = (id: string) =>
    recursos.filter((r) => r.tagIds.includes(id)).length

  return (
    <div>
      <div className={styles.header}>
        <span className={styles.eyebrow}>GESTIÓN DEL HUB</span>
        <Title3 as="h1">Administración</Title3>
        <Body1 className={styles.intro}>
          Gestione los recursos y las taxonomías del Hub. La administración
          respeta el mismo modelo de información que las vistas públicas: los
          recursos referencian niveles, tipos, categorías y etiquetas, sin
          duplicar estructuras.
        </Body1>
      </div>

      <MessageBar intent="info">
        <MessageBarBody>
          <MessageBarTitle>Modelo único</MessageBarTitle>
          Cada recurso tiene un tipo de contenido (Reporte, Tablero o Mapa) y
          referencia una sola vez cada taxonomía. Las taxonomías en uso no
          pueden eliminarse para preservar la integridad.
        </MessageBarBody>
      </MessageBar>

      <div style={{ height: tokens.spacingVerticalL }} />

      <TabList selectedValue={tab} onTabSelect={onTab}>
        <Tab value="recursos">Recursos</Tab>
        <Tab value="categorias">Categorías</Tab>
        <Tab value="tags">Etiquetas</Tab>
        <Tab value="niveles">Niveles</Tab>
        <Tab value="tipos">Tipos</Tab>
      </TabList>

      <Divider style={{ marginTop: tokens.spacingVerticalM }} />
      <div style={{ height: tokens.spacingVerticalM }} />

      {tab === 'recursos' && <RecursosAdmin />}

      {tab === 'categorias' && (
        <TaxonomyAdmin<Categoria>
          singular="categoría"
          items={categorias}
          inUse={usoCategoria}
          columns={[
            {
              header: 'Categoría',
              render: (c) => (
                <Badge appearance="tint" color={c.color}>
                  {c.nombre}
                </Badge>
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
      )}

      {tab === 'tags' && (
        <TaxonomyAdmin<TagModel>
          singular="etiqueta"
          items={tags}
          inUse={usoTag}
          columns={[
            {
              header: 'Etiqueta',
              render: (t) => (
                <TagGroup aria-label="etiqueta">
                  <Tag size="small" appearance="outline">
                    {t.nombre}
                  </Tag>
                </TagGroup>
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
      )}

      {tab === 'niveles' && (
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
      )}

      {tab === 'tipos' && (
        <TaxonomyAdmin<Tipo>
          singular="tipo"
          items={tipos}
          inUse={usoTipo}
          columns={[
            { header: 'Tipo', render: (t) => t.nombre },
            {
              header: 'Aplica a',
              render: (t) => (
                <div className={styles.actions}>
                  {t.aplicaA.map((f) => (
                    <Badge key={f} appearance="tint" color={FORMATOS[f].color}>
                      {FORMATOS[f].label}
                    </Badge>
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
      )}
    </div>
  )
}
