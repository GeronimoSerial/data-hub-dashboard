import type { LucideIcon } from 'lucide-react';
import { TriangleAlert, Waves } from 'lucide-react';

import { PALETA_ESTADO_ALTURA, RELLENO_ESTACION_SIN_DATO } from './paleta-tonal';
import { GROSOR_TRAZO_ICONO, PIXEL_RATIO_ICONOS } from './colores-mapa';

// Rasterizador único de íconos del mapa: lo usan las capas `symbol` de
// MapLibre (estaciones, eventos, escuelas, clusters, accesos) y la leyenda,
// así ambos muestran exactamente el mismo dibujo. Un solo estilo: forma
// rellena + halo de 2 px + glifo Lucide real (blanco o tinta), trazo 2.

export type FormaInsignia = 'circulo' | 'cuadrado' | 'triangulo';

/** Glifo: componente de `lucide-react` o, para dibujos propios, trazos SVG en viewBox 24. */
export type GlifoIcono = LucideIcon | string;

export type OpcionesSvgIconoMapa = {
  forma: FormaInsignia;
  relleno: string;
  icono: GlifoIcono;
  /** Color del glifo. */
  colorGlifo?: string;
  /** Halo que separa la forma del basemap. */
  halo?: string;
  /** Contorno interior opcional (p. ej. relleno claro con borde del mismo tono). */
  anillo?: string;
  /** Tamaño CSS en px. */
  tamano?: number;
  /** Multiplicador de densidad del SVG emitido (2 para `pixelRatio: 2`). */
  escala?: number;
  /** Radio del círculo en unidades del viewBox 32 (por defecto 12). */
  radio?: number;
  /** Lado del glifo en unidades del viewBox 32 (por defecto 18). */
  tamanoGlifo?: number;
  /** Grosor del anillo interior en unidades del viewBox. */
  grosorAnillo?: number;
};

const VIEWBOX = 32;
const TAMANO_ICONO = 18;
const HALO_PX = 2;

function marcaForma(forma: FormaInsignia, extra: string, radio = 12): string {
  switch (forma) {
    case 'circulo':
      return `<circle cx="16" cy="16" r="${radio}" ${extra}/>`;
    case 'cuadrado':
      return `<rect x="5" y="5" width="22" height="22" rx="2" ${extra}/>`;
    case 'triangulo':
      return `<polygon points="16,4 28,27 4,27" ${extra}/>`;
  }
}

