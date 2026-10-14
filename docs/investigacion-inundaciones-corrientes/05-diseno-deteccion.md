# Diseño de detección y representación

Propuesta. Nada de esto está implementado. Se justifica en las brechas de [04](04-matriz-caso-sistema.md).

## Principios

1. Separar lo **observado** (medición, reporte) de lo **estimado** (pronóstico, susceptibilidad) y de la **afectación educativa confirmada**.
2. Una capa territorial de eventos **independiente del índice escolar**. Se vincula a escuelas solo con reglas explícitas y sin crear partes.
3. Ningún dato sin procedencia, fecha del hecho y fecha de captura.
4. La falta de actualización se muestra como tal: no se convierte en resolución ni en persistencia confirmada.

## Flujo

| Etapa | Qué hace | Automatizable | Revisión humana |
|---|---|---|---|
| Descubrimiento | Lista curada de fuentes por nivel (oficial, nacional, regional, local) y por departamento; búsquedas por localidad, río y tipo de afectación | sí | alta de nuevas fuentes |
| Captura | Descarga y guarda el original (HTML/PDF/texto) con hash y hora de captura | sí | — |
| Extracción | Campos explícitos: fecha del hecho, lugar, afectación, cifras con unidad, fuente citada | reglas para fuentes estructuradas (Prefectura); IA con controles para texto | toda extracción de texto libre antes de publicar |
| Normalización temporal | Separa hecho, publicación, actualización y consulta; zona horaria explícita | sí | fechas ambiguas |
| Georreferenciación | Referencia territorial (departamento, localidad, barrio, estación); geometría solo si la fuente la permite | sí para estaciones y localidades del catálogo | barrios, parajes, tramos de ruta |
| Deduplicación | Agrupa notas por origen (copias) y por hecho (mismo lugar, fenómeno y período) | propuesta automática | decisión de fusión |
| Verificación | Asigna confianza según autoridad, observación directa, independencia | parcial | sí |
| Vinculación | Territorio → escuelas (intersección estimada) y parte → evento (confirmada) | intersección sí | confirmación |
| Publicación | Capa de eventos en el mapa con estado temporal y confianza | sí, para lo aprobado | — |
| Actualización / cierre | Nueva evidencia actualiza; sin evidencia nueva el estado envejece | sí | cierre explícito |
| Auditoría | Historial de cambios, evidencia y versiones | sí | muestreo |

## Entidades y estados

| Entidad | Ejemplos | No es |
|---|---|---|
| `lectura_hidrometrica` | Prefectura 9,31 m Paso de los Libres | afectación |
| `evidencia` | una nota, un parte oficial, una lectura | un hecho por sí sola |
| `evento_territorial` | evacuaciones en Isla Apipé | afectación escolar |
| `deteccion_remota` | agua superficial compatible (si se incorpora) | inundación confirmada |
| `susceptibilidad` | WRI Aqueduct RP100 | observación del evento |
| `aviso_pronostico` | SMN, INA, EBY | hecho ocurrido |
| `afectacion_escolar` | parte real verificado | evento territorial |

Estados de un evento o lectura frente al presente: `vigente_segun_ultimo_reporte`, `ocurrido`, `resuelto_explicito`, `evolucion_desconocida`, `sin_datos`, `contradictorio`, `vencido` (sin evidencia nueva dentro de su ventana de vigencia).

## Contratos de datos (borrador)

