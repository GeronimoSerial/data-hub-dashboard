# Gobierno de Corrientes — Design System

> Adaptación digital del **Manual de Marca Gobierno de Corrientes V1.1 (2026)**.  
> Este documento traduce los lineamientos institucionales a criterios utilizables en interfaces web y productos digitales. Cuando el manual no define una medida web específica, se indica como **adaptación digital** y no como regla oficial del manual.

---

## 1. Principios de identidad

La identidad visual debe comunicar una institución cercana, clara, reconocible y contemporánea, manteniendo continuidad con los símbolos históricos de la Provincia de Corrientes.

Principios rectores:

- **Coherencia:** todos los productos deben compartir tipografía, color, iconografía y tratamiento visual.
- **Claridad:** la jerarquía de información debe ser evidente y la lectura prioritaria.
- **Institucionalidad:** la marca no debe deformarse, reinterpretarse ni mezclarse con recursos ajenos al sistema.
- **Cercanía:** el lenguaje visual debe representar personas, territorio y realidad provincial de manera auténtica.
- **Accesibilidad:** el contraste, la legibilidad y el subtitulado deben considerarse desde el diseño inicial.

---

## 2. Marca

### 2.1 Marca principal

La versión horizontal de **Gobierno de Corrientes** es la firma principal para materiales y aplicaciones institucionales.

Reglas:

- Utilizar únicamente archivos oficiales de la marca.
- No reconstruir la firma tipográfica con una fuente equivalente.
- No alterar proporciones, inclinación, orden, paleta o composición.
- No agregar sombras, relieves, gradientes, contenedores ni elementos adicionales.
- Priorizar la versión a color sobre fondo blanco o fondos con contraste suficiente.
- Sobre fondos oscuros, utilizar la variante oficial preparada para dicho contexto.

### 2.2 Zona de exclusión

Debe conservarse siempre el área libre definida por la grilla oficial. Ningún texto, ícono, borde, fotografía ni componente UI debe invadirla.

**Adaptación digital:** al implementar la marca dentro de headers, cards o footers, nunca utilizar padding visual menor al área de exclusión presente en el archivo oficial.

### 2.3 Tamaños mínimos digitales

Según el manual:

- Marca horizontal: **60 px** mínimo.
- Isotipo horizontal: **40 px** mínimo.
- Marca vertical: **93 px** mínimo.
- Isotipo vertical: **40 px** mínimo.

No reducir por debajo de estas dimensiones.

### 2.4 Claim

Claim institucional:

**“Siempre cerca”**

Debe utilizarse únicamente en las composiciones oficiales previstas por el sistema y no reorganizarse manualmente.

---

## 3. Paleta cromática

### 3.1 Colores principales

| Token | Nombre | HEX | RGB | Uso recomendado en digital |
|---|---|---:|---:|---|
| `--color-yellow-400` | Amarillo Claro | `#FACD05` | 250, 205, 5 | Acentos, módulos, destacados |
| `--color-yellow-500` | Amarillo Oscuro | `#FAAE05` | 250, 174, 5 | Acentos secundarios |
| `--color-red-400` | Rojo Claro | `#F4492E` | 244, 73, 46 | Acentos / señalización visual |
| `--color-red-500` | Rojo Oscuro | `#EA2F09` | 234, 47, 9 | Énfasis de alta presencia |
| `--color-burgundy-700` | Bordó | `#6F0603` | 111, 6, 3 | Fondos/acento oscuro |
| `--color-sky-300` | Celeste Claro | `#90B4E1` | 144, 180, 225 | Fondos suaves, módulos |
| `--color-sky-500` | Celeste Oscuro | `#769FD3` | 118, 159, 211 | Acentos y superficies |
| `--color-green-400` | Verde Claro | `#719C29` | 113, 156, 41 | Acentos temáticos |
| `--color-green-700` | Verde Oscuro | `#356F23` | 53, 111, 35 | Fondo/acento oscuro |
| `--color-gray-100` | Gris Claro | `#EDEDED` | 237, 237, 237 | Fondos neutros, divisores suaves |
| `--color-neutral-900` | Negro institucional | `#2E2D2C` | 46, 45, 44 | Texto principal, fondos oscuros |
| `--color-white` | Blanco | `#FFFFFF` | 255, 255, 255 | Fondo y texto inverso |

### 3.2 Paleta extendida

Solo debe utilizarse cuando sea necesaria una mayor diferenciación de información —por ejemplo, gráficos, mapas, tablas, campañas temáticas o efemérides— sin reemplazar la paleta principal.