function markupGlifo(icono: GlifoIcono, color: string): string {
  if (typeof icono === 'string') {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${TAMANO_ICONO}" height="${TAMANO_ICONO}" viewBox="0 0 24 24" fill="none" ` +
      `stroke="${color}" stroke-width="${GROSOR_TRAZO_ICONO}" stroke-linecap="round" stroke-linejoin="round">${icono}</svg>`
    );
  }
  const { className, iconNode } = elementoLucide(icono).props;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TAMANO_ICONO}" height="${TAMANO_ICONO}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="${GROSOR_TRAZO_ICONO}" stroke-linecap="round" stroke-linejoin="round" class="lucide ${className}">` +
    `${trazosLucide(iconNode)}</svg>`
  );
}

type NodoIcono = [string, Record<string, string | number>][];

// lucide-react 1.x reads a context inside `Icon`, so rendering it with
// react-dom/server during client module evaluation throws "Invalid hook call".
// The forwardRef wrapper only forwards `iconNode` to `Icon`; calling its render
// directly yields that node without running any hook.
function elementoLucide(icono: LucideIcon): { props: { className: string; iconNode: NodoIcono } } {
  const { render } = icono as unknown as {
    render: (props: object, ref: null) => { props: { className: string; iconNode: NodoIcono } };
  };
  return render({}, null);
}

function trazosLucide(iconNode: NodoIcono): string {
  return iconNode
    .map(([etiqueta, atributos]) => {
      const attrs = Object.entries(atributos)
        .filter(([nombre]) => nombre !== 'key')
        .map(([nombre, valor]) => `${nombre}="${valor}"`)
        .join(' ');
      return `<${etiqueta} ${attrs}/>`;
    })
    .join('');
}

/** Standalone SVG string shared by MapLibre images and inline legend markers. */
export function svgIconoMapa({
  forma,
  relleno,
  icono,
  colorGlifo = '#ffffff',
  halo = '#ffffff',
  anillo,
  tamano = 32,
  escala = 1,
  radio = 12,
  tamanoGlifo = TAMANO_ICONO,
  grosorAnillo = 2,
}: OpcionesSvgIconoMapa): string {
  // El trazo va centrado sobre el borde: el doble del halo deseado, en
  // unidades del viewBox, deja HALO_PX px CSS por fuera de la forma.
  const grosorHalo = ((HALO_PX * 2 * VIEWBOX) / tamano).toFixed(2);
  // Triangle has a wider base at the bottom, so its icon sits slightly lower.
  const iconoY = (VIEWBOX - tamanoGlifo) / 2 + (forma === 'triangulo' ? 2 : 0);
  const iconoX = (VIEWBOX - tamanoGlifo) / 2;
  const px = tamano * escala;
  const borde = anillo && anillo !== relleno ? ` stroke="${anillo}" stroke-width="${grosorAnillo}"` : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">`,
    marcaForma(forma, `fill="${halo}" stroke="${halo}" stroke-width="${grosorHalo}" stroke-linejoin="round"`, radio),
    marcaForma(forma, `fill="${relleno}"${borde} stroke-linejoin="round"`, radio),
    `<svg x="${iconoX}" y="${iconoY}" width="${tamanoGlifo}" height="${tamanoGlifo}" viewBox="0 0 24 24">${markupGlifo(icono, colorGlifo)}</svg>`,
    '</svg>',
  ].join('');
}

export type OpcionesSvgInsignia = {
  forma: FormaInsignia;
  relleno: string;
  anillo: string;
  icono: LucideIcon;
  tamano?: number;
};

export function svgInsignia({ forma, relleno, anillo, icono, tamano = 32 }: OpcionesSvgInsignia): string {
  return svgIconoMapa({ forma, relleno, anillo, icono, tamano });
}

export type DefinicionInsignia = Omit<OpcionesSvgInsignia, 'tamano'> & {
  etiqueta: string;
};

export const INSIGNIAS = {
  'estacion-evacuacion': {
    forma: 'cuadrado',
    relleno: PALETA_ESTADO_ALTURA.evacuacion,
    anillo: PALETA_ESTADO_ALTURA.evacuacion,
    icono: Waves,
    etiqueta: 'Estación: evacuación',
  },
  'estacion-alerta': {
    forma: 'cuadrado',
    relleno: PALETA_ESTADO_ALTURA.alerta,
    anillo: PALETA_ESTADO_ALTURA.alerta,
    icono: Waves,
    etiqueta: 'Estación: alerta',
  },
  'estacion-normal': {
    forma: 'cuadrado',
    relleno: PALETA_ESTADO_ALTURA.normal,
    anillo: PALETA_ESTADO_ALTURA.normal,
    icono: Waves,
    etiqueta: 'Estación: normal',
  },
  'estacion-sin-dato': {
    forma: 'cuadrado',
    relleno: RELLENO_ESTACION_SIN_DATO,
    anillo: PALETA_ESTADO_ALTURA.sin_dato,
    icono: Waves,
    etiqueta: 'Estación: sin dato',
  },
  'evento-alta': {
    forma: 'triangulo',
    relleno: '#7c2d12',
    anillo: '#7c2d12',
    icono: TriangleAlert,
    etiqueta: 'Evento reportado: confianza alta',
  },
  'evento-media': {
    forma: 'triangulo',
    relleno: '#c2410c',
    anillo: '#c2410c',
    icono: TriangleAlert,
    etiqueta: 'Evento reportado: confianza media',
  },
  'evento-baja': {
    forma: 'triangulo',
    relleno: '#fdba74',
    anillo: '#c2410c',
    icono: TriangleAlert,
    etiqueta: 'Evento reportado: confianza baja',
  },
} satisfies Record<string, DefinicionInsignia>;

