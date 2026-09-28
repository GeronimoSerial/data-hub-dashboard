# Pulido visual del mapa de infraestructura

## Objetivo

Pulido estético y de comprensión completo de `/mapas/infraestructura` (Operativa, Radar,
Evolución y ficha de escuela). Solo el mapa de infraestructura: el resto del hub queda fuera
de alcance (aclaración explícita del usuario). Hoy se ve mal: colores poco claros, iconografía que no se
entiende (círculos sobre círculos, círculos grises sin sentido), labels confusos, pestañas no
centradas y sin estado activo, tooltip roto. Además, seleccionar una escuela desde el mapa
no muestra nada.

## Origen

Revisión directa en navegador (Chrome DevTools, 1440+ px, tema claro y oscuro) del
2026-09-28 sobre `feat/renovación` @ `b3228c4`, demo con datos ficticios
(`scripts/seed-demo-partes.mjs`, 47 escuelas afectadas sobre 2005 del padrón fixture).

## Preferencias explícitas del usuario

- Iconografía con `lucide-react` (ya es dependencia) o SVG reales y comprensibles.
  Nada de círculos grises sin significado ni anillos concéntricos para codificar estado.
- El mapa tiene que indicar claramente; no agregar visuales que no se entienden.
- Al seleccionar una escuela, mostrar sus datos relevantes: accesos, datos de la escuela,
  reportes (partes), etc.

## Hallazgos (evidencia del navegador)

### Mapa — Operativa
1. Clusters de colores (rojo/naranja/amarillo/azul) con número sin explicar: no se sabe si el
   número cuenta escuelas o alumnos ni qué color manda en el cluster.
2. La leyenda dice "Tamaño: fijo, igual para todas las escuelas", pero los clusters varían de
   tamaño. La leyenda contradice al mapa.
3. Estado de servicio codificado con anillos (grueso/fino/sin anillo) y halos grises para
   "sin reportar": con capas activas aparecen círculos sobre círculos ilegibles. Evacuado
   (cuadrado) y centro de evacuados (triángulo) no se distinguen a nivel cluster.
4. Capa "Todas las escuelas (padrón)": círculos grises grandes sin número ni significado claro.
5. Puntos de escuela a zoom alto: diminutos; la escuela seleccionada no queda resaltada.
6. Tooltip: el texto desborda la caja blanca; muestra el departamento aunque el cursor esté
   sobre una escuela o un cluster; tapa el elemento apuntado; queda clavado al cambiar de
   modo (Situación actual / Radar) y al cerrar la ficha.
7. Clic en una escuela del padrón sin afectación: cursor `pointer` pero no pasa nada.
8. Dos buscadores "BUSCAR ESCUELA" duplicados en el panel izquierdo (uno arriba de
   Indicadores y otro dentro de Filtros).
9. Panel izquierdo flota a media altura con scroll propio; al cargar, el panel salta.
   "Filtros del mapa" se colapsa solo al cambiar de modo.
10. Contador "2005 escuelas · 46 afectadas · 2.3%" contradice "Indicadores consolidados:
    Escuelas: 47" (verificar la fuente de verdad; puede ser un caso de datos, no solo visual).
    Además una etiqueta del mapa ("GOYA 1") se superpone al contador.
11. "Indicadores consolidados" es una lista de texto plano `Label: N`; sin jerarquía visual.
12. Leyenda verbosa, iconos de leyenda chicos y desalineados respecto al texto.
13. Controles de MapLibre en inglés ("Zoom in", "Zoom out", "Drag to rotate…").
14. Pestañas Operativa/Evolución pegadas a la izquierda, no centradas, sin indicador de activa.

### Mapa — Radar
15. "Peligro meteorológico estimado" pinta la provincia completa con un gris opaco que tapa
    departamentos y clusters (estado sin evidencia a pantalla completa).
16. La leyenda sigue siendo la de Situación actual; no hay leyenda propia del radar visible.
17. Botones de horizonte (Ahora / 24 h / 72 h / 7–10 días) deshabilitados se ven iguales a
    los habilitados.
18. Riesgo por escuela y riesgo de acceso: más círculos grises superpuestos a los clusters.
19. En Radar no hay buscador de escuela.

### Ficha de escuela (modal)
20. Modal centrado que tapa header y mapa; prever panel lateral o drawer.
21. Severidad codificada con formas distintas (círculo, cuadrado, triángulo) además del color.
22. No muestra accesos, datos de la escuela (nivel, matrícula, secciones), ni enlace a sus
    partes/reportes. Debe mostrarse para cualquier escuela del padrón, afectada o no.

### Evolución
23. Pestañas y subpestañas sin estado activo visible; contenido salta unos px entre subpestañas.
24. Gráfico de "Servicio caído" arranca el 01/01 y desperdicia ~90 % del ancho; recortar al
    rango con datos o al período vigente.
25. Sin footer; ranking de departamentos sin apoyo visual (barras).