| Token | Nombre | HEX |
|---|---|---:|
| `--color-orange-400` | Naranja Claro | `#F68E13` |
| `--color-orange-500` | Naranja Oscuro | `#F36D21` |
| `--color-ochre-600` | Ocre | `#B45F04` |
| `--color-pink-300` | Rosa | `#FA8072` |
| `--color-teal-700` | Turquesa Oscuro | `#008275` |
| `--color-teal-400` | Turquesa Claro | `#58A89A` |
| `--color-blue-700` | Azul | `#1F5D9B` |
| `--color-violet-700` | Violeta Oscuro | `#6B5CB7` |
| `--color-violet-400` | Violeta Claro | `#8E7CC3` |

### 3.3 Perfil de color

Para producción digital, el perfil indicado es:

`sRGB IEC61966-2.1`

### 3.4 Reglas de uso

- No modificar los valores cromáticos oficiales.
- No generar gradientes con la paleta institucional.
- No introducir transparencias arbitrarias en recursos de identidad.
- En imágenes o superficies complejas, elegir blanco o negro según contraste.
- Para texto, cumplir al menos WCAG AA cuando sea posible.

---

## 4. Tipografía

La familia tipográfica del sistema gráfico es **Barlow**, disponible en Google Fonts.

### 4.1 Titulares

**Barlow Semi Condensed ExtraBold**

- Uso: títulos principales.
- Caja: **ALTA**.
- Tracking: `0`.
- Máximo recomendado por el manual: **4 renglones**.

Ejemplo del manual:

- 96 pt
- interlínea 90 pt

**Adaptación digital:** conservar una relación de line-height compacta, aproximadamente `0.94–1.0` para titulares grandes.

```css
.heading-display {
  font-family: "Barlow Semi Condensed", sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0;
  line-height: 0.96;
}
```

### 4.2 Subtítulos y destacados

**Barlow SemiBold**

- Uso: destacados y subtítulos.
- El ejemplo institucional utiliza caja alta.
- Máximo recomendado: **6 renglones**.

```css
.heading-secondary,
.eyebrow,
.highlight {
  font-family: "Barlow", sans-serif;
  font-weight: 600;
}
```

### 4.3 Texto de lectura

**Barlow Regular**

- Uso: párrafos y textos corridos.
- Priorizar legibilidad y respiración vertical.

Ejemplo del manual:

- 22 pt
- interlínea 31 pt

Relación aproximada de line-height: `1.4`.

```css
.body {
  font-family: "Barlow", sans-serif;
  font-weight: 400;
  line-height: 1.4;
}
```

### 4.4 Uso especial

- **Barlow Bold:** pastillas, subtítulos audiovisuales.
- **Barlow Bold Italic:** segunda pastilla en composiciones dobles y diferenciación de voz en off.
- **Montserrat Variable Bold:** denominación de ministerios cuando conviven con la marca Gobierno de Corrientes.

---

## 5. Escala tipográfica digital

> **Adaptación digital** basada en las jerarquías del manual, no una escala oficial publicada.

```css
:root {
  --font-display-xl: clamp(3.5rem, 8vw, 6rem);
  --font-display-lg: clamp(2.75rem, 6vw, 4.5rem);
  --font-h1: clamp(2.25rem, 5vw, 3.75rem);
  --font-h2: clamp(1.875rem, 4vw, 3rem);
  --font-h3: clamp(1.5rem, 3vw, 2.25rem);
  --font-h4: 1.25rem;
  --font-body-lg: 1.125rem;
  --font-body: 1rem;
  --font-body-sm: 0.875rem;
}
```

---

## 6. Iconografía

El sistema utiliza iconos de línea, simples y reconocibles.

Especificaciones del manual:

- Grilla base: **24 px**.
- Trazo: **1.7 pt**.
- Esquinas redondeadas.
- Terminaciones redondeadas.

### Reglas de implementación

- Mantener una estética uniforme en todo el producto.
- No mezclar iconos outline con iconos filled sin una razón funcional.
- No alterar el grosor de forma arbitraria.
- Preferir `stroke-linecap="round"` y `stroke-linejoin="round"`.
- Diseñar/normalizar sobre viewBox `0 0 24 24`.

```css
.icon {
  width: 24px;
  height: 24px;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

---

## 7. Pastillas / badges

Las pastillas son recursos de énfasis para información breve.

Reglas oficiales:

- Solo para información relevante y corta.
- Máximo: **1 renglón**.
- Deben convivir con un ícono alusivo.
- El ancho debe adaptarse al contenido sin espacios excedentes.
- Tipografía principal: **Barlow Bold**.
- En composiciones de dos pastillas, la variable secundaria es **Barlow Bold Italic**.
- Se pueden utilizar colores de la paleta institucional.
- Pueden colocarse sobre color o fotografía siempre que haya contraste suficiente.

### Adaptación a componente UI

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  padding: 0.5rem 0.875rem;
  font-family: "Barlow", sans-serif;
  font-weight: 700;
  white-space: nowrap;
}
```

