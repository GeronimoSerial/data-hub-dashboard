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
  etiquetasDeCarreras,
  nombresDeCarreras,
  contar,
  textoAlcanceInstituto,
  type AlumnoElegido,
  type CarreraElegible,
  type SeleccionInstituto,
} from '@/lib/infraestructura/parte/instituto-ui'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

// Espera antes de consultar: evita un pedido por cada tecla.
const ESPERA_BUSQUEDA_MS = 300
// Un DNI completo tiene entre 6 y 9 dígitos: con menos, no se consulta.
const LARGO_MINIMO_DNI = 6

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

/** Texto del disparador del selector de carreras con 2 o más elegidas. */
export function resumenCarreras(cantidad: number, t: Diccionario = es): string {
  return t.parteCampos.instituto.resumenCarreras(cantidad)
}

function textoCantidad(cantidad: number, t: Diccionario): string {
  return t.parteCampos.instituto.encontrados(cantidad)
}

export interface InstitutoCamposAQuienAfectaProps {
  /** CUE del establecimiento: la búsqueda de alumnos se limita a sus carreras. */
  cue: string
  idPrefijo: string
  borrador: AfectacionBorrador
  carreras: CarreraElegible[]
  avisos?: Regla[]
  descripcionObligatoria?: boolean
  /**
   * Si la categoría admite selección nominal (CATEGORIA_META.permiteAlumnos).
   * Sin ella no hay buscador de alumnos: la carrera cuenta completa. Con ella, cada carrera exige alumnos.
   */
  permiteAlumnos?: boolean
  /** Falso cuando el paso sólo elige alcance (actualizar): sin campo de descripción. */
  mostrarDescripcion?: boolean
  onChange: (siguiente: AfectacionBorrador) => void
  disabled?: boolean
}

/**
 * Paso "¿A quiénes afecta?" para institutos superiores: se eligen carreras y,
 * en las categorías con alumnos, al menos un alumno por carrera (igual que GE
 * por sección). Sin categoría de alumnos, la carrera cuenta completa. El buscador es uno solo:
 * DNI completo si son dígitos, apellido o nombre si son letras.
 */
