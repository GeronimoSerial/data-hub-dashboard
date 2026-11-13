'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import type { VerificacionListada } from '@/lib/infraestructura/verificaciones'
import { useTextos } from '@/lib/i18n/idioma-provider'

// Cola de verificaciones del protocolo ENOS (batch E1). El monitoreo es
// continuo, no episódico (se descartó el episodio administrado a mano):
// crea solicitudes ancladas al período vigente, muestra el enlace público una
// sola vez, y permite cancelar y registrar respuestas asistidas. Toda
// mutación va por fetch contra los endpoints ya construidos (el proyecto no
// usa server actions).
//
// `tokenHash` no forma parte de lo que la UI necesita ni debe mostrar: se
// omite del tipo para que sea imposible renderizarlo por accidente.
// `enlaceVencido` lo calcula el servidor (listarVerificaciones) contra la
// credencial real; la UI no la recalcula.
export type VerificacionVisible = Omit<VerificacionListada, 'tokenHash'>

export type EstadoVisible =
  | 'pendiente'
  | 'pendiente_vencida'
  | 'enlace_vencido'
  | 'respondida_sin_afectacion'
  | 'respondida_con_afectacion'
  | 'respondida_no_disponible'
  | 'cancelada'

// "Vencida" es una derivación de lectura (vencimientoEn vs. ahora), nunca un
// estado persistido: el modelo sólo guarda 'pendiente' | 'respondida' |
// 'cancelada'. Mismo criterio que el dominio. "Enlace vencido" gana sobre
// "Vencida": una pendiente cuyo enlace ya no sirve se lee como tal.
export function estadoVisible(
  v: VerificacionVisible,
  ahora: Date = new Date(),
): EstadoVisible {
  if (v.estado === 'cancelada') return 'cancelada'
  if (v.estado === 'respondida') {
    if (v.resultado === 'con_afectacion') return 'respondida_con_afectacion'
    if (v.resultado === 'no_disponible') return 'respondida_no_disponible'
    return 'respondida_sin_afectacion'
  }
  if (v.enlaceVencido) return 'enlace_vencido'
  if (v.vencimientoEn && new Date(v.vencimientoEn).getTime() < ahora.getTime()) {
    return 'pendiente_vencida'
  }
  return 'pendiente'
}

function colorEstado(estado: EstadoVisible): string {
  if (
    estado === 'pendiente_vencida' ||
    estado === 'enlace_vencido' ||
    estado === 'respondida_con_afectacion'
  ) {
    return 'var(--danger)'
  }
  if (estado === 'cancelada') return 'var(--ink-faint)'
  return 'var(--ink-soft)'
}

const panel: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '1rem',
  marginBottom: '1.5rem',
  background: 'var(--fill)',
}
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
const celda: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem',
  borderBottom: '1px solid var(--line)',
  verticalAlign: 'top',
}
const input: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 4,
  padding: '0.4rem 0.5rem',
  color: 'var(--ink)',
  background: 'var(--card)',
}
const boton: React.CSSProperties = {
  border: '1px solid var(--action)',
  borderRadius: 4,
  padding: '0.4rem 0.75rem',
  background: 'var(--action)',
  color: 'var(--white)',
  cursor: 'pointer',
}
const botonSecundario: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 4,
  padding: '0.4rem 0.75rem',
  background: 'var(--card)',
  color: 'var(--ink)',
  cursor: 'pointer',
}
const alerta: React.CSSProperties = {
  color: 'var(--danger)',
  background: 'var(--danger-tint)',
  padding: '0.5rem 0.75rem',
  borderRadius: 4,
  margin: '0.5rem 0 0',
}
const notaDiscrepancia: React.CSSProperties = {
  display: 'block',
  marginTop: '0.25rem',
  color: 'var(--danger)',
}

type Props = {
  verificacionesIniciales: VerificacionVisible[]
}

