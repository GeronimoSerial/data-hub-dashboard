# Hub de Datos — Plan maestro de transformación por batches

## Objetivo

Transformar el Hub de Datos de Análisis Educativo desde una navegación centrada en formatos (`Reportes`, `Tableros`, `Mapas`) hacia una experiencia escalable y comprensible para usuarios no técnicos, sin romper el modelo actual de recursos, autenticación ni ACL.

La experiencia final debe girar alrededor de:

1. **Buscar**
2. **Explorar**
3. **Abrir un recurso**
4. **Entenderlo**
5. **Compartir exactamente lo que se está viendo**

Los formatos siguen existiendo, pero pasan a ser una dimensión/filtro del contenido, no la arquitectura principal.

---

## Principios no negociables

- Next.js App Router y la arquitectura existente son la base; no reescribir el proyecto sin necesidad.
- El catálogo continúa siendo público.
- El contenido restringido continúa protegido por sesión + ACL.
- `/admin` continúa siendo exclusivo de staff.
- Las rutas especiales protegidas, como el mapa de matrícula, deben conservar su enforcement.
- No debilitar ni duplicar la lógica de ACL.
- Mantener DRY/SOLID y evitar lógica paralela para la misma responsabilidad.
- Mobile y desktop tienen el mismo nivel de importancia.
- Navegación orientada a intención del usuario, no a términos técnicos.
- No exponer términos internos como `ACL`, `storageKey`, `audienciaUserIds`, `ruta`, etc. en la UI pública.
- No introducir un chatbot genérico flotante.
- La IA se limita inicialmente a **“Explícame este recurso”**.
- El sharing debe preservar el estado relevante de la vista cuando exista.

### Regla UI obligatoria

Toda primitiva de interacción debe provenir de **shadcn/ui configurado sobre Base UI**.

Está permitido crear componentes de producto como:

- `ResourceCard`
- `ExploreFilters`
- `ResourceHeader`
- `ExplainResource`
- `ShareView`

pero deben ser composiciones de primitivas shadcn/Base UI.

No está permitido implementar manualmente equivalentes de:

- Dialog
- Sheet
- Drawer
- Select
- Tabs
- Tooltip
- Popover
- Dropdown Menu
- Navigation Menu
- Accordion
- Command
- Breadcrumb
- Sidebar
- Checkbox / Radio / Switch
- cualquier otra primitiva existente en shadcn

Si una primitiva necesaria existe en shadcn, debe instalarse y usarse. Si no existe una opción compatible con Base UI, adaptar el diseño a primitivas disponibles antes que crear una implementación headless propia.

---

## Protocolo de ejecución

Leer primero:

- `01_ORCHESTRATION_PROTOCOL.md`

Después ejecutar los batches en orden.

```text
Batch 01 — Foundation + navegación
        ↓
Batch 02 — Explorar + filtros + URLs
        ↓
Batch 03 — Home orientada a descubrimiento
        ↓
Batch 04 — Experiencia de recurso
        ↓
Batch 05 — "Explícame este recurso"
        ↓
Batch 06 — Compartir vista
        ↓
Batch 07 — Administración
        ↓
Batch 08 — Integración, QA y hardening
```

---

## Archivos

| Archivo | Propósito | Dependencias |
|---|---|---|
| `01_ORCHESTRATION_PROTOCOL.md` | Contrato del team leader y agentes | — |
| `02_BATCH_01_FOUNDATION_NAVIGATION.md` | Design system, Base UI, header y navegación | protocolo |
| `03_BATCH_02_EXPLORE.md` | `/explorar`, búsqueda, filtros y compatibilidad | Batch 01 |
| `04_BATCH_03_HOME.md` | Home orientada a temas/intención | Batches 01–02 |
| `05_BATCH_04_RESOURCE_EXPERIENCE.md` | Página de recurso, metadata, acceso y relacionados | Batches 01–03 |
| `06_BATCH_05_EXPLAIN_RESOURCE.md` | Resumen conciso contextual con IA | Batch 04 |
| `07_BATCH_06_SHARE_VIEW.md` | URLs compartibles y restauración de estado | Batches 02, 04 |
| `08_BATCH_07_ADMIN.md` | Navegación y UX editorial/admin | Batches 01–06 |
| `09_BATCH_08_QA_HARDENING.md` | QA integral y cierre de transformación | todos |

---

## Arquitectura de información objetivo

```text
/
├── Explorar
│   ├── Tema
│   ├── Nivel educativo
│   ├── Territorio (si existe metadata suficiente)
│   └── Formato
│       ├── Reporte
│       ├── Tablero
│       └── Mapa
│
├── Recurso
│   ├── Qué es
│   ├── Metadata útil
│   ├── Acceso
│   ├── Explícame este recurso
│   ├── Compartir
│   └── Relacionados
│
└── Cuenta
    └── Administración (solo staff)
```

Rutas objetivo mínimas:

```text
/
/explorar
/recursos/[id]
/login
/admin
```

Rutas históricas como `/reportes`, `/tableros` y `/mapas` pueden preservarse por compatibilidad y resolverse hacia vistas prefiltradas de `/explorar`.

Las rutas especiales protegidas pueden permanecer físicamente donde están aunque la navegación visible no copie esa estructura.

---

## Resultado esperado

Al terminar todos los batches:

- el usuario no necesita entender qué es un “recurso” para navegar;
- puede descubrir información por intención, tema, nivel y formato;
- sabe antes del click si el contenido requiere acceso;
- puede entender rápidamente qué hace un recurso;
- puede compartir la misma vista que está observando;
- la administración se siente separada de la experiencia pública;
- toda la UI interactiva se apoya en shadcn/Base UI;
- no existen dos implementaciones distintas para la misma lógica;
- la ACL original sigue siendo la fuente de verdad;
- mobile, teclado, estados vacíos, loading y errores están resueltos.
