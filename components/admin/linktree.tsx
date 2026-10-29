'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, ExternalLink, Pencil } from 'lucide-react'
import { ConfirmDelete } from '@/components/confirm-delete'
import {
  AdminEmptyRow,
  AdminField,
  AdminListToolbar,
  BotonEditar,
  DialogActions,
  FormDialog,
  SelectField,
  filaEditable,
  leerErrorApi,
  useEditorDialog,
} from '@/components/admin/shared'
import { ICONOS_UI } from '@/components/linktree/iconos'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { SegmentedGroup, SegmentedItem } from '@/components/ui/toggle-group'
import {
  ACENTOS,
  ICONOS,
  LIMITES,
  configSchema,
  urlSegura,
  type Acento,
  type Icono,
  type LinktreeConfig,
  type LinktreeEnlace,
  type LinktreeGrupo,
} from '@/lib/linktree/config'
import {
  agregarGrupo,
  alternarVisible,
  eliminarEnlace,
  eliminarGrupo,
  guardarEnlace,
  moverEnlace,
  moverGrupo,
  renombrarGrupo,
  totalEnlaces,
} from '@/lib/linktree/editar'
import styles from './linktree.module.css'

const ETIQUETA_ACENTO: Record<Acento, string> = {
  amarillo: 'Amarillo',
  celeste: 'Celeste',
  verde: 'Verde',
  bordo: 'Bordó',
}

type EnlaceEnEdicion = { enlace: LinktreeEnlace; grupoId: string }

function GrupoForm({
  editing,
  onClose,
  onGuardar,
}: {
  editing: LinktreeGrupo | null
  onClose: () => void
  onGuardar: (titulo: string) => void
}) {
  const [titulo, setTitulo] = React.useState(editing?.titulo ?? '')
  const valido = titulo.trim().length > 0
  const guardar = () => {
    onGuardar(titulo.trim())
    onClose()
  }
  return (
    <DialogContent className="admin-sheet">
      <DialogTitle className="admin-form__title">{editing ? 'Editar grupo' : 'Nuevo grupo'}</DialogTitle>
      <div className="ui-form-grid">
        <AdminField label="Título" required>
          <Input value={titulo} maxLength={LIMITES.grupoTitulo} onChange={(event) => setTitulo(event.currentTarget.value)} />
        </AdminField>
      </div>
      <DialogActions onClose={onClose} onSave={guardar} disabled={!valido} />
    </DialogContent>
  )
}

function EnlaceForm({
  editing,
  grupos,
  grupoInicial,
  onClose,
  onGuardar,
}: {
  editing: EnlaceEnEdicion | null
  grupos: LinktreeGrupo[]
  grupoInicial: string
  onClose: () => void
  onGuardar: (grupoId: string, enlace: LinktreeEnlace) => void
}) {
  const origen = editing?.enlace
  const [titulo, setTitulo] = React.useState(origen?.titulo ?? '')
  const [descripcion, setDescripcion] = React.useState(origen?.descripcion ?? '')
  const [url, setUrl] = React.useState(origen?.url ?? '')
  const [icono, setIcono] = React.useState<Icono | 'ninguno'>(origen?.icono ?? 'ninguno')
  const [grupoId, setGrupoId] = React.useState(editing?.grupoId ?? grupoInicial)

  const urlLimpia = url.trim()
  const urlInvalida = urlLimpia.length > 0 && !urlSegura(urlLimpia)
  const valido = titulo.trim().length > 0 && urlSegura(urlLimpia) && grupoId !== ''

  const guardar = () => {
    onGuardar(grupoId, {
      id: origen?.id ?? crypto.randomUUID(),
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      url: urlLimpia,
      icono: icono === 'ninguno' ? null : icono,
      visible: origen?.visible ?? true,
    })
    onClose()
  }

  return (
    <DialogContent className="admin-sheet">
      <DialogTitle className="admin-form__title">{origen ? 'Editar enlace' : 'Nuevo enlace'}</DialogTitle>
      <div className="ui-form-grid">
        <AdminField label="Título" required>
          <Input value={titulo} maxLength={LIMITES.titulo} onChange={(event) => setTitulo(event.currentTarget.value)} />
        </AdminField>
        <AdminField label="Descripción" hint="Opcional. Una línea que aclare para qué sirve.">
          <Input value={descripcion} maxLength={LIMITES.descripcion} onChange={(event) => setDescripcion(event.currentTarget.value)} />
        </AdminField>
        <AdminField
          label="URL"
          required
          hint="Empieza con https:// o con / para una página de este sitio."
          error={urlInvalida ? 'Ingresá una URL que empiece con http://, https:// o /.' : null}
        >
          <Input value={url} maxLength={LIMITES.url} inputMode="url" onChange={(event) => setUrl(event.currentTarget.value)} />
        </AdminField>
        <SelectField
          label="Ícono"
          value={icono}
          options={[
            { value: 'ninguno', label: 'Sin ícono' },
            ...ICONOS.map((id) => ({ value: id, label: ICONOS_UI[id].etiqueta })),
          ]}
          onChange={(value) => setIcono(value as Icono | 'ninguno')}
        />
        <SelectField
          label="Grupo"
          required
          value={grupoId}
          options={grupos.map((grupo) => ({ value: grupo.id, label: grupo.titulo }))}
          onChange={setGrupoId}
        />
      </div>
      <DialogActions onClose={onClose} onSave={guardar} disabled={!valido} />
    </DialogContent>
  )
}

