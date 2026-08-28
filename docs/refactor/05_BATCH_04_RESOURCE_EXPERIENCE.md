# Batch 04 — Experiencia de recurso

## Misión

Convertir `/recursos/[id]` y los recursos con `ruta` especial en una experiencia comprensible antes, durante y después de abrir el contenido.

El usuario debe entender:

1. qué es;
2. qué información contiene;
3. a qué tema/nivel pertenece;
4. si puede acceder;
5. cómo abrirlo;
6. qué recursos relacionados existen;
7. cómo pedir una explicación;
8. cómo compartirlo.

---

## Invariantes

- `puedeAbrir` y guards existentes siguen siendo la fuente de verdad.
- no mover enforcement al cliente.
- no servir bytes/contenido restringido a usuarios no autorizados.
- `ruta` especial y `storageKey` deben continuar soportados.
- breadcrumbs son semánticos.
- related resources nunca debe revelar metadata no publicada.
- no crear un segundo viewer si el existente ya cubre el formato.

---

## Estructura sugerida

```text
Breadcrumb

Tema / tipo
Título
Descripción

Metadata útil
Nivel · Formato · Actualizado · Fuente si existe

[ Abrir ] [ Explícame este recurso ] [ Compartir ]

Contenido / Viewer

También puede interesarte
```

El CTA exacto depende del tipo:

- Abrir mapa
- Abrir tablero
- Ver reporte
- Descargar archivo

---

## Tareas atómicas sugeridas

### Task 1 — Resource presentation model

Crear un view model server-side que transforme internals a lenguaje de UI.

Ejemplo conceptual:

```ts
{
  title,
  description,
  formatLabel,
  topicLabel,
  levelLabels,
  updatedAt,
  accessState,
  primaryAction,
  breadcrumbs
}
```

No filtrar internals crudos hacia componentes.

---

### Task 2 — Resource header

Crear composición reutilizable con primitives shadcn/Base UI.

Debe resolver:

- jerarquía tipográfica;
- badges útiles;
- metadata;
- CTA;
- acciones secundarias;
- mobile stacking.

---

### Task 3 — Semantic breadcrumbs

Ejemplos:

```text
Explorar / Matrícula / Matrícula provincial
```

No:

```text
Inicio / Recursos / r15
```

---

### Task 4 — Access state UX

Estados:

```text
Público
Ingresar para consultar
Acceso restringido
```

Si el catálogo permite ver la ficha pero no el contenido, mostrar una explicación humana.

Nunca reemplazar el redirect/403 real por esta UI.

---

### Task 5 — Viewer integration

Integrar la cabecera con:

- archivo subido;
- rutas estáticas;
- mapa matrícula;
- otros estáticos existentes.

No romper CSP, gate ni descarga.

---

### Task 6 — Related resources

Crear recomendación determinística, sin IA.

Orden sugerido:

1. misma categoría/tema;
2. tags compartidos;
3. nivel compatible;
4. recencia;
5. excluir recurso actual.

Limitar cantidad.

No crear un motor complejo.

---

### Task 7 — Action slots

Dejar contratos claros para:

- `ExplainResource`
- `ShareView`

Este batch puede renderizar los triggers deshabilitados/feature-flagged solo si los siguientes batches se implementan inmediatamente; idealmente evitar placeholders visibles.

---

## Acceptance criteria

- [ ] la ficha explica el recurso sin jerga interna.
- [ ] breadcrumbs son semánticos.
- [ ] CTA usa lenguaje específico al formato.
- [ ] metadata relevante es consistente.
- [ ] acceso se comunica antes de intentar abrir.
- [ ] ACL real sigue en servidor.
- [ ] viewer existente sigue funcionando.
- [ ] related resources no usa IA ni contenido restringido.
- [ ] no hay recursos duplicados en relacionados.
- [ ] mobile y desktop correctos.
- [ ] componentes interactivos shadcn/Base UI.
- [ ] tests/checks relevantes pasan.

---

## Out of scope

- implementación de IA;
- serialización del estado específico de cada mapa;
- rediseño de datos de origen.
