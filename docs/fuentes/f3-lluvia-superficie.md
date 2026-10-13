# F-3: lluvia medida en superficie para Corrientes

Investigación de solo lectura del 2026-10-13 (plan 06, F-3). Objetivo: encontrar pluviómetros con acceso abierto en Corrientes, porque en la crecida de octubre de 2026 las cifras de lluvia venían de municipios o prensa sin estación (por ejemplo, 88-90 mm en Curuzú Cuatiá el 8/10).

**Conclusión:** no hay todavía un feed abierto de pluviómetros de Corrientes verificado. El único acceso comprobado sin login es OGIMET (mensajes SYNOP), pero falta confirmar qué estaciones de Corrientes reportan lluvia y con qué intervalo. SMN e INTA son las fuentes oficiales candidatas, pero sus páginas de descarga no se pudieron abrir con la herramienta de investigación.

Límite del método: varias afirmaciones vienen de fuentes secundarias (snippets de búsqueda, datos.gob.ar, documentación de paquetes de R). Están marcadas como "no abierto".

## Fuentes

| Fuente | Acceso | Estaciones en Corrientes | Licencia | Verificado | Veredicto |
|---|---|---|---|---|---|
| SMN | `smn.gob.ar/descarga-de-datos` (datos.gob.ar lo cita como horario) | Según un informe de 2022: Corrientes, Paso de los Libres, Ituzaingó, Mercedes, Monte Caseros (IDs sin verificar) | No encontrada | No abierto: el sitio devolvió 402 y `ws1.smn.gob.ar` 404 | Fuente oficial preferida; verificar desde navegador |
| INTA SIGA | `siga.inta.gob.ar`; paquete de R no oficial `siga` | EEA Mercedes, Bella Vista y Corrientes según informes; sin confirmar si son automáticas y horarias | No encontrada | Solo el título de la página | Candidata; verificar exportación y resolución |
| OGIMET | `ogimet.com` (`synops.phtml`, `usynops.phtml`, `gsynres.phtml`, `indicativos.phtml`) | Sin confirmar | Uso informativo, no para misiones críticas, no pedir grandes volúmenes; datos mayormente de NOAA | Abierto, sin login | Respaldo casi en tiempo real; lluvia probablemente cada 3 h (inferido de la práctica OMM) |
| NOAA ISD / GHCN-Daily | Producto horario global, descarga ASCII y API | Sin confirmar | No indicada en la página | Página del producto abierta | Histórico y calibración, no tiempo real |
| Meteostat | API y web | Página de Corrientes vacía | CC BY-NC 4.0 (snippet) | No | Uso interno con atribución; restringe uso comercial |
| Weather Underground (PWS) | — | — | Términos no accesibles (404) | No | Descartado: sin control de calidad |
| Provincia y municipios (ICAA, Defensa Civil, Producción) | — | Ninguna red abierta encontrada | — | Búsqueda | Pedir por convenio |

## Recomendación

1. Abrir desde un navegador `smn.gob.ar/descarga-de-datos`: registrar el endpoint real, la tabla de estaciones de Corrientes y la licencia. Si publica precipitación horaria, es la primera fuente a integrar.
2. Mientras tanto, confirmar en `indicativos.phtml` de OGIMET los indicativos SYNOP de Corrientes y si reportan lluvia; servir como respaldo con consultas espaciadas.
3. Revisar en SIGA las estaciones automáticas de Mercedes y Bella Vista y su formato de exportación.
4. Pedir a ICAA o Defensa Civil de Corrientes acceso a sus registros de lluvia, ya que no hay red abierta.

## Preguntas abiertas

- ¿SMN publica precipitación horaria por estación en un endpoint descargable, y con qué licencia?
- ¿Qué estaciones SYNOP de Corrientes (Corrientes Aero, Paso de los Libres, Monte Caseros, Ituzaingó, Curuzú Cuatiá) reportan lluvia, y cada cuánto?
- ¿Alguna estación automática del INTA en Corrientes da lluvia horaria en SIGA con un formato estable?
- ¿Existe un registro provincial que pueda compartirse por convenio?