No convertir las pastillas institucionales automáticamente en botones: su función original es informativa, no interactiva.

---

## 8. Trama gráfica

La trama modular es un recurso complementario construido con formas geométricas abstractas e íconos vinculados al territorio, naturaleza, producción y comunidad.

Puede utilizarse:

- como fondo;
- como acento;
- como apoyo en comunicaciones específicas.

Debe existir una relación conceptual con el contenido.

### Prohibiciones

- No usar dos o más colores dentro de un mismo módulo.
- No aplicar sombras ni efectos.
- No colocar texto sobre la trama.
- No alterar la paleta.
- No agregar trazos ni convertir módulos a línea.
- No usar gradientes ni transparencias.
- No colocar la marca sobre la trama.
- No rotar ni inclinar módulos.
- No usar elementos de la trama sueltos sin contenedor.
- No deformar proporciones.
- No utilizarla meramente como decoración.

**En web:** la trama nunca debe competir con navegación, CTAs, formularios o contenido principal.

---

## 9. Fotografía

### 9.1 Dirección general

Priorizar fotografía y video propios, producidos en territorio. Evitar imágenes genéricas de banco cuando exista la posibilidad de representar la realidad provincial directamente.

El estilo debe sentirse:

- auténtico;
- territorial;
- natural;
- humano;
- documental antes que publicitario.

### 9.2 Naturaleza

Las imágenes deben representar flora, fauna y paisajes provinciales con autenticidad y respeto.

Se permiten:

- detalles;
- planos medios;
- planos generales;
- panorámicas.

La elección depende del objetivo comunicacional.

### 9.3 Personas y narrativa audiovisual

Para testimonios en cámara:

- utilizar planos levemente angulares cuando aporte presencia;
- combinar secuencias y variedad de planos;
- mantener escenarios y territorio reales;
- incorporar **subtítulos siempre**.

Subtítulos: **Barlow Bold**.  
Voz en off diferenciada: **Barlow Bold Italic**.

### 9.4 No utilizar

- fotos demasiado oscuras;
- filtros;
- imágenes desaturadas;
- imágenes evidentemente generadas por IA;
- fotos movidas o fuera de foco;
- selfies;
- recortes sobre cabeza o extremidades;
- fotos grupales posadas;
- imágenes sobreexpuestas/quemadas;
- puestas en escena artificiales o excesivamente producidas.

---

## 10. Layout digital

> **Adaptación digital.** El manual define lenguaje visual, pero no una grilla responsive web específica.

### Contenedor

```css
:root {
  --container-max: 1280px;
  --page-gutter-mobile: 20px;
  --page-gutter-tablet: 32px;
  --page-gutter-desktop: 48px;
}
```

- Desktop: hasta 12 columnas.
- Tablet: 8 columnas.
- Mobile: 4 columnas.
- Mantener alineaciones firmes y bloques visuales amplios.
- Evitar interfaces excesivamente densas.

### Espaciado

Sistema recomendado de múltiplos de 4:

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128`

Los títulos institucionales pueden usar espacios verticales más agresivos y composiciones editoriales con bloques de color amplios.

---

## 11. Superficies y bordes

> **Adaptación digital.**

La identidad del manual es predominantemente plana y geométrica.

Por eso:

- preferir fondos sólidos;
- evitar glassmorphism;
- evitar sombras decorativas fuertes;
- evitar gradientes;
- evitar radios excesivamente grandes que cambien el carácter institucional;
- utilizar bordes o contraste de superficie antes que efectos volumétricos.

Tokens sugeridos:

```css
:root {
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --border-default: 1px solid #EDEDED;
}
```

---

## 12. Botones

> **Adaptación digital.** El manual no define botones web.

El diseño debe derivar de la lógica plana, directa y de alto contraste del sistema.

### Primary

- fondo `#2E2D2C` o un color institucional adecuado al contexto;
- texto blanco;
- Barlow SemiBold/Bold;
- alto mínimo 44 px;
- sin gradiente ni sombra decorativa.

### Secondary

- fondo transparente o blanco;
- borde de alto contraste;
- texto negro institucional.

### Focus

Todo elemento interactivo debe tener un `focus-visible` claramente perceptible y no depender únicamente del color.

---

## 13. Cards

> **Adaptación digital.**

Las cards deben ser simples y editoriales:

- fotografía auténtica;
- título fuerte en Barlow;
- poca ornamentación;
- jerarquía clara;
- color institucional como acento, no como ruido visual.

