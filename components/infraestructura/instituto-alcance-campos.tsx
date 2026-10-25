'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type JSX } from 'react'
import styles from '@/components/infraestructura/instituto-alcance.module.css'
import { AvisosConsistencia, type AfectacionBorrador } from '@/components/infraestructura/afectacion-campos'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/multi-select'
import { Opcion } from '@/components/ui/opcion'
import { Textarea } from '@/components/ui/textarea'
import type { Regla } from '@/lib/infraestructura/consistencia-parte'
import {
  alcanceInstituto,
  conAlumnoAlternado,
  conCarrerasElegidas,
  nombresDeCarreras,
  textoAlcanceInstituto,
  type AlumnoElegido,
  type CarreraElegible,
  type SeleccionInstituto,
} from '@/lib/infraestructura/parte/instituto-ui'

// Espera antes de consultar: evita un pedido por cada tecla.
const ESPERA_BUSQUEDA_MS = 300
// Un DNI completo tiene entre 6 y 9 dígitos: con menos, no se consulta.
const LARGO_MINIMO_DNI = 6
const MENSAJE_SIN_CONEXION =
  'Sin conexión: puede informar carreras completas y agregar alumnos después.'
const MENSAJE_ERROR_BUSQUEDA = 'No pudimos buscar alumnos. Intente nuevamente.'
const MENSAJE_LIMITADA =
  'Hay muchas búsquedas seguidas. Espere unos segundos y vuelva a intentar.'
const MENSAJE_SIN_RESULTADOS = 'No encontramos alumnos con esa búsqueda en las carreras elegidas.'
const MENSAJE_TRUNCADO =
  'Hay más coincidencias. Escriba más letras o el DNI completo para acotar la lista.'
const MENSAJE_DNI_INCOMPLETO = 'Ingrese el DNI completo'
const AYUDA_PREDETERMINADA = 'Si no elige alumnos, se informa la carrera completa.'
const MENSAJE_SIN_CARRERA = 'Elija primero una carrera para buscar alumnos.'

interface RespuestaBusqueda {
  ok?: boolean
  alumnos?: AlumnoElegido[]
  truncado?: boolean
  error?: string
}

// Resultado de una búsqueda, marcado con la clave de la consulta que lo produjo:
// un resultado de otra consulta nunca se muestra.
type EstadoBusqueda =
  | { clave: string; tipo: 'lista'; alumnos: AlumnoElegido[]; truncado: boolean }
  // Error del servidor para la consulta (p. ej. 400): no se reintenta igual.
  | { clave: string; tipo: 'error'; mensaje: string }
  // 429, 5xx o red caída: se ofrece reintentar.
  | { clave: string; tipo: 'reintentable'; mensaje: string }

function suscribirConexion(alCambiar: () => void): () => void {
  window.addEventListener('online', alCambiar)
  window.addEventListener('offline', alCambiar)
  return () => {
    window.removeEventListener('online', alCambiar)
    window.removeEventListener('offline', alCambiar)
  }
}

function hayConexion(): boolean {
  return navigator.onLine !== false
}

// En el servidor no hay navegador: se asume conexión, y el cliente corrige al hidratar.
function hayConexionEnServidor(): boolean {
  return true
}

function nombreAlumno(alumno: AlumnoElegido): string {
  return `${alumno.apellido}, ${alumno.nombre}`
}

function textoCantidad(cantidad: number): string {
  return cantidad === 1 ? '1 alumno encontrado' : `${cantidad} alumnos encontrados`
}

export interface InstitutoCamposAQuienAfectaProps {
  /** CUE del establecimiento: la búsqueda de alumnos se limita a sus carreras. */
  cue: string
  idPrefijo: string
  borrador: AfectacionBorrador
  carreras: CarreraElegible[]
  avisos?: Regla[]
  descripcionObligatoria?: boolean
  onChange: (siguiente: AfectacionBorrador) => void
  disabled?: boolean
}

/**
 * Paso "¿A quiénes afecta?" para institutos superiores: se eligen carreras y,
 * opcionalmente, alumnos dentro de ellas. Una carrera sin alumnos elegidos
 * cuenta completa (mismo criterio que el servidor). El buscador es uno solo:
 * DNI completo si son dígitos, apellido o nombre si son letras.
 */