export function InstitutoCamposAQuienAfecta({
  cue,
  idPrefijo,
  borrador,
  carreras,
  avisos = [],
  descripcionObligatoria = false,
  permiteAlumnos = true,
  mostrarDescripcion = true,
  onChange,
  disabled = false,
}: InstitutoCamposAQuienAfectaProps): JSX.Element {
  const dic = useTextos()
  const t = dic.parteCampos.instituto
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
  const buscable = permiteAlumnos && conexion && !disabled && seleccion.carreras.length > 0
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
            responder({ clave, tipo: 'reintentable', mensaje: respuesta.status === 429 ? t.limitada : t.errorBusqueda })
            return
          }
          const cuerpo = (await respuesta.json().catch(() => null)) as RespuestaBusqueda | null
          if (!respuesta.ok || cuerpo?.ok !== true) {
            responder({
              clave,
              tipo: 'error',
              mensaje: typeof cuerpo?.error === 'string' ? cuerpo.error : t.errorBusqueda,
            })
            return
          }
          responder({ clave, tipo: 'lista', alumnos: cuerpo.alumnos ?? [], truncado: cuerpo.truncado === true })
        } catch {
          if (!controlador.signal.aborted) responder({ clave, tipo: 'reintentable', mensaje: t.errorBusqueda })
        }
      })()
    }, ESPERA_BUSQUEDA_MS)
    return () => {
      controlador.abort()
      window.clearTimeout(temporizador)
    }
  }, [clave, consultable, cue, carrerasClave, termino, t])

  const resultado = busqueda?.clave === clave ? busqueda : null
  const buscando = consultable && resultado === null
  const alcance = alcanceInstituto(seleccion.carreras, seleccion.alumnosElegidos, carreras)
  const carrerasElegidas = carreras.filter((carrera) => seleccion.carreras.includes(carrera.id))
  const etiquetas = etiquetasDeCarreras(carreras)

  // Único texto de ayuda del buscador: también es la razón por la que está deshabilitado.
  const ayuda = !conexion
    ? t.sinConexion
    : seleccion.carreras.length === 0
      ? t.sinCarrera
      : dniIncompleto
        ? t.dniIncompleto
        : t.ayudaPredeterminada
  const idAyuda = `${idPrefijo}-buscar-ayuda`

  // Una sola región viva para el buscador: sólo anuncia el estado de la lista.
  let anuncio = ''
  if (buscando) anuncio = t.buscando
  else if (resultado?.tipo === 'lista') anuncio = resultado.alumnos.length === 0 ? t.sinResultados : textoCantidad(resultado.alumnos.length, dic)

  function cambiarCarreras(valores: string[]) {
    onChange({ ...borrador, ...conCarrerasElegidas(seleccion, valores.map(Number)) })
  }

  function alternarAlumno(alumno: AlumnoElegido) {
    onChange({ ...borrador, ...conAlumnoAlternado(seleccion, alumno) })
  }

  return (
    <>
      <div className="afectacion-campos__grupo">
        <Label>{t.carrerasAfectadas}</Label>
        <MultiSelect<string>
          value={seleccion.carreras.map(String)}
          onChange={cambiarCarreras}
          options={carreras.map((carrera) => ({ value: String(carrera.id), label: etiquetas.get(carrera.id) ?? carrera.nombre }))}
          placeholder={t.seleccionePlaceholder}
          ariaLabel={t.carrerasAfectadas}
          resumen={(cantidad) => resumenCarreras(cantidad, dic)}
        />
        <p className="afectacion-borrador__resumen" aria-live="polite">
          {seleccion.carreras.length === 0 ? t.ninguna : textoAlcanceInstituto(alcance.carreras, alcance.alumnos)}
        </p>
      </div>

      <AvisosConsistencia reglas={avisos} campos={['alcance']} />

      <div className="afectacion-campos__grupo">
        {permiteAlumnos && (
          <>
            <Label htmlFor={`${idPrefijo}-buscar-alumnos`}>{dic.parteCampos.comun.alumnosAfectados}</Label>
            <Input
              id={`${idPrefijo}-buscar-alumnos`}
              type="search"
              autoComplete="off"
              placeholder={t.buscarPlaceholder}
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
                  {t.reintentar}
                </button>
              </p>
            )}
            {resultado?.tipo === 'lista' && resultado.truncado && <p>{t.truncado}</p>}
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
          </>
        )}

        {carrerasElegidas.map((carrera) => {
          const elegidos = seleccion.alumnosElegidos.filter((alumno) => alumno.carreraId === carrera.id)
          return (
            <div key={carrera.id} className={styles.carrera}>
              <p className="afectacion-campos__subtitulo">{etiquetas.get(carrera.id) ?? carrera.nombre}</p>
              {elegidos.length === 0 ? (
                <p className={styles.completa}>{t.todaLaCarrera(contar(carrera.totalAlumnos, t.alumno, t.alumnos))}</p>
              ) : (
                <>
                  <p className={styles.completa}>
                    {t.alumnosDeCarrera(elegidos.length, carrera.totalAlumnos)}
                  </p>
                  <ul className={styles.chips}>
                    {elegidos.map((alumno) => (
                      <li key={alumno.id} className={styles.chip}>
                        <span>{nombreAlumno(alumno)}</span>
                        <button
                          type="button"
                          className={styles.quitar}
                          aria-label={t.quitarA(nombreAlumno(alumno))}
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

      {mostrarDescripcion && (
        <div className="afectacion-campos__grupo">
          <Label htmlFor={`${idPrefijo}-descripcion`}>{descripcionObligatoria ? dic.parteCampos.comun.descripcionObligatoria : dic.parteCampos.comun.descripcionOpcional}</Label>
          <Textarea
            id={`${idPrefijo}-descripcion`}
            maxLength={500}
            aria-required={descripcionObligatoria || undefined}
            value={borrador.descripcion}
            onChange={(evento) => onChange({ ...borrador, descripcion: evento.target.value })}
            disabled={disabled}
          />
        </div>
      )}
    </>
  )
}