export function VerificacionesCola({ verificacionesIniciales }: Props) {
  const t = useTextos().parteVerificaciones.cola
  const etiquetas: Record<EstadoVisible, string> = {
    ...t.estados,
    pendiente_vencida: 'Vencida',
    cancelada: 'Cancelada',
  }
  const [verificaciones, setVerificaciones] = useState(verificacionesIniciales)
  const [cue, setCue] = useState('')
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState<string | null>(null)
  const [enlaceCreado, setEnlaceCreado] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [accionError, setAccionError] = useState<Record<string, string>>({})
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState<string | null>(null)

  // Refetch best-effort: si falla, se conserva el último listado conocido y la
  // acción ya reportó su propio resultado.
  async function refrescar() {
    try {
      const respuesta = await fetch('/api/infraestructura/verificaciones')
      if (!respuesta.ok) return
      const cuerpo = await respuesta.json().catch(() => null)
      if (cuerpo?.verificaciones) setVerificaciones(cuerpo.verificaciones)
    } catch {
      // sin ruido: la UI no debe romperse por un refetch fallido
    }
  }

  async function manejarCrear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (creando || cue.trim().length === 0) return
    setCreando(true)
    setErrorCrear(null)
    setEnlaceCreado(null)
    setCopiado(false)
    try {
      const respuesta = await fetch('/api/infraestructura/verificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cueAnexo: cue.trim() }),
      })
      const cuerpo = await respuesta.json().catch(() => null)
      if (!respuesta.ok) {
        setErrorCrear(cuerpo?.error ?? t.errorCrear)
        setCreando(false)
        return
      }
      // El token en claro sólo existe en esta respuesta. Se compone el enlace
      // público una vez y se guarda únicamente para que el operador lo copie.
      const enlace = `${window.location.origin}/problematicas/verificaciones/${cuerpo.verificacion.id}?token=${cuerpo.token}`
      setEnlaceCreado(enlace)
      setCue('')
      setCreando(false)
      await refrescar()
    } catch {
      setErrorCrear(t.errorCrear)
      setCreando(false)
    }
  }

  async function copiarEnlace() {
    if (!enlaceCreado) return
    try {
      await navigator.clipboard.writeText(enlaceCreado)
      setCopiado(true)
    } catch {
      // Clipboard no disponible: no rompemos la UI.
    }
  }

  async function cancelar(id: string) {
    if (cancelando) return
    if (!window.confirm(t.confirmarCancelacion)) return
    setCancelando(id)
    setAccionError((prev) => {
      const siguiente = { ...prev }
      delete siguiente[id]
      return siguiente
    })
    try {
      const respuesta = await fetch(`/api/infraestructura/verificaciones/${id}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const cuerpo = await respuesta.json().catch(() => null)
      if (!respuesta.ok) {
        setAccionError((prev) => ({
          ...prev,
          [id]: cuerpo?.error ?? t.errorCancelar,
        }))
        setCancelando(null)
        return
      }
      setCancelando(null)
      await refrescar()
    } catch {
      setAccionError((prev) => ({ ...prev, [id]: t.errorCancelar }))
      setCancelando(null)
    }
  }

  function reportarError(id: string, mensaje: string) {
    setAccionError((prev) => ({ ...prev, [id]: mensaje }))
  }

  return (
    <section style={panel}>
      <h2 style={{ marginTop: 0 }}>{t.titulo}</h2>

      <form
        onSubmit={manejarCrear}
        style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label htmlFor="verificacion-cue">CUE-anexo</label>
          <input
            id="verificacion-cue"
            type="text"
            style={input}
            value={cue}
            onChange={(evento) => setCue(evento.target.value)}
            disabled={creando}
          />
        </div>
        <button
          type="submit"
          style={boton}
          disabled={creando || cue.trim().length === 0}
        >
          {t.crear}
        </button>
      </form>

      {errorCrear && (
        <p role="alert" style={alerta}>
          {errorCrear}
        </p>
      )}

      {enlaceCreado && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.25rem', color: 'var(--ink-soft)', fontSize: 'var(--t-small)' }}>
            {t.enlaceUnaVez}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input type="text" readOnly value={enlaceCreado} style={{ ...input, flex: 1 }} />
            <button type="button" style={botonSecundario} onClick={copiarEnlace}>
              {t.copiarEnlace}
            </button>
          </div>
          {copiado && <p style={{ margin: '0.25rem 0 0', color: 'var(--ink-soft)' }}>{t.enlaceCopiado}</p>}
        </div>
      )}

      {verificaciones.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>{t.sinSolicitudes}</p>
      ) : (
        <table style={tabla}>
          <thead>
            <tr>
              <th style={celda}>CUE</th>
              <th style={celda}>Estado</th>
              <th style={celda}>Solicitada</th>
              <th style={celda}>Respondida</th>
              <th style={celda}>{t.columnas.acciones}</th>
            </tr>
          </thead>
          <tbody>
            {verificaciones.map((v) => {
              const estado = estadoVisible(v)
              // Un enlace vencido no cierra la solicitud: sigue pendiente y
              // admite cancelar o responder de forma asistida.
              const pendiente =
                estado === 'pendiente' ||
                estado === 'pendiente_vencida' ||
                estado === 'enlace_vencido'
              return (
                <tr key={v.id}>
                  <td style={celda}>{v.cueAnexo}</td>
                  <td style={celda}>
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        marginRight: 6,
                        borderRadius: '50%',
                        background: colorEstado(estado),
                      }}
                    />
                    {etiquetas[estado]}
                    {Boolean(v.discrepancia) && (
                      <span style={notaDiscrepancia}>
                        {t.discrepancia}
                      </span>
                    )}
                  </td>
                  <td style={celda}>{v.solicitadaEn}</td>
                  <td style={celda}>{v.respondidaEn ?? '—'}</td>
                  <td style={celda}>
                    {pendiente && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            style={botonSecundario}
                            onClick={() => cancelar(v.id)}
                            disabled={cancelando === v.id}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            style={botonSecundario}
                            onClick={() => setFilaAbierta(filaAbierta === v.id ? null : v.id)}
                          >
                            {filaAbierta === v.id ? t.ocultarAsistida : t.registrarAsistida}
                          </button>
                        </div>
                        {filaAbierta === v.id && (
                          <RespuestaAsistidaForm
                            verificacionId={v.id}
                            onEnviado={async () => {
                              setFilaAbierta(null)
                              await refrescar()
                            }}
                            onError={(mensaje) => reportarError(v.id, mensaje)}
                          />
                        )}
                        {accionError[v.id] && (
                          <p role="alert" style={{ ...alerta, margin: 0 }}>
                            {accionError[v.id]}
                          </p>
                        )}
                      </div>
                    )}
                    {!pendiente && accionError[v.id] && (
                      <p role="alert" style={{ ...alerta, margin: 0 }}>
                        {accionError[v.id]}
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

// Carga asistida: el operador registra la respuesta que el director dio por
// teléfono/whatsapp/presencial. 'con_afectacion' NO se ofrece acá: esa
// respuesta se resuelve desde el formulario de parte de la ficha de la escuela
// y el endpoint la rechaza por esta vía.
function RespuestaAsistidaForm({
  verificacionId,
  onEnviado,
  onError,
}: {
  verificacionId: string
  onEnviado: () => Promise<void> | void
  onError: (mensaje: string) => void
}) {
  const t = useTextos().parteVerificaciones.asistida
  const [canal, setCanal] = useState('telefono')
  const [resultado, setResultado] = useState('sin_afectacion')
  const [observacion, setObservacion] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    setEnviando(true)
    try {
      const respuesta = await fetch(
        `/api/infraestructura/verificaciones/${verificacionId}/responder-asistida`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canal, resultado, observacion }),
        },
      )
      const cuerpo = await respuesta.json().catch(() => null)
      if (!respuesta.ok) {
        onError(cuerpo?.error ?? t.registrar)
        setEnviando(false)
        return
      }
      setEnviando(false)
      await onEnviado()
    } catch {
      onError(t.registrar)
      setEnviando(false)
    }
  }

  return (
    <form
      onSubmit={manejarEnvio}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        alignItems: 'flex-end',
        border: '1px solid var(--line)',
        borderRadius: 4,
        padding: '0.5rem',
        background: 'var(--card)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label htmlFor={`canal-${verificacionId}`}>Canal</label>
        <select
          id={`canal-${verificacionId}`}
          value={canal}
          onChange={(evento) => setCanal(evento.target.value)}
          disabled={enviando}
        >
          <option value="telefono">{t.canales.telefono}</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="presencial">Presencial</option>
          <option value="otro">{t.canales.otro}</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label htmlFor={`resultado-${verificacionId}`}>Resultado</label>
        <select
          id={`resultado-${verificacionId}`}
          value={resultado}
          onChange={(evento) => setResultado(evento.target.value)}
          disabled={enviando}
        >
          <option value="sin_afectacion">{t.sinAfectacion}</option>
          <option value="no_disponible">{t.noDisponible}</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 14rem' }}>
        <label htmlFor={`observacion-${verificacionId}`}>{t.observacion}</label>
        <input
          id={`observacion-${verificacionId}`}
          type="text"
          value={observacion}
          onChange={(evento) => setObservacion(evento.target.value)}
          disabled={enviando}
          required
        />
      </div>

      <button type="submit" style={boton} disabled={enviando}>
        {t.registrar}
      </button>
    </form>
  )
}
