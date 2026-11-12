# Sistema regional de alerta de riesgo hidrometeorológico para escuelas

**Informe provisorio para presentación ante el BID**
Estado: borrador — fuentes marcadas como *(a verificar)* pendientes de confirmación.
Fecha: 12/11/2026

---

## 1. Resumen

El mapa ENOS es un sistema operativo, hoy en funcionamiento en la provincia de Corrientes (Argentina), que estima el riesgo de inundación y aislamiento de cada escuela a 24, 72 y 240 horas. Combina pronóstico de lluvia, caudal de ríos, lluvia observada por satélite, altura de ríos y terreno, y lo cruza con el padrón escolar.

Proponemos escalarlo a un **sistema regional de alerta escolar ante El Niño–Oscilación del Sur (ENOS)**, con un piloto en tres países: **Corrientes (Argentina) + Manaos/Amazonas (Brasil) + Artigas (Uruguay)**. Tres países es el mínimo que exige la Iniciativa de Bienes Públicos Regionales del BID.

El piloto muestra los dos lados del fenómeno. En la Cuenca del Plata, El Niño trae lluvias e inundaciones. En la Amazonía central trae sequía y bajante extrema: en 2023 y 2024 el río Negro llegó a mínimos históricos y muchas escuelas ribereñas quedaron sin acceso fluvial. La Niña, en cambio, produjo la crecida récord de Manaos en 2021. Un mismo sistema alerta sobre escuelas inundadas en un extremo de la región y escuelas aisladas por sequía en el otro.

## 2. Por qué es replicable

La mayor parte de los insumos de amenaza ya son **globales** y funcionan igual en cualquier país de la región:

| Insumo | Fuente | Cobertura |
|---|---|---|
| Pronóstico de lluvia (determinístico y por escenarios) | ECMWF | Global |
| Pronóstico de caudal | GloFAS (Copernicus) | Global |
| Lluvia observada por satélite | NASA IMERG | Global |
| Modelo de terreno | Copernicus DEM 30 m | Global |
| Red de caminos | OpenStreetMap | Global |
| Profundidad de inundación por período de retorno | JRC | Global |

Lo que se debe incorporar por país es lo **local**: padrón de escuelas georreferenciado, estaciones de río medidas y umbrales de alerta validados.

Para la Amazonía, el sistema suma una amenaza nueva: **bajante del río y aislamiento por sequía**. El cálculo de aislamiento ya existe; se extiende a niveles mínimos de río, además de máximos. También se incorpora el **índice ENOS** (Niño 3.4 / ONI) como señal estacional, para anticipar con meses de antelación qué escenario espera a cada zona.

## 3. Qué se necesita

### 3.1 Marco institucional

- **CIC Plata** — Comité Intergubernamental Coordinador de los Países de la Cuenca del Plata. Cubre Corrientes y Artigas.
- **OTCA** — Organización del Tratado de Cooperación Amazónica. Cubre Manaos y la extensión amazónica.
- **CRC-SAS** — Centro Regional del Clima para el Sur de América del Sur (OMM). Aval técnico de los servicios meteorológicos.
- **CIIFEN** — Centro Internacional para la Investigación del Fenómeno de El Niño. Referencia regional sobre ENOS *(a verificar alcance de colaboración)*.

### 3.2 Datos por país

| País | Ríos y lluvia | Escuelas georreferenciadas | Factibilidad |
|---|---|---|---|
| Argentina | INA (sistema A5), Prefectura Naval, SMN | Mapa Educativo Nacional | Alta (operativo) |
| Brasil | ANA – HidroWeb (público), Servicio Geológico de Brasil (SGB, monitoreo del puerto de Manaos), CEMADEN, INMET | INEP – Catálogo de Escolas y microdatos del Censo Escolar *(coordenadas a confirmar en el diccionario de datos)* | Alta |
| Paraguay | Dirección de Meteorología e Hidrología | MEC – datos.mec.gov.py, licencia CC-BY 4.0, conjunto "Mapa Escolar" *(coordenadas a confirmar)* | Media |
| Uruguay | INUMET, DINAGUA | ANEP *(a verificar)* | Media |
| Bolivia | SENAMHI | Ministerio de Educación *(a verificar)* | Baja |

### 3.3 Datos públicos para calibración (sin convenio)

