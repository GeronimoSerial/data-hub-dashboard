# Pulido visual del mapa de infraestructura y del hub

## Objetivo

Pulido estético y de comprensión completo del hub, con foco en `/mapas/infraestructura`
(Operativa, Radar, Evolución). Hoy se ve mal: colores poco claros, iconografía que no se
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

### Global
26. Footer no alineado al contenedor del header (≈40 px de diferencia).
27. Portada: panel de totales arranca más abajo que el título.
28. Modo oscuro: mapa base sigue claro, textos secundarios con contraste bajo
    (contador del panel), foco amarillo persistente en "Admin".
29. Verificar responsive (≤ 768 px) de mapa, panel y ficha.

## Alcance

- `components/mapas/**`, `components/infraestructura/**`, `app/(hub)/mapas/**`,
  `lib/mapas/severidad-visual.ts`, `lib/mapas/peligro-capas.ts`, `components/mapas/overlay-styles.ts`,
  estilos globales y layout del hub cuando haga falta.
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

- [ ] V1 — Sistema visual: escala de severidad, tokens de color claro/oscuro, set de iconos
      Lucide para estados (suspendido, parcial, evacuado, centro de evacuados, sin reportar).
- [ ] V2 — Marcadores y clusters: reemplazar anillos/halos por iconos claros; cluster con
      significado explícito; leyenda coherente con lo dibujado; selección resaltada.
- [ ] V3 — Tooltip: caja que contiene el texto, contenido según el objeto apuntado (escuela,
      cluster, departamento), sin tapar el objetivo, se limpia al cambiar de modo.
- [ ] V4 — Ficha de escuela para cualquier escuela (clic en mapa o buscador): accesos, datos,
      partes/reportes; panel lateral en lugar de modal que tapa todo.
- [ ] V5 — Panel izquierdo: un solo buscador, indicadores con jerarquía, estado de filtros
      persistente, sin saltos; coherencia de contadores (hallazgo 10).
- [ ] V6 — Radar: capa de peligro sin tapar el mapa (estado sin evidencia legible), leyenda
      propia, horizontes deshabilitados distinguibles, buscador disponible.
- [ ] V7 — Pestañas y Evolución: centrado, estado activo, gráfico con rango útil, ranking con
      barras, footer.
- [ ] V8 — Global: alineación de footer/portada, modo oscuro (mapa base oscuro, contraste),
      controles de MapLibre en español, responsive.
- [ ] V9 — Verificación en navegador de cada sección (claro/oscuro, desktop/móvil) con capturas.
- [ ] V10 — QA estético completo, al detalle, hecho por el coordinador en el navegador cuando
      el N2 termina (pedido explícito del usuario). Recorre los 29 hallazgos y cada estado:
      hover, foco, capas combinadas, Radar por horizonte, ficha, Evolución, claro/oscuro,
      móvil. Lo que no pase vuelve al N2 como corrección.

## Checks

- `pnpm test` (vitest) verde; `pnpm lint`; `pnpm build`.
- Revisión en navegador de cada hallazgo, con antes/después.

## Estado

- Ruta: delegado (N2 → N3), a lanzar al terminar DB1 según pedido del usuario ("al final").
- Progreso: revisión hecha; implementación pendiente.