export type IdInsignia = keyof typeof INSIGNIAS;

export type MapaImagenes = {
  hasImage(id: string): boolean;
  addImage(id: string, img: HTMLImageElement, opts: { pixelRatio: number }): void;
  removeImage?(id: string): void;
};

function cargarImagen(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar el ícono'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Registers SVG images (emitted at `PIXEL_RATIO_ICONOS`x) on the map. Never
 * throws; failures are skipped. `reemplazar` swaps already registered images,
 * e.g. after a theme change that keeps the style.
 */
export async function registrarImagenesSvg(
  map: MapaImagenes,
  imagenes: ReadonlyArray<{ id: string; svg: string }>,
  reemplazar = false,
): Promise<void> {
  await Promise.all(
    imagenes.map(async ({ id, svg }) => {
      try {
        if (map.hasImage(id) && !reemplazar) return;
        const img = await cargarImagen(svg);
        if (map.hasImage(id)) {
          // A concurrent call may have registered it while the image loaded.
          if (!reemplazar || !map.removeImage) return;
          map.removeImage(id);
        }
        map.addImage(id, img, { pixelRatio: PIXEL_RATIO_ICONOS });
      } catch {
        // Skip the image; the map keeps working without it.
      }
    }),
  );
}

/** Registers every missing marker as a MapLibre image. Never throws; failures are skipped. */
export function registrarInsignias(
  map: MapaImagenes,
  ids: readonly string[] = Object.keys(INSIGNIAS),
): Promise<void> {
  const imagenes = ids.flatMap((id) => {
    const definicion = INSIGNIAS[id as IdInsignia];
    if (!definicion) return [];
    const { etiqueta: _etiqueta, ...opciones } = definicion;
    return [{ id, svg: svgIconoMapa({ ...opciones, tamano: 32, escala: PIXEL_RATIO_ICONOS }) }];
  });
  return registrarImagenesSvg(map, imagenes);
}

/** Inline marker for the legend, rendered from the same SVG as the map image. */
export function IconoMapaLeyenda({ svg }: { svg: string }) {
  return <span className="map-insignia" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Inline legend marker rendered from the same SVG used on the map. */
export function InsigniaLeyenda({ id, tamano = 24 }: { id: IdInsignia; tamano?: number }) {
  const { etiqueta: _etiqueta, ...opciones } = INSIGNIAS[id];
  return <IconoMapaLeyenda svg={svgInsignia({ ...opciones, tamano })} />;
}

// ── River station markers and level chips ────────────────────────────────
// Every station is a pin with a river glyph, coloured by state (sin dato is a
// solid slate pin, never faint), so it is recognisable at any zoom, with a
// level chip beside it (`icon-text-fit`).

export type EstadoEstacion = 'evacuacion' | 'alerta' | 'normal' | 'sin_dato';

const PIN_SIN_DATO = '#64748b';

export const ESTILO_PASTILLA_ESTACION: Record<EstadoEstacion, { fondo: string; borde: string; texto: string; pin: string; glifo: string }> = {
  evacuacion: { fondo: PALETA_ESTADO_ALTURA.evacuacion, borde: '#ffffff', texto: '#ffffff', pin: PALETA_ESTADO_ALTURA.evacuacion, glifo: '#ffffff' },
  alerta: { fondo: PALETA_ESTADO_ALTURA.alerta, borde: '#ffffff', texto: '#1c1c1c', pin: PALETA_ESTADO_ALTURA.alerta, glifo: '#1c1c1c' },
  normal: { fondo: '#ffffff', borde: PALETA_ESTADO_ALTURA.normal, texto: '#14532d', pin: PALETA_ESTADO_ALTURA.normal, glifo: '#ffffff' },
  sin_dato: { fondo: '#ffffff', borde: PIN_SIN_DATO, texto: '#334155', pin: PIN_SIN_DATO, glifo: '#ffffff' },
};

const sufijoEstado = (estado: EstadoEstacion) => (estado === 'sin_dato' ? 'sin-dato' : estado);
export const idPastillaEstacion = (estado: EstadoEstacion) => `estacion-pastilla-${sufijoEstado(estado)}`;
export const idMarcadorEstacion = (estado: EstadoEstacion) => `estacion-marcador-${sufijoEstado(estado)}`;

/** 9-slice pill (2x pixels: 64x40), stretched around the label with `icon-text-fit`. */
export function svgPastillaEstacion(estado: EstadoEstacion): string {
  const { fondo, borde } = ESTILO_PASTILLA_ESTACION[estado];
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="40" viewBox="0 0 64 40">' +
    `<rect x="1" y="2" width="62" height="36" rx="18" fill="rgba(0,0,0,0.12)"/>` +
    `<rect x="2" y="1" width="60" height="35" rx="17.5" fill="${fondo}" stroke="${borde}" stroke-width="3"/>` +
    '</svg>'
  );
}

const PATH_PIN = 'M14 2C7.4 2 2 7.3 2 13.8c0 8.2 10 17.6 11.1 18.6a1.3 1.3 0 0 0 1.8 0C16 31.4 26 22 26 13.8 26 7.3 20.6 2 14 2z';

/** Station pin, 24x30 CSS px (emitted at `escala`x), anchored at its tip. */
export function svgMarcadorEstacion(estado: EstadoEstacion, escala = 2): string {
  const { pin, glifo } = ESTILO_PASTILLA_ESTACION[estado];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${24 * escala}" height="${30 * escala}" viewBox="0 0 28 35">` +
    '<ellipse cx="14" cy="33" rx="5" ry="1.6" fill="rgba(0,0,0,0.22)"/>' +
    `<path d="${PATH_PIN}" fill="#ffffff" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/>` +
    `<path d="${PATH_PIN}" fill="${pin}" stroke="rgba(0,0,0,0.18)" stroke-width="0.75"/>` +
    `<svg x="7" y="6.8" width="14" height="14" viewBox="0 0 ${TAMANO_ICONO} ${TAMANO_ICONO}">${markupGlifo(Waves, glifo)}</svg>` +
    '</svg>'
  );
}

