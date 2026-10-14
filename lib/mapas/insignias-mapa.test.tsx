import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Waves } from 'lucide-react';
import { INSIGNIAS, registrarInsignias, svgInsignia } from './insignias-mapa';

class ImagenFalsa {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('svgInsignia', () => {
  it('incluye xmlns, halo blanco, color de relleno e icono anidado', () => {
    const svg = svgInsignia({
      forma: 'cuadrado',
      relleno: '#b91c1c',
      anillo: '#9ca3af',
      icono: Waves,
    });

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('fill="#b91c1c"');
    expect(svg.match(/<svg/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('dibuja formas distintas por tipo', () => {
    const base = { relleno: '#000000', anillo: '#ffffff', icono: Waves };
    expect(svgInsignia({ ...base, forma: 'circulo' })).toContain('<circle');
    expect(svgInsignia({ ...base, forma: 'cuadrado' })).toContain('<rect');
    expect(svgInsignia({ ...base, forma: 'triangulo' })).toContain('<polygon');
  });
});

describe('INSIGNIAS', () => {
  it('contiene todos los ids de estaciones y eventos', () => {
    expect(Object.keys(INSIGNIAS).sort()).toEqual(
      [
        'estacion-alerta',
        'estacion-evacuacion',
        'estacion-normal',
        'estacion-sin-dato',
        'evento-alta',
        'evento-baja',
        'evento-media',
      ].sort(),
    );
  });
});

describe('registrarInsignias', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', ImagenFalsa);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registra una vez cada id que falta y omite los existentes', async () => {
    const existentes = new Set(['estacion-normal']);
    const addImage = vi.fn();
    const map = {
      hasImage: (id: string) => existentes.has(id),
      addImage,
    };

    await registrarInsignias(map);

    expect(addImage).toHaveBeenCalledTimes(Object.keys(INSIGNIAS).length - 1);
    expect(addImage.mock.calls.map((c) => c[0])).not.toContain('estacion-normal');
    expect(addImage).toHaveBeenCalledWith(expect.any(String), expect.any(ImagenFalsa), {
      pixelRatio: 2,
    });
  });

  it('no duplica una imagen cuando dos registros concurrentes compiten', async () => {
    const existentes = new Set<string>();
    const addImage = vi.fn((id: string) => {
      existentes.add(id);
    });
    const map = { hasImage: (id: string) => existentes.has(id), addImage };

    await Promise.all([
      registrarInsignias(map, ['evento-alta']),
      registrarInsignias(map, ['evento-alta']),
    ]);

    expect(addImage).toHaveBeenCalledTimes(1);
  });

  it('omite una imagen que falla sin lanzar', async () => {
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    const addImage = vi.fn();

    await expect(
      registrarInsignias({ hasImage: () => false, addImage }, ['evento-alta']),
    ).resolves.toBeUndefined();
    expect(addImage).not.toHaveBeenCalled();
  });
});
