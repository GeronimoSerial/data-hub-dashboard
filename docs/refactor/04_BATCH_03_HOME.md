# Batch 03 — Home orientada a descubrimiento

## Misión

Rediseñar `/` para que un usuario no técnico pueda encontrar información sin decidir primero si necesita un mapa, reporte o tablero.

---

## Jerarquía objetivo

```text
Hero + búsqueda
        ↓
Explorar por tema
        ↓
Explorar por nivel
        ↓
Recursos destacados / accesos útiles
        ↓
Actualizaciones recientes
        ↓
Explorar por formato
```

`Reporte`, `Tablero` y `Mapa` siguen visibles, pero con menor jerarquía.

---

## Invariantes

- no duplicar la lógica de filtros de `/explorar`;
- cada acceso de home debe producir una URL válida de `/explorar`;
- no inventar categorías que no existan en datos;
- no hardcodear listas que ya están disponibles en el catálogo/taxonomías;
- no mostrar datos restringidos en previews;
- no crear carousels/manual interactions si hay componente shadcn adecuado.

---

## Tareas atómicas sugeridas

### Task 1 — Home data model

Definir qué datos de `/api/hub` o capa server existente necesita la home:

- categorías/temas;
- niveles;
- recientes;
- destacados si ya existe señal;
- formatos.

Si no existe `featured`, no inventar un sistema editorial en este batch. Usar una regla simple y documentada o dejar la sección fuera.

---

### Task 2 — Hero search

Construir un hero donde la acción principal sea:

```text
¿Qué información estás buscando?
```

La búsqueda debe dirigir a `/explorar?q=...`.

No crear otra implementación de búsqueda.

---

### Task 3 — Explore by topic

Renderizar categorías reales como accesos claros.

Cada elemento apunta a `/explorar?...`.

Evitar tarjetas decorativas gigantes si un patrón más compacto comunica mejor.

---

### Task 4 — Explore by level

Mismo contrato de URL que `/explorar`.

No introducir jerarquías educativas nuevas si el modelo no las posee.

---

### Task 5 — Recent resources

Reutilizar `ResourceCard`/`ResourceListItem`.

No crear “home cards” incompatibles con el catálogo.

---

### Task 6 — Format fallback

Mantener:

- Reportes
- Tableros
- Mapas

como accesos secundarios hacia `/explorar?formato=...`.

---

## Acceptance criteria

- [ ] la primera decisión del usuario ya no es elegir formato.
- [ ] búsqueda conduce a `/explorar`.
- [ ] tema y nivel usan taxonomías reales.
- [ ] cards reutilizan componentes del catálogo.
- [ ] no hay duplicación de filter/search logic.
- [ ] formatos siguen siendo descubribles.
- [ ] recursos restringidos no filtran contenido.
- [ ] responsive completo.
- [ ] navegación por teclado.
- [ ] primitives shadcn/Base UI.
- [ ] build/checks pasan.

---

## Out of scope

- IA;
- favoritos;
- recomendaciones personalizadas;
- analytics avanzados;
- modo historia.
