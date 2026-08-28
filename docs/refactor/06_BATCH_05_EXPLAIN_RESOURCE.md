# Batch 05 — “Explícame este recurso”

## Misión

Implementar una única capacidad de IA deliberadamente simple:

> **Explícame este recurso**

No es un chatbot.

No debe abrir una conversación infinita.

Debe producir un resumen corto, claro y contextual de qué hace el recurso y cómo interpretarlo.

---

## UX objetivo

Trigger:

```text
[ ✨ Explícame este recurso ]
```

Resultado en Dialog/Sheet shadcn/Base UI:

```text
¿Qué es este recurso?

Este mapa muestra ...

Te puede servir para:
• ...
• ...

Qué mirar primero:
...
```

Objetivo aproximado: 80–140 palabras, salvo que la información disponible no justifique tanto contenido.

No llenar espacio.

---

## Principio de seguridad

La IA nunca puede convertirse en un bypass de ACL.

### Recurso público

Puede usar metadata y contenido público permitido.

### Recurso restringido + usuario autorizado

Puede usar contenido al que el usuario ya tiene acceso, sujeto a la política definida.

### Recurso restringido + usuario no autorizado

Solo puede explicar la metadata pública de catálogo.

Nunca enviar al proveedor/modelo:

- bytes del archivo;
- texto extraído;
- datos del mapa;
- metadata interna restringida;

si el usuario no pasó el mismo control de acceso requerido para ese contenido.

---

## Fuente de verdad para la explicación

Prioridad:

1. metadata editorial confiable;
2. descripción;
3. categorías/niveles/tags;
4. metadata específica del viewer;
5. contenido extraído solamente cuando está permitido y ya existe una pipeline confiable.

No implementar extracción pesada de PDFs en este batch salvo que ya exista.

No alucinar contenido a partir del filename.

Si el recurso no tiene suficiente información:

> “No hay suficiente contexto publicado para generar una explicación confiable.”

es mejor que inventar.

---

## Contrato de salida

Preferir salida estructurada validada server-side.

Ejemplo conceptual:

```ts
{
  summary: string,
  usefulFor: string[],
  firstLook: string | null
}
```

Límites:

- `summary`: corto;
- `usefulFor`: máximo 3;
- `firstLook`: una frase;
- sin markdown arbitrario si no es necesario.

Validar el schema antes de renderizar.

---

## Cache

Evitar pagar/generar lo mismo en cada apertura.

Crear una estrategia simple basada en fingerprint de los inputs usados.

Ejemplo conceptual:

```text
resource id
+ updatedAt
+ description hash
+ relevant metadata version
```

Si cambia el contenido fuente, invalidar.

No compartir cache de contenido restringido con una key que pueda responder a usuarios no autorizados.

---

## Tareas atómicas sugeridas

### Task 1 — AI capability audit

Inspeccionar si el proyecto ya posee:

- provider;
- AI SDK;
- env vars;
- server abstraction;
- logging;
- schema validation.

No agregar una segunda stack si ya existe una adecuada.

---

### Task 2 — Explain input builder

Crear una única función server-side que construya el contexto permitido según:

- recurso;
- sesión;
- ACL;
- tipo de recurso.

Debe ser testeable sin llamar al modelo.

---

### Task 3 — Output schema + prompt

Crear prompt estable.

Debe instruir al modelo a:

- explicar;
- no especular;
- no inventar conclusiones;
- no afirmar causalidad;
- usar lenguaje no técnico;
- ser conciso;
- reconocer falta de contexto.

La salida debe respetar el schema.

---

### Task 4 — Server endpoint/action

Implementar la llamada server-side.

Revalidar acceso en cada request.

Nunca confiar en un `canAccess=true` enviado por frontend.

Aplicar timeouts/errores según capacidades existentes.

---

### Task 5 — Cache/fingerprint

Implementar cache mínima y segura.

Tests para:

- hit;
- miss;
- invalidación;
- recurso restringido;
- cambios de metadata.

---

### Task 6 — UI

Usar primitive shadcn/Base UI apropiado, preferentemente Dialog o Sheet según diseño.

Estados:

- idle;
- loading;
- success;
- insufficient-context;
- error.

El botón debe ser entendible sin conocer IA.

---

### Task 7 — Safety/regression tests

Casos mínimos:

- público sin sesión;
- restringido sin sesión;
- restringido autorizado;
- restringido no autorizado;
- recurso inexistente;
- modelo falla;
- schema inválido;
- cache existente.

---

## Acceptance criteria

- [ ] existe un único CTA “Explícame este recurso”.
- [ ] no es un chat.
- [ ] respuesta es corta y entendible.
- [ ] no inventa contenido cuando falta contexto.
- [ ] output está validado.
- [ ] endpoint revalida ACL.
- [ ] usuario no autorizado nunca provoca envío de contenido restringido.
- [ ] cache no produce leaks entre estados de acceso.
- [ ] UI usa shadcn/Base UI.
- [ ] loading/error son claros.
- [ ] la página sigue siendo útil si el proveedor AI está caído.
- [ ] no existe una segunda stack AI redundante.
- [ ] tests/checks pasan.

---

## Out of scope

- chat global;
- RAG global;
- embeddings;
- agente que controla mapas;
- preguntas abiertas;
- análisis causal;
- generación de decisiones o recomendaciones institucionales.