type MapaImagenesEstirables = MapaImagenes & {
  addImage(
    id: string,
    img: HTMLImageElement,
    opts: { pixelRatio: number; stretchX?: [number, number][]; stretchY?: [number, number][]; content?: [number, number, number, number] },
  ): void;
};

const ESTADOS_ESTACION: EstadoEstacion[] = ['evacuacion', 'alerta', 'normal', 'sin_dato'];

/** Registers station chips (stretchable) and dots. Never throws. */
export async function registrarSimbolosEstacion(map: MapaImagenesEstirables): Promise<void> {
  await registrarImagenesSvg(map, ESTADOS_ESTACION.map((estado) => ({ id: idMarcadorEstacion(estado), svg: svgMarcadorEstacion(estado) })));
  await Promise.all(
    ESTADOS_ESTACION.map(async (estado) => {
      const id = idPastillaEstacion(estado);
      try {
        if (map.hasImage(id)) return;
        const img = await cargarImagen(svgPastillaEstacion(estado));
        if (map.hasImage(id)) return;
        map.addImage(id, img, {
          pixelRatio: PIXEL_RATIO_ICONOS,
          stretchX: [[20, 44]],
          stretchY: [[17, 21]],
          content: [14, 5, 50, 33],
        });
      } catch {
        // Skip the chip; the pin still marks the station.
      }
    }),
  );
}
