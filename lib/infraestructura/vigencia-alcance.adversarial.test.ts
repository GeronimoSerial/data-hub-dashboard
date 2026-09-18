import { describe, expect, it } from 'vitest';
import { resolverAlcanceVigente } from './vigencia-alcance';

interface Fila {
  id: string;
  rigeDesde: string;
  creadaEn: string;
  retiradaEn: string | null;
}

const REF = new Date('2026-09-18T12:00:00.000Z');

describe('empates de rigeDesde — desempate deterministico', () => {
  it('con filas de idéntico rigeDesde y creadaEn, el resultado no depende del orden del array (gana id mayor)', () => {
    const filaX: Fila = { id: 'x', rigeDesde: '2026-09-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: null };
    const filaY: Fila = { id: 'y', rigeDesde: '2026-09-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: null };
    const ordenA = resolverAlcanceVigente([filaX, filaY], { referencia: REF, clave: () => 'k' });
    const ordenB = resolverAlcanceVigente([filaY, filaX], { referencia: REF, clave: () => 'k' });
    expect(ordenA).toEqual([filaY]);
    expect(ordenB).toEqual([filaY]);
    expect(ordenA).toEqual(ordenB);
  });

  it('con rigeDesde y id empatados, gana la fila con creadaEn mas reciente sin importar el orden del array', () => {
    const filaVieja: Fila = { id: 'z', rigeDesde: '2026-09-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: null };
    const filaNueva: Fila = { id: 'a', rigeDesde: '2026-09-01T00:00:00.000Z', creadaEn: '2026-09-05T00:00:00.000Z', retiradaEn: null };
    const ordenA = resolverAlcanceVigente([filaVieja, filaNueva], { referencia: REF, clave: () => 'k' });
    const ordenB = resolverAlcanceVigente([filaNueva, filaVieja], { referencia: REF, clave: () => 'k' });
    expect(ordenA).toEqual([filaNueva]);
    expect(ordenB).toEqual([filaNueva]);
  });

  it('sin clave, conserva todas las filas con idéntico rigeDesde (no se deduplica)', () => {
    const filaX: Fila = { id: 'x', rigeDesde: '2026-09-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: null };
    const filaY: Fila = { id: 'y', rigeDesde: '2026-09-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: null };
    expect(resolverAlcanceVigente([filaX, filaY], { referencia: REF })).toEqual([filaX, filaY]);
  });
});

describe('fronteras de vigencia', () => {
  it('fila con rigeDesde exactamente igual a REF queda incluida', () => {
    const fila: Fila = { id: 'x', rigeDesde: '2026-09-18T12:00:00.000Z', creadaEn: '2026-09-18T12:00:00.000Z', retiradaEn: null };
    expect(resolverAlcanceVigente([fila], { referencia: REF, clave: () => 'k' })).toHaveLength(1);
  });

  it('fila con retiradaEn exactamente igual a REF queda excluida', () => {
    const fila: Fila = { id: 'x', rigeDesde: '2026-09-01T00:00:00.000Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: '2026-09-18T12:00:00.000Z' };
    expect(resolverAlcanceVigente([fila], { referencia: REF, clave: () => 'k' })).toHaveLength(0);
  });

  it('fila con rigeDesde sin milisegundos queda incluida en la misma fecha', () => {
    const fila: Fila = { id: 'x', rigeDesde: '2026-09-01T00:00:00Z', creadaEn: '2026-09-01T00:00:00.000Z', retiradaEn: null };
    expect(
      resolverAlcanceVigente([fila], { referencia: new Date('2026-09-01T00:00:00.000Z'), clave: () => 'k' }),
    ).toHaveLength(1);
  });

  it('fila con rigeDesde con offset -03:00 queda incluida en el instante equivalente UTC', () => {
    const fila: Fila = { id: 'x', rigeDesde: '2026-09-01T09:00:00-03:00', creadaEn: '2026-09-01T09:00:00-03:00', retiradaEn: null };
    expect(
      resolverAlcanceVigente([fila], { referencia: new Date('2026-09-01T12:00:00.000Z'), clave: () => 'k' }),
    ).toHaveLength(1);
  });
});