export function InstitutoCamposAQuienAfecta({
  cue,
  idPrefijo,
  borrador,
  carreras,
  avisos = [],
  descripcionObligatoria = false,
  onChange,
  disabled = false,
}: InstitutoCamposAQuienAfectaProps): JSX.Element {
  const conexion = useSyncExternalStore(suscribirConexion, hayConexion, hayConexionEnServidor)
  const [consulta, setConsulta] = useState('')
  const [reintento, setReintento] = useState(0)
  const [busqueda, setBusqueda] = useState<EstadoBusqueda | null>(null)
  // Clave de la consulta vigente: una respuesta tardía de otra consulta no la pisa.
  const claveVigenteRef = useRef('')

  const seleccion: SeleccionInstituto = {
    carreras: borrador.carreras ?? [],
    alumnos: borrador.alumnos,
    alumnosElegidos: borrador.alumnosElegidos ?? [],
  }
  const termino = consulta.trim()
  const dniIncompleto = /^\d+$/.test(termino) && termino.length < LARGO_MINIMO_DNI
  const carrerasClave = seleccion.carreras.join(',')
  const clave = `${carrerasClave}|${termino}|${reintento}`
  const buscable = conexion && !disabled && seleccion.carreras.length > 0
  const consultable = buscable && termino !== '' && !dniIncompleto

  useEffect(() => {
    if (!consultable) return
    claveVigenteRef.current = clave
    const controlador = new AbortController()
    const responder = (estado: EstadoBusqueda) => {
      if (claveVigenteRef.current === clave) setBusqueda(estado)
    }
    const temporizador = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ cue, carreras: carrerasClave, q: termino })
          const respuesta = await fetch(`/api/problematicas/parte/matricula?${params.toString()}`, {
            signal: controlador.signal,
            cache: 'no-store',
          })
          if (respuesta.status === 429 || respuesta.status >= 500) {
            responder({ clave, tipo: 'reintentable', mensaje: respuesta.status === 429 ? MENSAJE_LIMITADA : MENSAJE_ERROR_BUSQUEDA })
            return
          }
          const cuerpo = (await respuesta.json().catch(() => null)) as RespuestaBusqueda | null
          if (!respuesta.ok || cuerpo?.ok !== true) {
            responder({
              clave,
              tipo: 'error',
              mensaje: typeof cuerpo?.error === 'string' ? cuerpo.error : MENSAJE_ERROR_BUSQUEDA,
            })
            return
          }
          responder({ clave, tipo: 'lista', alumnos: cuerpo.alumnos ?? [], truncado: cuerpo.truncado === true })
        } catch {
          if (!controlador.signal.aborted) responder({ clave, tipo: 'reintentable', mensaje: MENSAJE_ERROR_BUSQUEDA })
        }
      })()
    }, ESPERA_BUSQUEDA_MS)
    return () => {
      controlador.abort()
      window.clearTimeout(temporizador)
    }
  }, [clave, consultable, cue, carrerasClave, termino])

  const resultado = busqueda?.clave === clave ? busqueda : null
  const buscando = consultable && resultado === null
  const alcance = alcanceInstituto(seleccion.carreras, seleccion.alumnosElegidos, carreras)
  const carrerasElegidas = carreras.filter((carrera) => seleccion.carreras.includes(carrera.id))

  // Único texto de ayuda del buscador: también es la razón por la que está deshabilitado.
  const ayuda = !conexion
    ? MENSAJE_SIN_CONEXION
    : seleccion.carreras.length === 0
      ? MENSAJE_SIN_CARRERA
      : dniIncompleto
        ? MENSAJE_DNI_INCOMPLETO
        : AYUDA_PREDETERMINADA
  const idAyuda = `${idPrefijo}-buscar-ayuda`

  // Una sola región viva para el buscador: sólo anuncia el estado de la lista.
  let anuncio = ''
  if (buscando) anuncio = 'Buscando alumnos…'
  else if (resultado?.tipo === 'lista') anuncio = resultado.alumnos.length === 0 ? MENSAJE_SIN_RESULTADOS : textoCantidad(resultado.alumnos.length)

  function cambiarCarreras(valores: string[]) {
    onChange({ ...borrador, ...conCarrerasElegidas(seleccion, valores.map(Number)) })
  }

  function alternarAlumno(alumno: AlumnoElegido) {
    onChange({ ...borrador, ...conAlumnoAlternado(seleccion, alumno) })
  }

  return (
    <>
      <div className="afectacion-campos__grupo">
        <Label>Carreras afectadas</Label>
        <MultiSelect<string>
          value={seleccion.carreras.map(String)}
          onChange={cambiarCarreras}
          options={carreras.map((carrera) => ({ value: String(carrera.id), label: carrera.nombre }))}
          placeholder="Seleccione una o más carreras"
          ariaLabel="Carreras afectadas"
        />
        <p className="afectacion-borrador__resumen" aria-live="polite">
          {seleccion.carreras.length === 0 ? 'Ninguna carrera seleccionada' : textoAlcanceInstituto(alcance.carreras, alcance.alumnos)}
        </p>
      </div>

      <AvisosConsistencia reglas={avisos} campos={['alcance']} />

      <div className="afectacion-campos__grupo">
        <Label htmlFor={`${idPrefijo}-buscar-alumnos`}>Alumnos (opcional)</Label>
        <Input
          id={`${idPrefijo}-buscar-alumnos`}
          type="search"
          autoComplete="off"
          placeholder="Buscar por apellido, nombre o DNI completo"
          value={consulta}
          onChange={(evento) => setConsulta(evento.target.value)}
          disabled={!buscable}
          aria-describedby={idAyuda}
        />
        <p id={idAyuda} className={styles.ayuda}>{ayuda}</p>
        <p aria-live="polite" className={styles.ayuda}>{anuncio}</p>

        {resultado?.tipo === 'error' && <p role="alert">{resultado.mensaje}</p>}
        {resultado?.tipo === 'reintentable' && (
          <p role="alert">
            {resultado.mensaje}{' '}
            <button type="button" className="aviso-badge__accion" onClick={() => setReintento((n) => n + 1)}>
              Reintentar
            </button>
          </p>
        )}
        {resultado?.tipo === 'lista' && resultado.truncado && <p>{MENSAJE_TRUNCADO}</p>}
        {resultado?.tipo === 'lista' && resultado.alumnos.length > 0 && (
          <div className="afectacion-campos__opciones">
            {resultado.alumnos.map((alumno) => (
              <Opcion
                key={alumno.id}
                tipo="checkbox"
                checked={seleccion.alumnosElegidos.some((elegido) => elegido.id === alumno.id)}
                disabled={disabled}
                onChange={() => alternarAlumno(alumno)}
                label={nombreAlumno(alumno)}
                ayuda={nombresDeCarreras([alumno.carreraId], carreras)[0]}
                compacta
              />
            ))}
          </div>
        )}

        {carrerasElegidas.map((carrera) => {
          const elegidos = seleccion.alumnosElegidos.filter((alumno) => alumno.carreraId === carrera.id)
          return (
            <div key={carrera.id} className={styles.carrera}>
              <p className="afectacion-campos__subtitulo">{carrera.nombre}</p>
              {elegidos.length === 0 ? (
                <p className={styles.completa}>Toda la carrera ({carrera.totalAlumnos} alumnos)</p>
              ) : (
                <>
                  <p className={styles.completa}>
                    {elegidos.length} de {carrera.totalAlumnos} alumnos
                  </p>
                  <ul className={styles.chips}>
                    {elegidos.map((alumno) => (
                      <li key={alumno.id} className={styles.chip}>
                        <span>{nombreAlumno(alumno)}</span>
                        <button
                          type="button"
                          className={styles.quitar}
                          aria-label={`Quitar a ${nombreAlumno(alumno)}`}
                          disabled={disabled}
                          onClick={() => alternarAlumno(alumno)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="afectacion-campos__grupo">
        <Label htmlFor={`${idPrefijo}-descripcion`}>{descripcionObligatoria ? 'Descripción (obligatoria)' : 'Descripción (opcional)'}</Label>
        <Textarea
          id={`${idPrefijo}-descripcion`}
          maxLength={500}
          aria-required={descripcionObligatoria || undefined}
          value={borrador.descripcion}
          onChange={(evento) => onChange({ ...borrador, descripcion: evento.target.value })}
          disabled={disabled}
        />
      </div>
    </>
  )
}