### Transversal al mapa
26. (Fuera de alcance: footer global del hub desalineado.)
27. (Fuera de alcance: portada del hub.)
28. Modo oscuro: mapa base sigue claro, textos secundarios con contraste bajo
    (contador del panel), foco amarillo persistente en "Admin".
29. Verificar responsive (≤ 768 px) de mapa, panel y ficha.

Los hallazgos 26 y 27 quedan registrados pero fuera de alcance.

## Alcance

- `components/mapas/**`, `components/infraestructura/**`, `app/(hub)/mapas/**`,
  `lib/mapas/severidad-visual.ts`, `lib/mapas/peligro-capas.ts`, `components/mapas/overlay-styles.ts`,
  y estilos propios del mapa. No tocar portada, catálogo, header ni footer globales del hub.
- Ficha de escuela para cualquier escuela del padrón (hallazgos 7 y 22), con los datos ya
  disponibles en las APIs existentes (`/api/mapas/infraestructura/*`, `/api/infraestructura/radar`).
  Si falta un dato, reportarlo; no inventar endpoints sin consultar.
- Fuera de alcance: cambios de base de datos (DB1 en curso), jobs, ingesta, Open-Meteo.

## Restricciones

- Todo el copy de UI en español neutro y profesional; identificadores en el idioma del código.
- Iconos: `lucide-react` o SVG propios; stroke consistente; un solo set por superficie.
- Color: una escala de severidad accesible (contraste AA), consistente en mapa, leyenda y ficha;
  color nunca como único canal (icono + label).
- No romper tests existentes; tests de comportamiento para la ficha y la interacción de clic.
- No consumir cupo de Open-Meteo (demo con `ENOS_JOBS_ENABLED=false`).

## Tareas

- [x] V1 — Sistema visual: escala de severidad, tokens de color claro/oscuro, set de iconos
      Lucide para estados (suspendido, parcial, evacuado, centro de evacuados, sin reportar).
      Ver `docs/ejecucion-enos/pulido/registro.md`.
- [x] V2 — Marcadores y clusters: reemplazar anillos/halos por iconos claros; cluster con
      significado explícito; leyenda coherente con lo dibujado; selección resaltada.
      TypeScript + tests verdes; verificación visual en navegador pendiente (V9).
- [x] V3 — Tooltip: caja que contiene el texto, contenido según el objeto apuntado (escuela,
      cluster, departamento), sin tapar el objetivo, se limpia al cambiar de modo.
      TypeScript + tests verdes; verificación visual pendiente (V9).
- [x] V4 — Ficha de escuela para cualquier escuela (clic en mapa o buscador): accesos, datos,
      partes/reportes; panel lateral en lugar de modal que tapa todo. Completa (incluye
      hallazgo 20, panel lateral con Sheet). Gap de datos (matrícula/nivel por escuela):
      autorizado por N1 el 2026-09-28 y resuelto (`datosPadron` agregado, sin datos
      nominales, ver registro).
- [x] V5 — Panel izquierdo: un solo buscador, indicadores con jerarquía, estado de filtros
      persistente, sin saltos; coherencia de contadores (hallazgo 10). Completa; hallazgo 10
      resuelto con copy aclaratorio (conceptos legítimamente distintos, no un bug).
- [x] V6 — Radar: capa de peligro sin tapar el mapa (estado sin evidencia legible), leyenda
      propia, horizontes deshabilitados distinguibles, buscador disponible. Completa.
      Nota de producto pendiente: si el buscador en Radar debe alimentar el panel de riesgo
      además de/en vez de la ficha (no resuelto sin decisión de producto).
- [x] V7 — Pestañas y Evolución: centrado, estado activo, gráfico con rango útil, ranking con
      barras, footer. Completa salvo footer (investigado: su ausencia es intencional, decisión
      de producto pendiente si se quiere cambiar).
- [x] V8 — Transversal al mapa: modo oscuro del mapa (mapa base oscuro, contraste),
      controles de MapLibre en español, responsive. Completa; verificación visual (V9)
      pendiente, sobre todo del filtro CSS del mapa oscuro.
- [ ] V9 — Verificación en navegador de cada sección (claro/oscuro, desktop/móvil) con capturas.
      NO HECHA por N2: chrome-devtools-mcp/claude-in-chrome no disponibles para mí, y el
      camino alternativo (Playwright headless propio) topó con un bug de entorno real —
      Chromium en este entorno nunca adjunta la cookie de sesión a una navegación de página
      (probado con 5+ métodos distintos; curl sí funciona siempre con el mismo cookie).
      Decisión de N1 (2026-09-28): cortar V9 acá, se absorbe en el QA visual de V10 con
      navegador real. Ver detalle y evidencia en el registro.
