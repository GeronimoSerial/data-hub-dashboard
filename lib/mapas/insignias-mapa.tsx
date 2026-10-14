import { createElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TriangleAlert, Waves } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

export type FormaInsignia = 'circulo' | 'cuadrado' | 'triangulo';

export type OpcionesSvgInsignia = {
  forma: FormaInsignia;
  relleno: string;
  anillo: string;
  icono: LucideIcon;
  tamano?: number;
};

const VIEWBOX = 32;
const TAMANO_ICONO = 18;

function marcaForma(forma: FormaInsignia, extra: string): string {
  switch (forma) {
    case 'circulo':
      return `<circle cx="16" cy="16" r="12" ${extra}/>`;
    case 'cuadrado':
      return `<rect x="5" y="5" width="22" height="22" ${extra}/>`;
    case 'triangulo':
      return `<polygon points="16,4 28,27 4,27" ${extra}/>`;
  }
}

/** Standalone SVG string shared by MapLibre images and inline legend markers. */
export function svgInsignia({
  forma,
  relleno,
  anillo,
  icono,
  tamano = 32,
}: OpcionesSvgInsignia): string {
  const iconoMarkup = renderToStaticMarkup(
    createElement(icono, { size: TAMANO_ICONO, color: '#ffffff', strokeWidth: 2.5 }),
  );
  // Triangle has a wider base at the bottom, so its icon sits slightly lower.
  const iconoY = (VIEWBOX - TAMANO_ICONO) / 2 + (forma === 'triangulo' ? 2 : 0);
  const iconoX = (VIEWBOX - TAMANO_ICONO) / 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tamano}" height="${tamano}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">`,
    marcaForma(forma, `fill="${relleno}" stroke="#ffffff" stroke-width="3"`),
    marcaForma(forma, `fill="none" stroke="${anillo}" stroke-width="3"`),
    `<svg x="${iconoX}" y="${iconoY}" width="${TAMANO_ICONO}" height="${TAMANO_ICONO}" viewBox="0 0 24 24">${iconoMarkup}</svg>`,
    '</svg>',
  ].join('');
}

export type DefinicionInsignia = Omit<OpcionesSvgInsignia, 'tamano'> & {
  etiqueta: string;
};

export const INSIGNIAS = {
  'estacion-evacuacion': {
    forma: 'cuadrado',
    relleno: '#b91c1c',
    anillo: '#b91c1c',
    icono: Waves,
    etiqueta: 'Estación: evacuación',
  },
  'estacion-alerta': {
    forma: 'cuadrado',
    relleno: '#f59e0b',
    anillo: '#f59e0b',
    icono: Waves,
    etiqueta: 'Estación: alerta',
  },
  'estacion-normal': {
    forma: 'cuadrado',
    relleno: '#15803d',
    anillo: '#15803d',
    icono: Waves,
    etiqueta: 'Estación: normal',
  },
  'estacion-sin-dato': {
    forma: 'cuadrado',
    relleno: '#6b7280',
    anillo: '#9ca3af',
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

type MapaImagenes = {
  hasImage(id: string): boolean;
  addImage(id: string, img: HTMLImageElement, opts: { pixelRatio: number }): void;
};

function cargarImagen(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la insignia'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Registers every missing marker as a MapLibre image. Never throws; failures are skipped. */
export async function registrarInsignias(
  map: MapaImagenes,
  ids: readonly string[] = Object.keys(INSIGNIAS),
): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      try {
        const definicion = INSIGNIAS[id as IdInsignia];
        if (!definicion || map.hasImage(id)) return;
        const img = await cargarImagen(svgInsignia({ ...definicion, tamano: 64 }));
        map.addImage(id, img, { pixelRatio: 2 });
      } catch {
        // Skip the marker; the map keeps working without it.
      }
    }),
  );
}

/** Inline legend marker rendered from the same SVG used on the map. */
export function InsigniaLeyenda({ id, tamano = 24 }: { id: IdInsignia; tamano?: number }) {
  const { etiqueta: _etiqueta, ...opciones } = INSIGNIAS[id];
  return (
    <span
      className="map-insignia"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svgInsignia({ ...opciones, tamano }) }}
    />
  );
}
