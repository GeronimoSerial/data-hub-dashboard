# Batch 02 — `/explorar`: catálogo unificado, búsqueda y filtros

## Misión

Convertir la exploración del Hub en una experiencia única centrada en intención, no en formato.

`Reporte`, `Tablero` y `Mapa` pasan a ser valores de un filtro.

---

## Resultado funcional

Ruta principal:

```text
/explorar
```

Dimensiones:

- Tema / categoría
- Nivel educativo
- Formato
- Territorio solo si existe metadata confiable
- búsqueda textual

Ejemplo:

```text
/explorar?tema=matricula&nivel=secundario&formato=mapa&q=goya
```

La URL es la fuente de verdad del estado compartible de filtros.

---

## Invariantes

- usar el catálogo publicado existente;
- no exponer borradores;
- no bypass de ACL al abrir recursos;
- no duplicar una query por cada vista;
- no crear un estado global complejo si URL/search params resuelve el problema;
- preservar compatibilidad de `/reportes`, `/tableros` y `/mapas`;
- nada de filtros interactivos manuales si existen primitives shadcn/Base UI.

---

## Componentes shadcn/Base UI esperables

- Input
- Select
- Popover
- Command
- Badge
- Button
- Card
- Toggle Group o Tabs solo si encaja con Base UI disponible
- Checkbox cuando `Más filtros` lo requiera
- Separator
- Skeleton
- Empty state compuesto con primitives existentes

---

## Tareas atómicas sugeridas

### Task 1 — Data/query contract

Auditar cómo `/reportes`, `/tableros` y `/mapas` obtienen datos.

Crear/normalizar una sola capa de lectura para el catálogo publicado.

Debe soportar las dimensiones necesarias sin duplicar mappers.

---

### Task 2 — URL filter schema

Crear un contrato tipado y reusable para:

- parsear;
- normalizar;
- serializar;
- eliminar defaults;
- rechazar valores inválidos.

La misma lógica debe ser consumible por server y UI cuando corresponda.

No permitir URLs con estados imposibles o parámetros basura acumulados.

---

### Task 3 — Explore page shell

Implementar `/explorar` con:

- título;
- descripción breve;
- búsqueda;
- filtros;
- contador;
- resultados;
- estados loading/empty/error si aplican.

---

### Task 4 — Filter bar desktop

Diseño recomendado:

```text
[ Tema ▾ ] [ Nivel ▾ ] [ Formato ▾ ] [ Más filtros ▾ ]
```

Filtros activos:

```text
Matrícula ×   Secundaria ×   Mapa ×   Limpiar
```

No mostrar un sidebar enorme por defecto.

---

### Task 5 — Filters mobile

Usar Sheet/Drawer/Dialog shadcn/Base UI según la mejor opción.

Debe conservar:

- filtros aplicados;
- aplicar/cancelar de forma entendible;
- scrolling correcto;
- foco;
- URL final equivalente a desktop.

---

### Task 6 — Resource result component

Crear `ResourceCard`/`ResourceListItem` como componentes de dominio.

Información mínima:

- tema/categoría;
- nombre;
- descripción;
- formato;
- nivel cuando aplique;
- fecha de actualización cuando exista;
- estado de acceso;
- acción.

No mostrar internals técnicos.

---

### Task 7 — Access presentation

Definir estados visuales:

```text
Público
Ingresar para consultar
Acceso restringido
```

La UI solo informa.

El servidor sigue decidiendo el acceso real.

---

### Task 8 — Legacy route compatibility

Resolver:

```text
/reportes
/tableros
/mapas
```

hacia la experiencia unificada sin romper enlaces históricos.

Preferencias posibles:

- redirect a `/explorar?formato=...`;
- wrapper server mínimo con canonical coherente.

El Team Leader decide según impacto SEO/histórico.

No afectar `/mapas/matricula`.

---

## Acceptance criteria

- [ ] `/explorar` muestra todo el catálogo publicado.
- [ ] formato es un filtro, no una sección aislada.
- [ ] filtros se reflejan en URL.
- [ ] recargar conserva el estado.
- [ ] back/forward funciona.
- [ ] URLs inválidas se normalizan sin romper la página.
- [ ] desktop y mobile ofrecen la misma capacidad.
- [ ] estados de acceso son comprensibles antes del click.
- [ ] no se filtran recursos borrador.
- [ ] abrir un recurso sigue pasando por ACL real.
- [ ] rutas históricas continúan funcionando.
- [ ] no se duplicaron queries/mappers.
- [ ] primitives interactivas son shadcn/Base UI.
- [ ] keyboard navigation y focus son correctos.
- [ ] lint/typecheck/build/tests relevantes pasan.

---

## Out of scope

- IA;
- related resources;
- share state del mapa;
- rediseño admin.