- [ ] V10 — QA estético completo del mapa de infraestructura, al detalle, hecho por el coordinador en el navegador cuando
      el N2 termina (pedido explícito del usuario). Recorre los 29 hallazgos y cada estado:
      hover, foco, capas combinadas, Radar por horizonte, ficha, Evolución, claro/oscuro,
      móvil. Lo que no pase vuelve al N2 como corrección.
      Primera pasada hecha 2026-09-28 11:00 UTC por N1 (chrome-devtools, demo :3202,
      1448 px y 390 px, claro y oscuro). Resuelto: pestañas centradas con estado activo
      (Base UI usa data-active, confirmado en DOM), panel izquierdo anclado arriba con un
      solo buscador e indicadores con jerarquía, contadores coherentes (47/47 con nota),
      leyenda con íconos Lucide, ficha para cualquier escuela con datos de padrón,
      Evolución con rango útil, mapa base oscuro, controles en español, sin scroll
      horizontal en móvil. Pendiente, vuelve como V11.

### V11 — Correcciones del QA de N1 (bloquean el cierre)

- [ ] Q1 — Clusters engañosos: el número es el total de escuelas del padrón agrupadas y el
      color la peor severidad, así que un círculo rojo "490" en San Cosme se lee como 490
      escuelas críticas. El cluster tiene que comunicar AFECTADAS: número = escuelas
      afectadas del grupo, color = peor severidad; un grupo sin afectadas no se dibuja
      como alerta (sólo aparece, discreto y sin color de severidad, si está activa la capa
      del padrón). Tooltip del cluster: "490 escuelas · 3 afectadas (1 crítica, 2 altas)".
      Leyenda acorde.
- [ ] Q2 — Radar, riesgo por escuela: vuelven los círculos grises con anillo. Reemplazar por
      ícono Lucide coloreado por nivel de riesgo; "sin dato" no se dibuja como marcador.
- [ ] Q3 — Radar, peligro por departamento sin evidencia: pinta la provincia con un velo gris.
      Sin dato = sin relleno; el estado vacío se comunica en el panel, no tapando el mapa.
- [ ] Q4 — Radar, leyenda: hoy es una lista con viñetas e íconos sin muestra de color. Usar
      muestras del MISMO color que el mapa + ícono, alineados, sin viñetas.
- [ ] Q5 — Escuela seleccionada: se marca con un anillo amarillo. Usar un marcador claro
      (p. ej. MapPin de Lucide o el ícono de la escuela agrandado con contorno), no un anillo.
- [ ] Q6 — Ficha:
      a) encabezado con nombre, CUE, localidad y departamento para CUALQUIER escuela (hoy la
         de una escuela sin afectación dice sólo "FICHA DEL PARTE");
      b) los estados vacíos ("Sin afectaciones…", "Sin datos del padrón…") en texto normal
         secundario, no en tamaño de titular;
      c) panel lateral NO modal: sin velo que oscurezca y bloquee el mapa y el header; el
         mapa sigue usable; cerrar con Esc y con el botón, alineado dentro del panel;
      d) severidad con un único código (ícono + color + texto), no círculo/cuadrado/triángulo
         según el nivel (hallazgo 21 sigue abierto);
      e) accesos: riesgo de acceso de la escuela si el radar lo tiene (o "Sin dato de
         acceso"), y enlaces a su historial de partes y a cargar o actualizar el parte;
      f) "Ver alumnos alcanzados" como acción secundaria liviana, no un botón grande por
         afectación.
- [ ] Q7 — Tooltip: cerca del borde superior queda cortado debajo de la barra de pestañas.
      Reposicionar según el espacio disponible (anchor automático).
- [ ] Q8 — Escuelas a zoom alto: puntos de ~8 px que se pierden entre los íconos de
      colectivo del mapa base. Ícono de escuela (School de Lucide) de tamaño legible,
      coloreado por severidad; mapa base por defecto "Mapa claro" o con los POI de
      transporte atenuados.
- [ ] Q9 — Modo oscuro: los clusters pasan a salmón pastel, se pierde la escala de severidad
      y el contraste del número. Escala de severidad con contraste AA también en oscuro.
- [ ] Q10 — Móvil (390 px): el botón "Buscar escuelas" queda tapado por la atribución del
      mapa, que también pisa "Pantalla completa". Reubicar para que nada se superponga.
- [ ] Q11 — Leyenda de Situación actual: ítems de varias líneas con el ícono desalineado;
      "Sin reportar" usa un halo diminuto (usar un ícono Lucide, p. ej. Clock o
      SignalZero); textos más cortos.
- [ ] Q12 — Evolución (menor): línea escalonada (los datos son diarios, la curva suavizada
      sugiere valores intermedios), tooltip por punto y marcas del eje regulares.

## Checks

- `pnpm test` (vitest) verde; `pnpm lint`; `pnpm build`.
- Revisión en navegador de cada hallazgo, con antes/después.

## Estado

- Ruta: delegado (N2 → N3), cerrado por N2.
- Progreso: V1-V8 completos e implementados (íconos, tooltip, ficha con panel
  lateral y datos de padrón, panel izquierdo, Radar, pestañas/Evolución,
  transversal), `pnpm exec tsc --noEmit`, suite completa (223 archivos /
  1982 tests) y `pnpm build` verdes. V9 no hecha (bloqueo de entorno real,
  no de la app — ver registro), derivada a V10 por decisión de N1. Demo
  levantada y estable en :3202 para el QA de N1.
