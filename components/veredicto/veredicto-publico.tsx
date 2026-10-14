// Vista pública del veredicto diario, pensada para lectura no técnica.
// Sin 'use client': es segura para renderizar en servidor.
import type { DtoVeredicto, MetricaDtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import { nombreFuente } from '@/lib/infraestructura/veredicto/metricas'
import { etiquetaNivel, nombreDepartamento } from '@/lib/infraestructura/veredicto/niveles'

const ETIQUETA_TIPO_DIA: Record<string, string> = {
  observado: 'Observado',
  hoy: 'Hoy',
  pronostico: 'Pronóstico',
}

const AMBITO_PROVINCIA = 'provincia'

function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split('-')
  return `${dia}/${mes}`
}

function fuentesUnicas(veredictos: DtoVeredicto[]): { etiqueta: string; url: string }[] {
  const vistas = new Map<string, string>()
  for (const v of veredictos) {
    for (const m of v.metricas as MetricaDtoVeredicto[]) {
      if (m.fuenteUrl && !vistas.has(m.fuenteUrl)) vistas.set(m.fuenteUrl, nombreFuente(m.fuenteUrl))
    }
  }
  return [...vistas].map(([url, etiqueta]) => ({ etiqueta, url }))
}

export function VeredictoPublico({ veredictos }: { veredictos: DtoVeredicto[] }) {
  const porFecha = new Map<string, DtoVeredicto[]>()
  for (const v of veredictos) {
    porFecha.set(v.fecha, [...(porFecha.get(v.fecha) ?? []), v])
  }
  const fechas = [...porFecha.keys()].sort()
  const enCalibracion = veredictos.some((v) => v.enCalibracion)

  return (
    <article className="veredicto-publico">
      <div className="veredicto-publico__contenido">
        <h1>Veredicto diario de inundaciones — Provincia de Corrientes</h1>
        <p className="veredicto-publico__aviso" role="note">
          No es un aviso oficial. Consulte al SMN, a Prefectura Naval y a Defensa Civil.
        </p>
        {enCalibracion && (
          <p className="veredicto-publico__aviso">
            En calibración: los criterios de este veredicto todavía se están ajustando.
          </p>
        )}

        {fechas.map((fecha) => {
          const del = porFecha.get(fecha) ?? []
          const provincia = del.find((v) => v.ambito === AMBITO_PROVINCIA)
          const departamentos = del.filter((v) => v.ambito !== AMBITO_PROVINCIA)
          const tipo = del[0]?.tipoDia ?? ''
          return (
            <section key={fecha} className="veredicto-publico__dia">
              <h2>
                {fechaCorta(fecha)} — {ETIQUETA_TIPO_DIA[tipo] ?? tipo}
              </h2>
              {provincia && (
                <div className="veredicto-publico__provincia">
                  <p>
                    <strong>Provincia: {etiquetaNivel(provincia.nivel)}</strong>
                  </p>
                  {provincia.texto && <p>{provincia.texto}</p>}
                </div>
              )}
              {departamentos.map((d) => (
                <div key={d.id} className="veredicto-publico__departamento">
                  <p>
                    <strong>
                      {nombreDepartamento(d.ambito)}: {etiquetaNivel(d.nivel)}
                    </strong>
                  </p>
                  {d.texto && <p>{d.texto}</p>}
                </div>
              ))}
            </section>
          )
        })}

        <section className="veredicto-publico__fuentes">
          <h2>Fuentes</h2>
          <ul>
            {fuentesUnicas(veredictos).map((f) => (
              <li key={f.url}>
                <a href={f.url} target="_blank" rel="noopener noreferrer">
                  {f.etiqueta}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  )
}