| Dato | Fuente | Uso |
|---|---|---|
| Historial de áreas inundadas desde 2015 | Copernicus Global Flood Monitoring (Sentinel-1), acceso por catálogo STAC de EODC | Identificar escuelas afectadas en eventos reales y calibrar el modelo. Confirmar con soporte de GFM que el archivo histórico completo ya esté descargable |
| Mapeos de eventos puntuales | Copernicus EMS – activaciones | Validación de eventos mayores |
| Índice ENOS (Niño 3.4 / ONI) | NOAA – Climate Prediction Center (público) | Señal estacional y relato del proyecto |
| Historial de desastres por municipio | DesInventar (Argentina: registros 1970–2015, desarrollado por CENTRO) | Validación gruesa e histórica; no cubre eventos recientes |
| Lluvia histórica por estación | Datos abiertos SMN / INMET | Calibrar umbrales de lluvia |
| Terreno de mayor detalle | IGN (ide.ign.gob.ar) e IDECorr (ide.corrientes.gob.ar) | El MDE-Ar público verificado es de 30 m; no se confirmó un producto de 5 m para Corrientes. Consultar ambos catálogos |
| Decretos de emergencia hídrica | Boletines oficiales provinciales/estaduales | Fechas y zonas oficiales de eventos |

### 3.3.1 Servicios esenciales cercanos a cada escuela

Para cada escuela, el sistema muestra los servicios más cercanos (hospitales y centros de salud, comisarías, bomberos, farmacias, Defensa Civil) y si el acceso a ellos queda cortado durante el evento. Sirve para planificar evacuaciones, saber a dónde derivar ante una emergencia y priorizar escuelas que quedan aisladas también de los servicios.

| Servicio | Argentina | Brasil | Uruguay |
|---|---|---|---|
| Salud | Registro Federal de Establecimientos de Salud (REFES/SISA) | Cadastro Nacional de Estabelecimentos de Saúde (CNES) | Ministerio de Salud Pública *(a verificar)* |
| Seguridad y emergencias | Ministerios de Seguridad provinciales, OpenStreetMap | Secretarías de Seguridad estaduales, OpenStreetMap | Ministerio del Interior, OpenStreetMap |
| Farmacias y otros | OpenStreetMap | OpenStreetMap, CNES | OpenStreetMap |

Los registros oficiales tienen prioridad; OpenStreetMap completa donde no hay registro. *(Cobertura y coordenadas de cada registro a verificar.)*

### 3.4 Convenios a gestionar

| Organismo | Objeto | Prioridad |
|---|---|---|
| INA (Argentina) | Series y pronóstico hidrológico con soporte | Alta |
| ANA / SGB (Brasil) | Series del río Negro en Manaos y alertas de bajante | Alta |
| Secretaría de Educación del Estado de Amazonas | Padrón de escuelas ribereñas y accesos fluviales | Alta |
| IGN (Argentina) | Terreno de detalle en puntos críticos (pedido iniciado) | Media |
| SMN / INMET | Umbrales oficiales de alerta por zona | Media |
| Prefectura Naval | Acceso formal a alturas de río | Baja (hoy operativo) |

### 3.5 Equipo

- Coordinación regional.
- Un referente técnico por país (hidrología y educación).
- Especialista en calibración hidrometeorológica.
- Traducción y adaptación al portugués.
- Acuerdo de uso de datos: la ubicación de escuelas con matrícula es información sensible.

### 3.6 Infraestructura

- Plan pago de Open-Meteo (proveedor de los pronósticos ECMWF y GloFAS); la cuota gratuita no alcanza para más de una jurisdicción.
- Hosting y monitoreo dedicados por jurisdicción.

### 3.7 Requerimientos de financiamiento: tecnologías con costo o convenio

| Tecnología | Para qué | Tipo de costo | Impacto |
|---|---|---|---|
| **WhatsApp Business Platform (Meta)** | Enviar alertas a directores y supervisores por WhatsApp, sin depender de que abran el mapa. Requiere verificación de la organización en Meta Business, plantillas de mensaje aprobadas y consentimiento previo de cada destinatario | Pago por mensaje según país y tipo de plantilla; puede requerir un proveedor intermediario (BSP) *(a verificar tarifas vigentes para Argentina, Brasil y Uruguay)* | Alto: adopción |
| **SMS de respaldo** | Llegar a zonas sin datos móviles, frecuente en escuelas ribereñas del Amazonas | Pago por mensaje a operador o agregador | Medio |
| **Open-Meteo plan comercial** | Pronósticos ECMWF y GloFAS para tres jurisdicciones; la cuota gratuita no alcanza | Suscripción mensual | Alto: estabilidad |
| **Google Flood Hub API** | Pronóstico de crecidas con IA como segunda opinión frente a GloFAS | Acceso por solicitud *(a verificar condiciones)* | Alto |
| **SAOCOM (CONAE)** | Radar satelital argentino para confirmar inundaciones | Convenio | Medio |
| **Imágenes comerciales de alta resolución** (Planet, Maxar u otros) | Ver el entorno inmediato de cada escuela con detalle de pocos metros | Licencia anual | Medio |
| **Google Earth Engine** | Procesar imágenes satelitales sin infraestructura propia | Licencia según uso y tipo de institución *(a verificar)* | Medio |
| **Infraestructura y monitoreo** | Hosting por jurisdicción, alertas de fallos, respaldo | Mensual | Medio |
| **Interoperabilidad de alertas (protocolo CAP)** | Publicar alertas en el formato estándar de la OMM para que Defensa Civil, SMN e INMET puedan recibirlas | Bajo costo técnico; el esfuerzo es institucional (ver nota) | Alto |

