# Capa visual de departamentos en el mapa de alertas — brief

Fecha: 2026-09-17
Rama: `feat/alumnos`
Estado: **bloqueado** hasta que se integre la categorización de problemáticas
(`2026-09-17-categorizacion-problematicas-design.md`), que tiene tomado
`components/mapas/map-infraestructura-page.tsx`.

## Objetivo

Que el mapa de alertas comunique, de un vistazo, **qué departamentos están
golpeados y cuánto**, sin romper el lenguaje visual que ya existe y sin
degradar el rendimiento de una sesión larga.

## Restricción que gobierna todo el diseño

`lib/infraestructura/severidad.ts` es la **única** fuente de color para
severidad, compartida por mapa, lista y ficha. Ninguna capa nueva puede
introducir una segunda escala de color: rompería la leyenda.

Por eso todo lo que sigue usa **otros canales**: opacidad, textura, tipografía
y movimiento. No color.

## Por qué no hay emojis ni iconos ilustrativos

Se evaluó y se descartó explícitamente:

1. El render de un emoji lo decide el sistema operativo del cliente. La leyenda
   deja de ser controlable.
2. A zoom provincial son 25 departamentos; los íconos tapan los puntos de
   establecimiento, que son el dato primario.
3. Un ícono que no codifica una variable es ruido compitiendo con la señal, en
   una herramienta que se usa para decidir si hay clases.

No reintroducir esta idea bajo otra forma.

## Alcance

### 1. Intensidad por departamento

El relleno del polígono modula su **opacidad** según la cantidad de
establecimientos con alerta activa en ese departamento. Color fijo
`#90B4E1` (el de `COLORES_DEPARTAMENTO`, ya extraído).

```
fill-opacity: ['interpolate', ['linear'], ['get', 'alertas'], 0, 0.04, 12, 0.22]
```

El tope de 12 es una hipótesis: ajustalo al percentil 90 real de la data si la
distribución lo desmiente, y dejá el número justificado en un comentario.

### 2. Trama diagonal en departamentos con alerta activa

Un rayado fino en diagonal sobre los departamentos con al menos una alerta
activa. Es la versión legible de "efecto lluvia", y funciona como **segundo
canal además del color**: sobrevive al daltonismo y a una impresión en blanco y
negro.

Implementación:

- Generar la trama en un `<canvas>` offscreen (líneas de 1px a 45°, separadas
  ~6px, blanco con alpha bajo) y registrarla con `map.addImage('trama-lluvia',
  {width, height, data}, {pixelRatio: 2})`.
- **Gotcha de MapLibre**: `fill-pattern` ignora `fill-color` y `fill-opacity`
  no lo modula como uno espera. La trama va en una **capa `fill` propia**,
  encima de la capa de relleno del punto 1, filtrada a los departamentos con
  alertas (`['>', ['get', 'alertas'], 0]`).
- Registrar la imagen en el evento `load`/`styledata` del mapa, y volver a
  registrarla si cambia el basemap: cambiar de estilo **descarta las imágenes
  registradas**. Es el bug clásico de esta técnica.

### 3. Pulso, sólo en severidad Crítica

Un halo que late alrededor de los **puntos** de establecimiento con alerta
Crítica. No del polígono del departamento.

El principio es restricción de movimiento: si late todo, no late nada. Reservar
la animación para el estado más raro y más urgente es lo que la hace significar
algo.

- Capa `circle` adicional, sólo features de severidad Crítica, con
  `circle-radius` oscilando vía `requestAnimationFrame` +
  `map.setPaintProperty`.
- Período ~1.8s, `circle-opacity` cayendo mientras el radio crece. Sin rebote.
- El loop **no arranca** si no hay ninguna alerta Crítica visible.
- El loop **se detiene** con `document.hidden` (escuchar `visibilitychange`) y
  al desmontar el componente. Una pestaña de fondo no debe consumir CPU.
- Con `prefers-reduced-motion: reduce` no se instala el loop: queda un anillo
  estático del mismo radio máximo. El estado sigue siendo legible sin
  movimiento — la animación nunca es el único canal.

### 4. Etiqueta con el conteo

La etiqueta del departamento muestra `GOYA · 3` cuando tiene alertas, y sólo
`GOYA` cuando no. Capa `symbol` con `text-field` data-driven.

## Gotcha de datos: los nombres de departamento no matchean

`AlertaActiva.departamento` viene de `ge_localizacion.departamento` y el
geojson trae `properties.nombre`. **No coinciden literalmente.**

- El geojson usa capitalización de título con tildes: `Bella Vista`,
  `Ituzaingó`, `Concepción`.
- La data de origen viene en mayúsculas y con tildes inconsistentes. En el
  prototipo HTML el `<select>` de departamento llegaba a listar **`CONCEPCION`
  y `CONCEPCIÓN` como dos opciones distintas**.

Hace falta una función de normalización (mayúsculas + remover diacríticos con
`normalize('NFD')` + colapsar espacios) usada en **ambos** lados del join.
Va en `lib/mapas/departamentos.ts`, con test propio que cubra al menos
`Ituzaingó`/`ITUZAINGO` y `Concepción`/`CONCEPCION`.

Si al hacer el join algún departamento de las alertas no matchea ningún
polígono, **no lo silencies**: registralo y reportalo. Es un problema de datos
que alguien tiene que saber que existe.

## Enriquecimiento del GeoJSON

Las propiedades `alertas` y `peorSeveridad` no están en el archivo: se calculan
en el cliente con un `useMemo` que cruza las alertas contra los 25 features.
Son 25 polígonos y 44 KB — es barato, no hace falta feature-state ni tiles.

## Rendimiento

- Nada de `transition: all`. Las transiciones declaran propiedades exactas.
- El único `requestAnimationFrame` de toda la capa es el del pulso, y está
  condicionado como dice el punto 3.
- La trama es una imagen registrada una vez, no un redibujo por frame.

## Fuera de alcance

- Delimitación por localidad: **no existe la data**. `localities.geojson` son
  45 puntos sin polígono, y `zones.geojson` son círculos sintéticos del
  análisis de matrícula, no ejidos municipales. Traer los límites reales del
  IGN es una tarea de datos, separada de esta.
- Click en departamento para filtrar, y tooltips permanentes: comportamiento
  nuevo, no "delimitación". El mapa ya tiene su panel de filtros con campo de
  territorio.
- El mapa de matrícula (`map-matricula-page.tsx`) no se toca.

## Testing

- Normalización de nombres: los casos del gotcha de datos.
- Cálculo de `alertas` por departamento a partir de una lista de alertas mock,
  incluyendo un departamento sin alertas (opacidad mínima) y uno que no matchea
  (debe reportarse, no desaparecer en silencio).
- El generador de la trama devuelve un `ImageData` de las dimensiones
  esperadas.
- El pulso no instala `requestAnimationFrame` cuando no hay alertas Críticas, y
  no lo instala bajo `prefers-reduced-motion`.

## Criterios de aceptación

1. Un departamento con muchas escuelas afectadas se distingue de uno con una
   sola, sin leer ningún número.
2. Los departamentos con alerta se distinguen de los que no, **también en
   escala de grises**.
3. Nada late salvo que haya una alerta Crítica.
4. Con `prefers-reduced-motion` activo no se instala ningún loop de animación y
   el mapa sigue comunicando lo mismo.
5. Cambiar de basemap no hace desaparecer la trama.
6. `pnpm lint` y `pnpm test` en verde.
