import { createElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TriangleAlert, Waves } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

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
  return renderToStaticMarkup(
    createElement(icono, { size: TAMANO_ICONO, color, strokeWidth: GROSOR_TRAZO_ICONO }),
  );
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

// ── River station level chips ─────────────────────────────────────────────
// A station reads as a compact chip: the state colour is the chip itself and
// the river level is the text inside (MapLibre `icon-text-fit`). At low zoom
// the same colour shows as a small dot. "Sin dato" is always a faint dot.

export type EstadoEstacion = 'evacuacion' | 'alerta' | 'normal' | 'sin_dato';

export const ESTILO_PASTILLA_ESTACION: Record<EstadoEstacion, { fondo: string; borde: string; texto: string }> = {
  evacuacion: { fondo: PALETA_ESTADO_ALTURA.evacuacion, borde: '#ffffff', texto: '#ffffff' },
  alerta: { fondo: PALETA_ESTADO_ALTURA.alerta, borde: '#ffffff', texto: '#1c1c1c' },
  normal: { fondo: '#ffffff', borde: PALETA_ESTADO_ALTURA.normal, texto: '#14532d' },
  sin_dato: { fondo: '#ffffff', borde: PALETA_ESTADO_ALTURA.sin_dato, texto: '#4b5563' },
};

const sufijoEstado = (estado: EstadoEstacion) => (estado === 'sin_dato' ? 'sin-dato' : estado);
export const idPastillaEstacion = (estado: EstadoEstacion) => `estacion-pastilla-${sufijoEstado(estado)}`;
export const idPuntoEstacion = (estado: EstadoEstacion) => `estacion-punto-${sufijoEstado(estado)}`;

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

/** Small state dot (2x pixels) used at low zoom and for stations without data. */
export function svgPuntoEstacion(estado: EstadoEstacion): string {
  const { fondo, borde } = ESTILO_PASTILLA_ESTACION[estado];
  const relleno = estado === 'normal' || estado === 'sin_dato' ? borde : fondo;
  const r = estado === 'sin_dato' ? 6 : 8;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    `<circle cx="12" cy="12" r="${r + 2.5}" fill="#ffffff"/><circle cx="12" cy="12" r="${r}" fill="${relleno}"/>` +
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
  await registrarImagenesSvg(map, ESTADOS_ESTACION.map((estado) => ({ id: idPuntoEstacion(estado), svg: svgPuntoEstacion(estado) })));
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
        // Skip the chip; the dot still marks the station.
      }
    }),
  );
}

/** Legend chip with the same colours as the map chip. */
export function PastillaEstacionLeyenda({ estado, texto }: { estado: EstadoEstacion; texto: string }) {
  const { fondo, borde, texto: color } = ESTILO_PASTILLA_ESTACION[estado];
  if (estado === 'sin_dato') return <IconoMapaLeyenda svg={svgPuntoEstacion(estado).replace('width="24" height="24"', 'width="14" height="14"')} />;
  return (
    <span className="map-pastilla-estacion" aria-hidden="true" style={{ background: fondo, borderColor: borde, color }}>
      {texto}
    </span>
  );
}
