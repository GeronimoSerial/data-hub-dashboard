# F-2: canales de avisos hidrológicos (INA, EBY, CARU/CTM)

Investigación de solo lectura del 2026-10-13 (plan 06, F-2). Objetivo: encontrar un canal legible (HTML, RSS, API, CSV o PDF con texto) con emisión, vigencia, área y valores para el Paraná y el Uruguay en Corrientes.

**Conclusión:** el único canal legible verificado es el reporte diario en HTML del INA. Tiene tablas de altura y caudal con umbrales de alerta y evacuación para Corrientes y estaciones del Uruguay. La API REST del INA es la candidata más estable, pero falta probar que cubre esas estaciones en tiempo real.

Límite del método: las páginas se leyeron con una herramienta que resume el contenido. Los valores citados son los del resumen, no se descargaron archivos ni se llamaron endpoints.

## Fuentes

| Emisor | Canal | Formato | Verificado | Veredicto |
|---|---|---|---|---|
| INA (SAH Cuenca del Plata) | [Reporte diario](https://alerta.ina.gob.ar/a5/diario/reporte_diario) | HTML con tablas de altura (m) y caudal (m³/s), umbrales de alerta y evacuación, columna "Perspectiva"; también PDF y gráficos PNG | Abierto | Legible |
| INA | [API de datos hidrológicos](https://www.argentina.gob.ar/ina/recursos/aplicacionweb-datos-hidrologicos), base `https://alerta.ina.gob.ar/pub/datos/` | GET con parámetros; CSV, XML, JSON, GeoJSON; observado y pronóstico | Solo la página de descripción | Probable; probar cobertura |
| INA | PDFs (`Cuadro_*`, `ReporteSala_*`) | `Cuadro` es imagen (requiere OCR); `ReporteSala` no se pudo decodificar | Abierto | No legible sin parser/OCR |
| EBY Paraguay | [Alertas hidrológicas](https://www.eby.gov.py/alerta-hidrologico-n04-octubre/) | HTML numerado, solo durante eventos; sin hora de emisión | Abierto | Legible, eventual |
| EBY Argentina | `https://www.eby.org.ar/informe-hidrologico` | — | Falló el certificado TLS | Sin verificar |
| CARU | Registro de alturas en `http://190.0.152.194:8080/alturas/web/user/alturas` | — | No se pudo abrir (HTTP sobre IP) | Sin verificar |
| CTM Salto Grande | `https://www.saltogrande.org/docs/hidrologia/CaudalesNiveles.pdf`, `Comunicado.pdf` | PDF | Abierto; texto no extraíble con la herramienta | Solo PDF |
| SRH (hidraulica.gob.ar) | `ReporteSala_*.pdf` | PDF rasterizado | Abierto | Requiere OCR |
| IDESF Santa Fe | Geoportal de situación hídrica | Índice e históricos | Solo snippet | No es feed en vivo |

Datos de ejemplo (EBY Paraguay, alerta N°04 del 12/10): afluente a Yacyretá ~26.300 m³/s, pronóstico 29.000–32.000 m³/s; Puerto Ituzaingó 3 m a las 10:00, pronóstico 3,6–4,2 m, alerta 3,50 m.

Cadencia del INA declarada: pronósticos del Paraná martes y viernes; del Uruguay lunes, miércoles y viernes. Las fechas del reporte diario son del día (00:00), sin hora de emisión explícita.

## Términos de uso

- INA: solo enlaza los términos generales de argentina.gob.ar; no hay licencia propia. `alerta.ina.gob.ar/robots.txt` devuelve 404.
- CARU: "© 2019. Todos los derechos reservados."; sin términos de reutilización.
- CTM, EBY: sin términos en las páginas abiertas.

## Recomendación

1. Integrar el reporte diario HTML del INA, con un parser que detecte cambios de estructura y un hash por corrida, como en la captura de Prefectura.
2. Probar la API del INA: confirmar que trae Corrientes y Concordia en tiempo real y si incluye umbrales. Si responde, reemplaza al parser HTML.
3. Sumar las alertas de EBY Paraguay como complemento eventual para Ituzaingó, sin hora de emisión.
4. Postergar CARU y CTM hasta poder abrir el registro y confirmar que los PDF tienen texto (pdftotext o pdfplumber).

## Preguntas abiertas

- Licencia de reutilización y scraping del INA (contacto mencionado: `alerta@ina.gob.ar`).
- Si la API del INA trae datos en tiempo real de Corrientes y Paso de los Libres, y con umbrales.
- Si el reporte diario tiene una hora de emisión estable.
- Si existe el feed RSS del INA y qué publica.
- Si el registro de CARU es legible y trae umbrales.
- Si los PDF de CTM y SRH tienen texto extraíble.
- F-2 depende además de F-1 (capa de eventos) para registrar cada aviso.