function PanelEnlaces({ config, onChange }: { config: LinktreeConfig; onChange: (config: LinktreeConfig) => void }) {
  const dialogoGrupo = useEditorDialog<LinktreeGrupo>()
  const dialogoEnlace = useEditorDialog<EnlaceEnEdicion>()
  const hayGrupos = config.grupos.length > 0
  const total = totalEnlaces(config)
  const grupoConLugar = config.grupos.find((grupo) => grupo.enlaces.length < LIMITES.enlacesPorGrupo)

  return (
    <div className={styles.panel}>
      <AdminListToolbar
        total={total}
        singular="enlace"
        plural="enlaces"
        action={
          <>
            <Button variant="secondary" disabled={config.grupos.length >= LIMITES.grupos} onClick={dialogoGrupo.nuevo}>
              Agregar grupo
            </Button>
            <Button disabled={!grupoConLugar} onClick={dialogoEnlace.nuevo}>
              Agregar enlace
            </Button>
          </>
        }
      />

      {!hayGrupos ? (
        <div className="ui-messagebar ui-messagebar--info" role="status">
          Todavía no hay grupos. Creá el primero para empezar a cargar enlaces.
        </div>
      ) : null}

      {config.grupos.map((grupo, indice) => (
        <section className={styles.grupo} key={grupo.id} aria-labelledby={`admin-grupo-${grupo.id}`}>
          <div className={styles.grupoCabecera}>
            <h3 className={styles.grupoTitulo} id={`admin-grupo-${grupo.id}`}>{grupo.titulo}</h3>
            <div className="ui-actions">
              <Button variant="ghost" size="icon" aria-label={`Subir grupo ${grupo.titulo}`} disabled={indice === 0} onClick={() => onChange(moverGrupo(config, grupo.id, -1))}>
                <ArrowUp size={16} aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Bajar grupo ${grupo.titulo}`} disabled={indice === config.grupos.length - 1} onClick={() => onChange(moverGrupo(config, grupo.id, 1))}>
                <ArrowDown size={16} aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Renombrar grupo ${grupo.titulo}`} onClick={() => dialogoGrupo.editar(grupo)}>
                <Pencil size={16} aria-hidden />
              </Button>
              <ConfirmDelete
                title="¿Eliminar grupo?"
                description={
                  grupo.enlaces.length > 0
                    ? `Se eliminará el grupo y sus ${grupo.enlaces.length} ${grupo.enlaces.length === 1 ? 'enlace' : 'enlaces'}. El cambio se publica al guardar.`
                    : 'Se eliminará el grupo. El cambio se publica al guardar.'
                }
                onConfirm={() => onChange(eliminarGrupo(config, grupo.id))}
                triggerLabel={`Eliminar grupo ${grupo.titulo}`}
              />
            </div>
          </div>

          <div className="ui-table-wrap">
            <table className="ui-table" aria-label={`Enlaces de ${grupo.titulo}`}>
              <thead>
                <tr>
                  <th>Enlace</th>
                  <th>Visible</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {grupo.enlaces.map((enlace, posicion) => (
                  <tr key={enlace.id} {...filaEditable(() => dialogoEnlace.editar({ enlace, grupoId: grupo.id }))}>
                    <td>
                      <div className={styles.celda}>
                        <span className={styles.celdaTitulo}>{enlace.titulo}</span>
                        <span className={styles.celdaUrl}>{enlace.url}</span>
                      </div>
                    </td>
                    {/* Base UI's Switch is a span, not a button, so the row's click-to-edit would catch it. */}
                    <td data-label="Visible" onClick={(event) => event.stopPropagation()}>
                      <Switch
                        checked={enlace.visible}
                        aria-label={`Mostrar ${enlace.titulo}`}
                        onCheckedChange={(visible) => onChange(alternarVisible(config, enlace.id, visible))}
                      />
                    </td>
                    <td>
                      <div className="ui-actions">
                        <Button variant="ghost" size="icon" aria-label={`Subir ${enlace.titulo}`} disabled={posicion === 0} onClick={() => onChange(moverEnlace(config, enlace.id, -1))}>
                          <ArrowUp size={16} aria-hidden />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Bajar ${enlace.titulo}`} disabled={posicion === grupo.enlaces.length - 1} onClick={() => onChange(moverEnlace(config, enlace.id, 1))}>
                          <ArrowDown size={16} aria-hidden />
                        </Button>
                        <BotonEditar onClick={() => dialogoEnlace.editar({ enlace, grupoId: grupo.id })} />
                        <ConfirmDelete
                          title="¿Eliminar enlace?"
                          description="El enlace se quita de la página cuando guardes los cambios."
                          onConfirm={() => onChange(eliminarEnlace(config, enlace.id))}
                          triggerLabel={`Eliminar ${enlace.titulo}`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {grupo.enlaces.length === 0 ? (
                  <AdminEmptyRow colSpan={3}>Este grupo todavía no tiene enlaces.</AdminEmptyRow>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <FormDialog open={dialogoGrupo.open} onClose={dialogoGrupo.onClose}>
        <GrupoForm
          key={dialogoGrupo.editing?.id ?? 'nuevo'}
          editing={dialogoGrupo.editing}
          onClose={dialogoGrupo.onClose}
          onGuardar={(titulo) =>
            onChange(
              dialogoGrupo.editing
                ? renombrarGrupo(config, dialogoGrupo.editing.id, titulo)
                : agregarGrupo(config, crypto.randomUUID(), titulo),
            )
          }
        />
      </FormDialog>

      <FormDialog open={dialogoEnlace.open} onClose={dialogoEnlace.onClose}>
        <EnlaceForm
          key={dialogoEnlace.editing?.enlace.id ?? 'nuevo'}
          editing={dialogoEnlace.editing}
          grupos={config.grupos}
          grupoInicial={grupoConLugar?.id ?? ''}
          onClose={dialogoEnlace.onClose}
          onGuardar={(grupoId, enlace) => onChange(guardarEnlace(config, grupoId, enlace))}
        />
      </FormDialog>
    </div>
  )
}

function PanelPerfil({ config, onChange }: { config: LinktreeConfig; onChange: (config: LinktreeConfig) => void }) {
  return (
    <div className={`${styles.panel} ${styles.formulario}`}>
      <div className="ui-form-grid">
        <AdminField label="Título" required error={config.titulo.trim() ? null : 'El título es obligatorio.'}>
          <Input value={config.titulo} maxLength={LIMITES.titulo} onChange={(event) => onChange({ ...config, titulo: event.currentTarget.value })} />
        </AdminField>
        <AdminField label="Descripción" hint="Opcional. Aparece debajo del título.">
          <Textarea rows={3} value={config.subtitulo} maxLength={LIMITES.subtitulo} onChange={(event) => onChange({ ...config, subtitulo: event.currentTarget.value })} />
        </AdminField>
        <AdminField label="Texto al pie" hint="Opcional. Por ejemplo, un contacto de soporte.">
          <Input value={config.pie} maxLength={LIMITES.pie} onChange={(event) => onChange({ ...config, pie: event.currentTarget.value })} />
        </AdminField>
      </div>
    </div>
  )
}

function PanelApariencia({ config, onChange }: { config: LinktreeConfig; onChange: (config: LinktreeConfig) => void }) {
  return (
    <div className={`${styles.panel} ${styles.formulario}`}>
      <div className="ui-form-grid">
        <AdminField label="Color de acento" hint="Colores de la paleta oficial. Se ve al pasar el cursor sobre un enlace y bajo el título.">
          <SegmentedGroup aria-label="Color de acento" value={config.acento} onValueChange={(acento) => onChange({ ...config, acento: acento as Acento })}>
            {ACENTOS.map((acento) => (
              <SegmentedItem key={acento} value={acento}>{ETIQUETA_ACENTO[acento]}</SegmentedItem>
            ))}
          </SegmentedGroup>
        </AdminField>
        <Switch
          checked={config.mostrarLogo}
          onCheckedChange={(mostrarLogo) => onChange({ ...config, mostrarLogo })}
          label="Mostrar la firma del Gobierno de Corrientes"
        />
        <Switch
          checked={config.mostrarDominio}
          onCheckedChange={(mostrarDominio) => onChange({ ...config, mostrarDominio })}
          label="Mostrar el dominio de cada enlace"
        />
      </div>
    </div>
  )
}

type Carga = { estado: 'cargando' } | { estado: 'error'; mensaje: string } | { estado: 'listo' }
type Aviso = { tono: 'info' | 'error'; texto: string }

export function LinktreeAdmin() {
  const [carga, setCarga] = React.useState<Carga>({ estado: 'cargando' })
  const [config, setConfig] = React.useState<LinktreeConfig | null>(null)
  const [guardada, setGuardada] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  const [aviso, setAviso] = React.useState<Aviso | null>(null)
  const [pestana, setPestana] = React.useState('enlaces')

  React.useEffect(() => {
    let cancelado = false
    fetch('/api/linktree').then(
      async (res) => {
        const data = (await res.json().catch(() => null)) as (LinktreeConfig & { error?: unknown }) | null
        if (cancelado) return
        if (!res.ok || !data) {
          setCarga({ estado: 'error', mensaje: leerErrorApi(data, 'No se pudo cargar la configuración') })
          return
        }
        setConfig(data)
        setGuardada(JSON.stringify(data))
        setCarga({ estado: 'listo' })
      },
      () => {
        if (!cancelado) setCarga({ estado: 'error', mensaje: 'No se pudo conectar. Revisá tu conexión e intentá de nuevo.' })
      },
    )
    return () => {
      cancelado = true
    }
  }, [])

  const cambiar = (siguiente: LinktreeConfig) => {
    setConfig(siguiente)
    setAviso(null)
  }

  const guardar = async () => {
    if (!config) return
    setGuardando(true)
    setAviso(null)
    try {
      const res = await fetch('/api/linktree', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = (await res.json().catch(() => null)) as (LinktreeConfig & { error?: unknown }) | null
      if (!res.ok || !data) {
        setAviso({ tono: 'error', texto: leerErrorApi(data, 'No se pudieron guardar los cambios') })
        return
      }
      setConfig(data)
      setGuardada(JSON.stringify(data))
      setAviso({ tono: 'info', texto: 'Cambios guardados.' })
    } catch {
      setAviso({ tono: 'error', texto: 'No se pudo conectar. Revisá tu conexión e intentá de nuevo.' })
    } finally {
      setGuardando(false)
    }
  }

  if (carga.estado === 'cargando') {
    return <p className={styles.estado} role="status">Cargando configuración…</p>
  }
  if (carga.estado === 'error' || !config) {
    return (
      <div className="ui-messagebar ui-messagebar--error" role="alert">
        {carga.estado === 'error' ? carga.mensaje : 'No se pudo cargar la configuración'}
      </div>
    )
  }

  const sinGuardar = JSON.stringify(config) !== guardada
  const valida = configSchema.safeParse(config).success

  return (
    <div className={styles.modulo}>
      <div className={styles.barra}>
        <p className={styles.estado} aria-live="polite">
          {!valida ? 'Revisá los campos marcados antes de guardar.' : sinGuardar ? 'Hay cambios sin guardar.' : 'Todo guardado.'}
        </p>
        <a className="ui-button ui-button--secondary" href="/links" target="_blank" rel="noopener noreferrer">
          Ver página pública <ExternalLink size={16} aria-hidden />
          <span className="sr-only"> (se abre en una pestaña nueva)</span>
        </a>
        <Button disabled={!sinGuardar || !valida || guardando} onClick={() => void guardar()}>
          Guardar cambios
        </Button>
      </div>

      {aviso ? (
        <div className={`ui-messagebar ui-messagebar--${aviso.tono}`} role={aviso.tono === 'error' ? 'alert' : 'status'}>
          {aviso.texto}
        </div>
      ) : null}

      <Tabs value={pestana} onValueChange={(valor) => setPestana(String(valor))}>
        <TabsList>
          <TabsTab value="enlaces">Enlaces</TabsTab>
          <TabsTab value="perfil">Perfil</TabsTab>
          <TabsTab value="apariencia">Apariencia</TabsTab>
        </TabsList>
        <TabsPanel value="enlaces"><PanelEnlaces config={config} onChange={cambiar} /></TabsPanel>
        <TabsPanel value="perfil"><PanelPerfil config={config} onChange={cambiar} /></TabsPanel>
        <TabsPanel value="apariencia"><PanelApariencia config={config} onChange={cambiar} /></TabsPanel>
      </Tabs>
    </div>
  )
}