Evitar:

- sombras intensas;
- fondos con gradiente;
- combinaciones de muchos colores simultáneamente;
- iconografía de estilos diferentes.

---

## 14. Datos, mapas y visualizaciones

La paleta extendida está explícitamente prevista para piezas complejas como mapas, gráficos y tablas.

Reglas:

- utilizar primero la paleta principal;
- sumar la extendida solo cuando sea necesaria diferenciación adicional;
- no depender únicamente del color para distinguir categorías;
- combinar color con etiquetas, patrones o símbolos cuando corresponda;
- reservar `#2E2D2C` para texto/ejes y `#EDEDED` para estructuras secundarias siempre que el contraste sea suficiente.

---

## 15. Accesibilidad

El manual prioriza legibilidad, contraste y subtitulado. En interfaces digitales esto se traduce en:

- WCAG AA como base de contraste para texto e interacción;
- cuerpos de texto legibles, idealmente desde 16 px;
- targets interactivos de al menos 44 × 44 px;
- subtítulos para contenido audiovisual narrado;
- estados de foco visibles;
- no transmitir información únicamente mediante color;
- texto alternativo en imágenes informativas;
- evitar texto sobre tramas o imágenes sin superficie/contraste suficiente.

---

## 16. Motion

> **Adaptación digital.** El manual no define animaciones de UI.

Las transiciones deben ser discretas y funcionales:

- `150–250ms` para hover/focus;
- `250–400ms` para entradas de bloques;
- evitar efectos elásticos o excesivamente lúdicos;
- no deformar ni animar internamente la marca institucional;
- respetar `prefers-reduced-motion`.

---

## 17. Design tokens base

```css
:root {
  /* Brand */
  --corrientes-yellow-light: #FACD05;
  --corrientes-yellow-dark: #FAAE05;
  --corrientes-red-light: #F4492E;
  --corrientes-red-dark: #EA2F09;
  --corrientes-burgundy: #6F0603;
  --corrientes-sky-light: #90B4E1;
  --corrientes-sky-dark: #769FD3;
  --corrientes-green-light: #719C29;
  --corrientes-green-dark: #356F23;
  --corrientes-gray-light: #EDEDED;
  --corrientes-black: #2E2D2C;
  --corrientes-white: #FFFFFF;

  /* Extended */
  --corrientes-orange-light: #F68E13;
  --corrientes-orange-dark: #F36D21;
  --corrientes-ochre: #B45F04;
  --corrientes-pink: #FA8072;
  --corrientes-teal-dark: #008275;
  --corrientes-teal-light: #58A89A;
  --corrientes-blue: #1F5D9B;
  --corrientes-violet-dark: #6B5CB7;
  --corrientes-violet-light: #8E7CC3;

  /* Semantic — digital adaptation */
  --background: var(--corrientes-white);
  --foreground: var(--corrientes-black);
  --surface-muted: var(--corrientes-gray-light);
  --border: #D9D9D9;

  /* Typography */
  --font-display: "Barlow Semi Condensed", sans-serif;
  --font-sans: "Barlow", sans-serif;
  --font-ministry: "Montserrat", sans-serif;

  /* Layout */
  --container-max: 1280px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

---

## 18. Checklist de implementación

Antes de aprobar una pantalla o pieza digital:

- [ ] Se utiliza la marca oficial sin reconstrucciones ni deformaciones.
- [ ] Se respeta la zona de exclusión.
- [ ] La marca no baja del tamaño mínimo permitido.
- [ ] Los colores provienen de la paleta oficial.
- [ ] No hay gradientes decorativos ni efectos ajenos al sistema.
- [ ] Los títulos utilizan Barlow Semi Condensed ExtraBold.
- [ ] Los textos usan Barlow Regular y los destacados Barlow SemiBold.
- [ ] Los iconos mantienen grilla de 24 px, trazo uniforme y terminaciones redondeadas.
- [ ] Las pastillas contienen información breve y, cuando aplica, un ícono.
- [ ] La trama no contiene texto ni marca superpuesta.
- [ ] Las fotografías se sienten auténticas y vinculadas al territorio.
- [ ] No se utilizaron filtros, selfies, fotografías genéricas o IA evidente.
- [ ] El contraste de texto e interacción es suficiente.
- [ ] El contenido audiovisual narrado tiene subtítulos.
- [ ] La interfaz mantiene una estética plana, clara e institucional.

---

## 19. Regla de prioridad

Ante cualquier conflicto entre este archivo y el **Manual de Marca Gobierno de Corrientes V1.1**, prevalece el manual oficial. Este `design.md` funciona como una traducción operativa para diseño y desarrollo digital, no como reemplazo de la normativa de marca.
