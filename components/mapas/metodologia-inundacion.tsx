'use client'

import { useEffect } from 'react'

// Metodología de la estimación de inundación (T12). Texto estático: es el único
// lugar donde se explica el modelo; el mapa y las fichas sólo muestran etiquetas.
export function MetodologiaInundacion() {
  // `#metodologia/<id>` deep-links to a section once the tab is mounted.
  useEffect(() => {
    const seccion = window.location.hash.split('/')[1]
    if (seccion) document.getElementById(seccion)?.scrollIntoView({ block: 'start' })
  }, [])

  return (
    <article className="map-est" aria-labelledby="metodologia-inundacion-titulo" data-testid="metodologia-inundacion">
      <h2 id="metodologia-inundacion-titulo">Metodología: inundación</h2>
      <p>
        Estimación histórica del agua en cada escuela y en su acceso. Es un indicador de exposición,
        no un pronóstico ni una alerta.
      </p>

      <h3>Fuentes</h3>
      <ul>
        <li>
          JRC Global River Flood Hazard Maps v2.1: profundidad de crecida de río a 90 m, para
          períodos de retorno de 10, 100 y 500 años.
        </li>
        <li>JRC Global Surface Water: ocurrencia de agua en lagunas y humedales, a 30 m.</li>
        <li>Copernicus DEM GLO-30: altura del terreno, a 30 m.</li>
      </ul>

      <h3 id="inundacion-clases-rio">Clases por crecida de río</h3>
      <p>Se usa el período de retorno más corto en el que el agua llega a la escuela, con una profundidad de al menos 0,15 m.</p>
      <ul>
        <li><b>Alto:</b> llega con una crecida de 10 años.</li>
        <li><b>Medio:</b> llega con una crecida de 100 años, pero no con la de 10.</li>
        <li><b>Bajo:</b> sólo llega con una crecida de 500 años.</li>
        <li><b>Sin riesgo:</b> no llega ni con la crecida de 500 años.</li>
        <li><b>Sin dato:</b> no hay cobertura o no se pudo leer el dato. Nunca se muestra como Bajo ni como Sin riesgo.</li>
      </ul>

      <h3>Verificación de terreno</h3>
      <p>
        Un período de retorno no se cuenta cuando el terreno de la escuela está por encima del nivel
        de agua modelado cerca del río. Las capas de JRC no incluyen defensas contra inundaciones, por
        eso se compara con la altura del terreno.
      </p>

      <h3 id="inundacion-junto-laguna">Junto a laguna</h3>
      <p>
        Se marca cuando hay agua presente al menos el 25 % del tiempo dentro de 300 m de la escuela y el
        terreno de la escuela está hasta 6 m por encima de esa agua. Es una marca aparte de las clases de río.
      </p>

      <h3 id="inundacion-ruta-acceso">Ruta de acceso</h3>
      <p>
        Se toma la peor clase alcanzada a lo largo de al menos unos 270 m de la ruta (3 puntos cada 90 m).
        Usa las mismas clases que la escuela.
      </p>

      <h3>Limitaciones</h3>
      <ul>
        <li>JRC no modela defensas (diques, terraplenes). La verificación de terreno sólo lo compensa en parte.</li>
        <li>El DEM es un modelo de superficie: incluye árboles y techos. Su error vertical es de algunos metros.</li>
        <li>Los accesos cortados por lagunas no se detectan en esta versión.</li>
        <li>Es un peligro histórico y estático. No es un pronóstico.</li>
      </ul>
    </article>
  )
}
