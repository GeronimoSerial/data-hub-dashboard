import type { PresentacionCrecida } from '@/lib/infraestructura/riesgo/presentacion-crecida'
import type { CSSProperties } from 'react'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'

const metros = (valor: number) => `${valor.toFixed(2).replace('.', ',')} m`
const fechaCorta = (fecha: string) => fecha.split('-').reverse().join('/')

export function ReferenciaCrecida({ crecida, horizonte }: { crecida: PresentacionCrecida; horizonte: HorizonteMotor }) {
  const { antecedente, alturaActualM, alturaCriticaM, subidaDesdeActualM, estacion } = crecida
  const niveles = [
    ...(alturaActualM === null ? [] : [{ clave: 'lectura', etiqueta: 'Última lectura del río', valor: alturaActualM }]),
    ...(antecedente === null ? [] : [{ clave: 'historico', etiqueta: 'Aquella crecida', valor: antecedente.nivelM }]),
    ...(alturaCriticaM === null ? [] : [{ clave: 'estimado', etiqueta: 'Nivel necesario para llegar al terreno', valor: alturaCriticaM }]),
  ]
  const minimo = Math.min(0, ...niveles.map((nivel) => nivel.valor))
  const maximo = Math.max(1, ...niveles.map((nivel) => nivel.valor))
  const posicion = (valor: number) => (valor - minimo) / (maximo - minimo) * 100
  const cero = posicion(0)
  const subida = antecedente?.subidaHastaUmbralM ?? subidaDesdeActualM
  const probabilidad = crecida.probabilidadesPorHorizonte?.[horizonte] ?? null
  const plazo = horizonte === 240 ? 'los próximos 10 días' : `las próximas ${horizonte} horas`
  const porcentaje = probabilidad === null ? null
    : probabilidad === 0 ? 'menos del 1 %'
    : probabilidad === 100 ? 'más del 99 %'
    : `aproximadamente del ${probabilidad} %`

  return (
    <section className="referencia-crecida" aria-label="Referencia de crecida del río">
      <h4>El río y la escuela</h4>
      {antecedente && (
        <div className="referencia-crecida__antecedente">
          <p>
            {antecedente.fecha && <>En <strong>{antecedente.fecha.slice(0, 4)}</strong>, </>}
            {antecedente.fecha ? 'con' : 'Con'} el río a <strong>{metros(antecedente.nivelM)}</strong>, el agua
            {antecedente.distanciaAguaM !== null
              ? <> quedó a unos <strong>{(Math.round(antecedente.distanciaAguaM / 10) * 10).toLocaleString('es-AR')} m</strong> de la escuela.</>
              : ' no alcanzó el terreno de la escuela.'}
          </p>
          <p className="referencia-crecida__fuente">
            Imagen satelital{antecedente.fecha && <> del <time dateTime={antecedente.fecha}>{fechaCorta(antecedente.fecha)}</time></>}.
          </p>
        </div>
      )}
      <figure className="referencia-crecida__grafico" aria-label="Comparación de alturas del río">
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
        <figcaption>Altura del río en la escala de {estacion}.</figcaption>
      </figure>
      {subida !== null && subida > 0 && (
        <div className="referencia-crecida__diferencia">
          <strong>+{metros(subida)}</strong>
          <p>{antecedente ? 'más que aquella crecida' : 'desde la última lectura'} para llegar al terreno de la escuela.</p>
          <span>{crecida.origen === 'estudio_v04' ? 'Referencia del estudio, con margen de precaución.' : 'Estimación con margen de precaución.'}</span>
        </div>
      )}
      <p className="referencia-crecida__probabilidad">
        {porcentaje === null
          ? 'Con los datos disponibles todavía no se puede estimar la probabilidad de que el agua llegue al terreno de la escuela con esta tendencia.'
          : <>Según la evolución prevista del río, la probabilidad estimada de que el agua llegue al terreno de la escuela en {plazo} es <strong>{porcentaje}</strong>.</>}
      </p>
      {antecedente && antecedente.subidaHastaUmbralM !== null && antecedente.subidaHastaUmbralM <= 0 && (
        <p>Aquella crecida ya alcanzaba el nivel estimado, aunque la imagen mostró el terreno seco. Conviene verificarlo en el lugar.</p>
      )}
      {subidaDesdeActualM !== null && subidaDesdeActualM <= 0 && (
        <p>La última lectura ya alcanza el nivel estimado. Esto no confirma que la escuela esté inundada.</p>
      )}
      {crecida.defensaCostera && (
        <p>Hay una defensa costera en la zona. Hace falta verificar su protección.</p>
      )}
      {alturaCriticaM === null && <p>La crecida necesaria para llegar al terreno todavía no está estimada.</p>}
      <details className="referencia-crecida__detalle">
        <summary>Cómo se estima</summary>
        {subidaDesdeActualM !== null && subidaDesdeActualM > 0 && (
          <p>Desde la última lectura faltan aproximadamente <strong>{metros(subidaDesdeActualM)}</strong> para llegar al nivel estimado.</p>
        )}
        {alturaActualM === null && <p>No hay una lectura del río disponible para este cálculo.</p>}
        {crecida.origen === 'estudio_v04' && <p>La referencia proviene del estudio v0.4 del 18/10/2026. Es una estimación de altura para seguimiento, con validación local pendiente; no modifica el riesgo actual de la escuela.</p>}
        <p>Se usa el margen conservador de v0.4 cuando hay una altura estimada. Las barras comparan alturas del río; la distancia histórica al agua es una medida aparte.</p>
        <p>La estimación se refiere al terreno. Para saber si el agua entraría al edificio hay que conocer la altura de su piso.</p>
      </details>
    </section>
  )
}
