'use client'

import type { PresentacionCrecida } from '@/lib/infraestructura/riesgo/presentacion-crecida'
import type { CSSProperties } from 'react'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { useTextos } from '@/lib/i18n/idioma-provider'

const metros = (valor: number) => `${valor.toFixed(2).replace('.', ',')} m`
const fechaCorta = (fecha: string) => fecha.split('-').reverse().join('/')

export function ReferenciaCrecida({ crecida, horizonte }: { crecida: PresentacionCrecida; horizonte: HorizonteMotor }) {
  const r = useTextos().fichaTerritorio.referencia
  const { antecedente, alturaActualM, alturaCriticaM, subidaDesdeActualM, estacion } = crecida
  const niveles = [
    ...(alturaActualM === null ? [] : [{ clave: 'lectura', etiqueta: r.etiquetaLectura, valor: alturaActualM }]),
    ...(antecedente === null ? [] : [{ clave: 'historico', etiqueta: r.etiquetaHistorico, valor: antecedente.nivelM }]),
    ...(alturaCriticaM === null ? [] : [{ clave: 'estimado', etiqueta: r.etiquetaEstimado, valor: alturaCriticaM }]),
  ]
  const minimo = Math.min(0, ...niveles.map((nivel) => nivel.valor))
  const maximo = Math.max(1, ...niveles.map((nivel) => nivel.valor))
  const posicion = (valor: number) => (valor - minimo) / (maximo - minimo) * 100
  const cero = posicion(0)
  const subida = antecedente?.subidaHastaUmbralM ?? subidaDesdeActualM
  const probabilidad = crecida.probabilidadesPorHorizonte?.[horizonte] ?? null
  const plazo = horizonte === 240 ? r.plazoDiez : r.plazoHoras(horizonte)
  const porcentaje = probabilidad === null ? null
    : probabilidad === 0 ? r.probabilidadNula
    : probabilidad === 100 ? r.probabilidadTotal
    : r.probabilidadAproximada(probabilidad)

  return (
    <section className="referencia-crecida" aria-label={r.ariaSeccion}>
      <h4>{r.titulo}</h4>
      {antecedente && (
        <div className="referencia-crecida__antecedente">
          <p>
            {antecedente.fecha && <>{r.en} <strong>{antecedente.fecha.slice(0, 4)}</strong>, </>}
            {antecedente.fecha ? r.conMinuscula : r.conMayuscula} {r.elRioA} <strong>{metros(antecedente.nivelM)}</strong>{r.elAgua}
            {antecedente.distanciaAguaM !== null
              ? <>{r.quedoA}<strong>{(Math.round(antecedente.distanciaAguaM / 10) * 10).toLocaleString('es-AR')} m</strong>{r.deLaEscuela}</>
              : r.noAlcanzo}
          </p>
          <p className="referencia-crecida__fuente">
            {r.imagenSatelital}{antecedente.fecha && <>{r.del} <time dateTime={antecedente.fecha}>{fechaCorta(antecedente.fecha)}</time></>}.
          </p>
        </div>
      )}
      <figure className="referencia-crecida__grafico" aria-label={r.ariaGrafico}>
        <dl className="referencia-crecida__columnas">
          {niveles.map((nivel) => (
            <div className={`referencia-crecida__columna referencia-crecida__columna--${nivel.clave}`} key={nivel.clave}>
              <dt>{nivel.etiqueta}</dt>
              <dd>
                <strong className="referencia-crecida__valor">{metros(nivel.valor)}</strong>
                <div className="referencia-crecida__trazado" aria-hidden="true">
                  <span className="referencia-crecida__cero" style={{ '--base': `${cero}%` } as CSSProperties} />
                  <span className="referencia-crecida__barra" style={{
                    '--base': `${Math.min(cero, posicion(nivel.valor))}%`,
                    '--nivel': `${Math.abs(posicion(nivel.valor) - cero)}%`,
                  } as CSSProperties} />
                </div>
              </dd>
            </div>
          ))}
        </dl>
        <figcaption>{r.alturaEscala(estacion)}</figcaption>
      </figure>
      {subida !== null && subida > 0 && (
        <div className="referencia-crecida__diferencia">
          <strong>+{metros(subida)}</strong>
          <p>{antecedente ? r.masQueAquella : r.desdeUltimaLectura} {r.paraLlegarAlTerreno}</p>
          <span>{crecida.origen === 'estudio_v04' ? r.referenciaMargen : r.estimacionMargen}</span>
        </div>
      )}
      <p className="referencia-crecida__probabilidad">
        {porcentaje === null
          ? r.sinProbabilidad
          : <>{r.probabilidadPre} {plazo} {r.probabilidadPost} <strong>{porcentaje}</strong>.</>}
      </p>
      {antecedente && antecedente.subidaHastaUmbralM !== null && antecedente.subidaHastaUmbralM <= 0 && (
        <p>{r.aquellaYaAlcanzaba}</p>
      )}
      {subidaDesdeActualM !== null && subidaDesdeActualM <= 0 && (
        <p>{r.ultimaYaAlcanza}</p>
      )}
      {crecida.defensaCostera && (
        <p>{r.defensaCostera}</p>
      )}
      {alturaCriticaM === null && <p>{r.crecidaNoEstimada}</p>}
      <details className="referencia-crecida__detalle">
        <summary>{r.comoSeEstima}</summary>
        {subidaDesdeActualM !== null && subidaDesdeActualM > 0 && (
          <p>{r.faltanPre} <strong>{metros(subidaDesdeActualM)}</strong> {r.faltanPost}</p>
        )}
        {alturaActualM === null && <p>{r.sinLectura}</p>}
        {crecida.origen === 'estudio_v04' && <p>{r.referenciaEstudio}</p>}
        <p>{r.margenConservador}</p>
        <p>{r.terrenoNoEdificio}</p>
      </details>
    </section>
  )
}