```ts
type Procedencia = 'real' | 'prueba' | 'simulacro'

interface LecturaHidrometrica {
  estacionId: string            // catálogo propio, ej. 'pna-paso-de-los-libres'
  fuente: 'prefectura'
  lecturaM: number
  medidaEn: string              // hora publicada + zona horaria declarada
  estadoPublicado: string       // texto literal: 'EVACUACION ESTAC.'
  lecturaAnteriorM: number | null
  alertaM: number | null        // umbral de ESTA estación, tal como se publica
  evacuacionM: number | null
  capturadaEn: string
  hashOriginal: string
  inconsistente: boolean        // ej. 0,00 con 'CRECE'
}

interface Evidencia {
  id: string                    // EVD-NNN
  clase: 'oficial_medicion' | 'oficial' | 'prensa_cita_oficial' | 'prensa' | 'datos_sistema'
  url: string | null
  titulo: string | null
  autorOrganismo: string | null
  publicadaEn: string | null
  actualizadaEn: string | null
  consultadaEn: string
  estadoAcceso: 'abierta' | 'muro_de_pago' | 'bloqueada' | 'solo_snippet'
  fragmento: string | null      // <= 25 palabras
  grupoCopia: string | null     // misma cifra/comunicado de origen
  verificacion: 'humana' | 'automatica' | 'no_verificada'
}

interface EventoTerritorial {
  id: string                    // EV-AAAAMMDD-NNN
  tipoFenomeno: string
  tipoAfectacion: string
  departamento: string[]
  localidad: string[]
  referencia: string            // texto original de ubicación
  geometria: GeoJSON.Geometry | null
  geometriaMetodo: string | null
  precision: 'punto' | 'barrio' | 'localidad' | 'departamento' | 'estacion'
  inicio: string | null; fin: string | null
  estadoTemporal: string
  ultimaEvidenciaEn: string     // base para envejecer el estado
  confianza: 'alta' | 'media' | 'baja' | 'muy_baja'
  contradicciones: string[]
  evidencias: string[]
  procedencia: Procedencia
}

interface VinculoEscuelaEvento {
  cueAnexo: string
  eventoId: string
  tipo: 'interseccion_estimada' | 'confirmado_por_parte'
  regla: string                 // ej. 'escuela en localidad del evento'
  parteId: string | null        // solo si confirmado_por_parte
}
```

## Reglas de vinculación

- **Estimada:** escuela en la misma localidad o barrio del evento, o asociada a la estación cuya lectura supera un umbral. Se muestra como «posible afectación de acceso», nunca como afectación.
- **Confirmada:** solo un parte real (procedencia `real`) que cite el evento. Un evento territorial **no crea** partes.
- La asociación escuela → estación se define por tramo de río, no por distancia (ver G-1 en [06](06-plan-mejoras.md)).
- No convertir caudal en altura ni en extensión inundada sin curva de descarga; no trasladar umbrales entre estaciones; no usar percentiles altos como prueba de desborde.

## Procedencia y entorno

- `procedencia` obligatoria en partes, eventos y evidencias. Mapa, motor, exportaciones y evaluaciones excluyen todo lo que no sea `real` por defecto.
- Preferible: entorno de pruebas separado. Mientras tanto, la exclusión por campo con prueba automatizada.

## Representación de la vigencia

- Cada estado muestra «según último reporte de <fecha y hora>».
- Vigencia por tipo (a ajustar con el equipo): lectura hidrométrica 24 h; evacuación 72 h; corte de ruta o cruce 72 h; lluvia medida: no vigente (es puntual).
- Vencida la vigencia sin evidencia nueva: estado `vencido` con símbolo atenuado, no se borra ni se marca resuelto.

## Extracción asistida por IA

- Solo extrae campos explícitos; campos no presentes quedan nulos (no se infieren escuela, causa ni coordenadas).
- Cada campo con el fragmento de origen; la herramienta registra modelo y versión.
- Publicación solo tras revisión humana; muestreo de errores por fuente.
- Evaluación previa con evidencias de esta investigación (precisión de fecha, lugar y cifras).
- No sustituye un modelo hidrológico.

## Datos complementarios evaluados

| Dato | Aporta | Límites | Recomendación |
|---|---|---|---|
| Alturas Prefectura | observación oficial con umbrales por estación; incluye aguas arriba (Posadas, Libertador, Iguazú) | solo última lectura (requiere captura periódica); HTML sin API; lecturas inconsistentes | **prioridad 1** (I-3) |
| INA (alerta y reportes diarios) | pronóstico oficial de niveles | PDF como imagen; portal sin contenido legible en la consulta | buscar canal legible (F-2) |
| SMN CAP | avisos meteorológicos | no emite crecidas; ya integrado | mantener y monitorear (I-8) |
| IMERG | lluvia observada satelital | latencia de horas; resolución ~10 km; subestima convección | activar (I-4) |
| Sentinel-1 (radar de apertura sintética) | agua superficial con nubes | revisita de varios días; Iberá y esteros tienen agua permanente o estacional que se confunde con agua nueva sin una línea de base; vegetación inundada y zonas urbanas mal detectadas; latencia de procesamiento | no es solución operativa inmediata; solo como estudio posterior con línea de base estacional |
| EBY / CARU / CTM | operación de represas y pronósticos | comunicados por prensa; sin canal estructurado verificado | F-2 |
| Medios | afectaciones concretas | sesgo de cobertura; copias; fechas de render | F-4 con revisión |
