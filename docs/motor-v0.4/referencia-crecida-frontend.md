# Referencia de crecida en la ficha escolar

La ficha muestra, fuera del detalle técnico, el nivel histórico con el que
Sentinel-2 observó el terreno seco, la distancia al agua en esa misma escena,
la altura crítica conservadora del motor y la diferencia de altura respecto
del antecedente y de la lectura usada por el cálculo.

La API de escuela publica `crecidaRio`. Prefiere la altura crítica persistida en
el snapshot vigente, tanto para el río modelado como para la zona DEM. Si el run
todavía es v0.3 o no trae esa altura, muestra la referencia del estudio v0.4 con
`origen: estudio_v04`, identificada en el bloque y en “Cómo se estima”. No ejecuta
el motor ni modifica las probabilidades, pisos o nivel de riesgo publicados.
El antecedente también puede mostrarse sin snapshot vigente; una lectura ausente
no se inventa y una lectura de otra estación no se incorpora.

El umbral ya incorpora el margen conservador de v0.4. No se vuelve a descontar.
La distancia horizontal al agua es contexto observado; la diferencia vertical
sale de la altura crítica del motor. No se convierte una distancia horizontal
en una crecida vertical mediante una proporción. El ingreso al edificio exige
una cota de piso relevada. Las escuelas con defensa costera muestran esa salvedad.
Un antecedente seco igual o superior al umbral se presenta como una referencia
que requiere seguimiento y validación local, sin afirmar que una crecida de 0 m
provoque anegamiento.

## Procedencia de las distancias

`lib/infraestructura/riesgo/antecedentes-crecida-s2.json` es una exportación del
estudio de calibración costera del 18/10/2026 que generó `seco-s2-2026-10-18.1`:
640 escuelas en 17 escenas, con el identificador Sentinel-2 de cada escena.
Se usan las coordenadas originales y la estación, altura y fecha de la evidencia
seca usada por v0.4. Las escenas y `aoi.json` son insumos locales del estudio.

El exportador reproduce la máscara del estudio: NDWI o MNDWI > 0,1, exclusión SCL
0/3/8/9/10, mayor cuerpo de agua conectado con vecindad de ocho píxeles y distancia
euclídea al agua en la grilla de 10 m. Solo exporta puntos válidos a al menos 30 m
del agua. La distancia corresponde a la escena del antecedente, no al mínimo de
distancias de otras fechas. Se guarda redondeada al metro y se muestra a decenas
de metros, precedida de “unos”, acorde con la resolución de la imagen.

Para regenerar, con numpy, scipy y rasterio instalados:

```sh
python scripts/exportar-antecedentes-crecida.py /ruta/al/estudio/calibracion-costa
```

El frontend solo recibe la referencia de la escuela solicitada. La unión exige
CUE/anexo, estación, fecha y nivel coincidentes. Una distancia ausente se omite;
un antecedente posterior al cálculo también se omite.

La exportación incluye las alturas del mismo `alturas_criticas_escuelas.csv`, con
el margen de 2 m del estudio y el piso de evidencia seca. Solo admite estaciones
cuya calibración sigue utilizable en `altura-critica.ts`, y excluye filas con
georreferencia dudosa o fuera del área estudiada. Paso de la Patria, cuyo ajuste
fue contradicho, conserva su antecedente pero no publica una altura estimada.
Las defensas se identifican por localidad de la escuela, no por toda la estación.

## Presentación y verificación

Se conserva la tipografía, paleta y composición plana de `design.md` y de la
ficha. Energía 1, ritmo 2, movimiento 1: un gráfico compara la última lectura,
la crecida histórica y la altura estimada de alcance. Todas las barras usan la
misma escala desde cero, incluyendo alturas negativas si las hubiera. Los
valores y etiquetas se presentan también como texto accesible.

El azul lleno identifica la lectura, el contorno azul el antecedente y el borde
discontinuo ocre la estimación. La diferencia de altura se destaca junto a una
frase breve; la distancia al agua sigue como contexto histórico, separado de
la escala de alturas. La explicación extensa queda bajo “Cómo se estima”,
operable con teclado. Las advertencias por defensa o nivel ya alcanzado quedan
visibles. En contenedores menores a 17 rem las barras se vuelven horizontales,
también al ampliar el texto al 200 %. No se agregan dependencias ni animaciones.

Las pruebas cubren la explicación emitida por el motor, la correspondencia de
todas las distancias con su evidencia seca, datos ausentes, umbral alcanzado,
defensas, API vigente y cambio de escuela/horizonte durante la carga.

El bloque aparece al principio de la columna derecha de la ficha completa, antes
del pronóstico. La prueba de integración usa el componente completo de la ficha,
además del gráfico aislado: CUE 1800818-00, snapshot v0.3, referencia histórica 3,60 m, distancia
aproximada 280 m, altura de referencia del estudio 15,47 m y diferencia 11,87 m.

El relato incluye el año de la imagen histórica. Las barras distinguen la última
lectura del río, aquella crecida y el nivel necesario para llegar al terreno.
Debajo se explica la probabilidad de alcanzar ese mismo nivel en el horizonte
elegido (24, 72 o 240 horas), leída de la explicación persistida de altura crítica.
No se usa el score de riesgo ni la probabilidad de otra cota. Como el motor
persiste porcentajes redondeados, se presentan como aproximados; 0 y 100 se
expresan como «menos del 1 %» y «más del 99 %». Si falta el dato para ese plazo,
incluidas las referencias del estudio sobre corridas v0.3, se aclara que todavía
no se puede estimar esa probabilidad. No se extrapola desde la distancia al agua.

Instancia de trabajo: puerto 3420, túnel
`https://flights-graduate-artist-dropped.trycloudflare.com`.
La instancia y el túnel del puerto 3100 se mantienen ajenos a este cambio.

Validación del rediseño visual y carga (18/10/2026):

- PASS, datos y estados: pruebas de presentación, componente, API y ficha;
  incluyen la corrida v0.3 y la ausencia de snapshot. Motor sin cambios.
- PASS, diseño: tokens y tipografía existentes, barras proporcionales y diferencia
  destacada; explicación desplegable operable con Tab, Enter y Espacio, con foco
  visible. Sin imágenes, animaciones ni dependencias nuevas.
- PASS, adaptación y contraste: componente renderizado en Chromium a 280, 320,
  768 y 1280 px, temas claro y oscuro, sin desbordes incluso con texto al 200 %;
  contraste mínimo 4,59:1 en texto normal y 4,19:1 en texto grande.
- PASS, integración: `pnpm build`, `tsc --noEmit`, ESLint de los archivos TypeScript
  modificados y `git diff --check` aprobados. Revisión de corrección, legibilidad,
  arquitectura, acceso y rendimiento sin hallazgos pendientes en este cambio.