**Nota sobre el protocolo CAP.** CAP es un formato abierto (XML) y técnicamente simple de generar. No exige auditoría de seguridad por sí mismo. La complejidad es institucional: para que una alerta se reconozca como oficial, el emisor debe ser una autoridad de alerta reconocida (servicio meteorológico o protección civil) o publicar en acuerdo con ella. La propuesta es generar alertas CAP como **información de apoyo** y acordar con los organismos nacionales su uso, no emitir alertas oficiales propias.

### 3.8 Recursos de infraestructura

El sistema se despliega **una vez por región** con el mismo código: cada región tiene su aplicación, su base de datos, sus procesos programados y su almacenamiento. Encima hay servicios centrales compartidos. Los tamaños son una **estimación inicial a validar con métricas de la operación actual en Corrientes**.

Stack actual: aplicación web Next.js en contenedor, PostgreSQL, almacenamiento compatible con S3 y orquestación de contenedores (Coolify).

#### Por región (producción)

| Recurso | Para qué | Tamaño estimado |
|---|---|---|
| **Servidor de aplicación** | Mapa, fichas de escuela, APIs | 2 vCPU, 4 GB RAM |
| **Servidor de procesos programados** | Descarga de pronósticos, niveles de río, lluvia satelital y cálculo de riesgo (cada 15 min a 6 h) | 2–4 vCPU, 8 GB RAM |
| **Base de datos PostgreSQL administrada** (tipo RDS) | Escuelas, series de río, pronósticos por grilla, corridas de riesgo, partes | 2 vCPU, 8 GB RAM, 100 GB SSD ampliable, respaldo diario con 30 días de retención y recuperación a un punto en el tiempo |
| **Almacenamiento de objetos** (bucket S3) | Modelos de terreno, capas geográficas, mapas de inundación satelital, exportaciones, respaldos | 200 GB, con ciclo de vida para respaldos antiguos |
| **Dominio y certificado** | Acceso seguro por región | 1 subdominio por región |

#### Por región (pruebas, *staging*)

| Recurso | Tamaño estimado |
|---|---|
| Aplicación y procesos en un único servidor | 2 vCPU, 4 GB RAM |
| Base de datos | 1–2 vCPU, 4 GB RAM, 50 GB SSD |
| Bucket | 50 GB |

#### Servicios centrales (compartidos por todas las regiones)

| Recurso | Para qué | Tamaño estimado |
|---|---|---|
| **Procesamiento satelital bajo demanda** | Calcular áreas inundadas y de bajante con Sentinel-1 y Global Surface Water; se enciende solo durante el proceso | 8 vCPU, 32 GB RAM, por horas de uso. Alternativa: Google Earth Engine |
| **Monitoreo y alertas de operación** | Salud de procesos y fuentes de todas las regiones en un tablero | 2 vCPU, 4 GB RAM, 50 GB SSD |
| **Vista regional federada** | Resumen de todas las regiones sin mezclar sus bases | 1 vCPU, 2 GB RAM |
| **Integración continua** | Pruebas automáticas (incluidas las de extremo a extremo del mapa) antes de cada despliegue | Ejecutores de 4 vCPU, 8 GB RAM |
| **Registro de imágenes de contenedor** | Una imagen para todas las regiones | 20 GB |
| **Gestión de secretos** | Claves de APIs por región | Servicio administrado |

#### Cómo crece

- **Total = servicios centrales + N × (producción + staging por región).**
- Piloto de tres regiones (Corrientes, Manaos, Artigas): 3 conjuntos regionales y 1 central.
- La base de datos es el recurso que más crece: el historial de pronósticos y series de río suma volumen cada mes. Conviene una política de archivo de pronósticos antiguos al bucket.
- Si la región exige alojar los datos en el país (p. ej. Brasil por la LGPD), su conjunto regional se aloja allí; los servicios centrales no guardan datos de escuelas.

#### Servicios externos con costo (no son infraestructura propia)

Open-Meteo comercial, WhatsApp Business, SMS y licencias satelitales: ver sección 3.7. Open-Meteo se contrata **por región** porque cada despliegue consume su propia cuota.

## 4. Piloto propuesto

**Corrientes (AR) + Manaos/Amazonas (BR) + Artigas (UY).**

| Zona | Cuenca | Efecto de El Niño | Efecto de La Niña | Amenaza escolar |
|---|---|---|---|---|
| Corrientes | Plata (Paraná–Uruguay) | Lluvias e inundación | Sequía | Inundación y aislamiento |
| Artigas | Plata (río Uruguay) | Lluvias e inundación | Sequía | Inundación y aislamiento |
| Manaos | Amazonas (río Negro) | Sequía y bajante extrema | Crecida | Aislamiento por bajante e inundación |

- Muestra ENOS como fenómeno regional, con efectos opuestos según la zona.
- Corrientes ya opera; Artigas comparte río con Corrientes.
- Brasil publica sus datos hidrológicos y escolares de forma abierta.
- Tres países cumplen el mínimo de la Iniciativa de Bienes Públicos Regionales.

## 5. Encuadre

- **Marco de Sendai** para la Reducción del Riesgo de Desastres 2015–2030.
- **Marco Integral de Seguridad Escolar** (GADRRRES).
- Iniciativa **Alertas Tempranas para Todos** (ONU/OMM).
- BID: **Iniciativa de Bienes Públicos Regionales**. Financia con recursos no reembolsables; exige al menos tres países prestatarios (dos solo en casos binacionales excepcionales); pueden presentar instituciones públicas nacionales o subnacionales. La convocatoria 2026 cerró el 1/6/2026, por lo que el objetivo es la convocatoria 2027.

## 6. Prioridades inmediatas

1. Historial de áreas inundadas con Copernicus para calibrar con eventos reales.
2. Plan pago de Open-Meteo para estabilidad operativa.
3. Padrones escolares abiertos (Mapa Educativo Nacional, INEP).
4. Convenio con el INA y contacto con ANA/SGB y la Secretaría de Educación de Amazonas.
5. Aval técnico de CRC-SAS, CIC Plata y OTCA.
6. Extender el cálculo de aislamiento a la bajante del río.

## 7. Pendientes de verificación

Verificado en la web el 12/11/2026. Pendientes de confirmación directa con cada organismo:

- Bases y fecha de la convocatoria 2027 de Bienes Públicos Regionales del BID.
- Disponibilidad de descarga del archivo histórico completo de Global Flood Monitoring.
- Existencia de terreno de más detalle que 30 m para Corrientes (IGN / IDECorr).
- Coordenadas de escuelas en INEP (Brasil), MEC (Paraguay) y ANEP (Uruguay).

## Fuentes consultadas

- [BID – Iniciativa de Bienes Públicos Regionales](https://www.iadb.org/es/quienes-somos/como-estamos-organizamos/departamentos-oficinas-y-sectores/vicepresidencia-de-paises/iniciativa-de-bienes-publicos-regionales)
- [BID – Convocatoria 2024](https://www.iadb.org/es/noticias/bid-anuncia-convocatoria-de-propuestas-2024-para-proyectos-regionales-en-america-latina-y)
- [Bases convocatoria BPR 2019](https://uai.edu.ar/media/111735/bpr-bid-convocatoria-2019.pdf)
- [GFM – acceso por STAC](https://extwiki.eodc.eu/GFM/PUM/DataAccess/STAC)
- [GFM – el nuevo archivo](https://global-flood.emergency.copernicus.eu/media/events/4/the_new_gfm_archive.pdf)
- [CONAE – MDE-Ar 30 m](https://eo4society.esa.int/wp-content/uploads/2021/11/CONAE_DEM_JCandia.pdf)
- [DesInventar – UNDRR/CIMA](https://desinventar.cimafoundation.org/DesInventar/help/main.jsp)
- [OGP – Datos abiertos MEC Paraguay](https://www.opengovpartnership.org/es/members/paraguay/commitments/PY0044/)
- [Alagoas – escuelas con coordenadas (ejemplo INEP)](https://dados.al.gov.br/catalogo/en_AU/dataset/12eb1541-9f4a-4e54-9e7f-c63a37870fa3/resource/b7d3f761-a88f-41ae-96dd-61a49f7c433b)
