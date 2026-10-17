import { describe, expect, it } from 'vitest'
import { CAPAS_VISIBLES_DEFAULT } from './capas'
import {
  STORAGE_KEY_RETORNO_MAPA,
  construirUrlFichaEscuela,
  construirUrlRetornoMapa,
  guardarSnapshotRetornoMapa,
  leerSnapshotRetornoMapa,
  limpiarSnapshotRetornoMapa,
  parsearContextoMapaDeQuery,
  serializarContextoMapaEnQuery,
  validarRutaRetornoInterna,
  type SnapshotRetornoMapa,
} from './estado-retorno'
import { FILTROS_MAPA_VACIOS, type FiltrosMapa } from './tipos'

function crearStorageMemoria(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.get(key) ?? null
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  }
}

describe('estado-retorno', () => {
  describe('validarRutaRetornoInterna', () => {
    it('acepta rutas internas dentro de /mapas/infraestructura y filtra parámetros ajenos', () => {
      expect(validarRutaRetornoInterna('/mapas/infraestructura')).toBe(
        '/mapas/infraestructura',
      )
      expect(
        validarRutaRetornoInterna(
          '/mapas/infraestructura/escuelas/1800001-00?origen=mapa&depto=Capital&dni=123456#situaciones',
        ),
      ).toBe(
        '/mapas/infraestructura/escuelas/1800001-00?origen=mapa&depto=Capital#situaciones',
      )
      expect(
        validarRutaRetornoInterna(
          '/mapas/infraestructura?cue=1800001-00&alumno=Juan#radar',
        ),
      ).toBe('/mapas/infraestructura?cue=1800001-00#radar')
    })

    it('rechaza rutas externas, protocolos o prefijos fuera de /mapas/infraestructura', () => {
      expect(validarRutaRetornoInterna(null)).toBeNull()
      expect(validarRutaRetornoInterna('')).toBeNull()
      expect(validarRutaRetornoInterna('//evil.com/mapas/infraestructura')).toBeNull()
      expect(validarRutaRetornoInterna('https://evil.com/mapas/infraestructura')).toBeNull()
      expect(validarRutaRetornoInterna('javascript:alert(1)')).toBeNull()
      expect(validarRutaRetornoInterna('/mapas/infraestructura\\evil')).toBeNull()
      expect(validarRutaRetornoInterna('/mapas/infraestructura-otra')).toBeNull()
      expect(validarRutaRetornoInterna('/admin/usuarios')).toBeNull()
    })
  })

  describe('serializarContextoMapaEnQuery y parsearContextoMapaDeQuery', () => {
    it('serializa y recupera filtros, pestaña, CUE y opciones de modo', () => {
      const filtros: FiltrosMapa = {
        ...FILTROS_MAPA_VACIOS,
        q: 'Escuela 12',
        departamentos: ['Capital', 'Goya'],
        niveles: ['Primario'],
        direcciones: [2],
        gravedades: [3, 4],
        clases: ['sin', 'evacuado'],
        apoyo: ['virtual' as never, 'brinda'],
        sinActualizar: true,
        solucionadasRecientes: true,
      }

      const params = serializarContextoMapaEnQuery({
        tab: 'planificacion',
        filtros: { ...filtros, apoyo: ['brinda', 'no'] },
        seleccionCue: '1800001-00',
        horizonte: 24,
        variable: 'viento',
        vista: 'inundacion',
        origen: 'mapa',
      })

      const recuperado = parsearContextoMapaDeQuery(params, '#planificacion', {
        radarHabilitado: true,
      })

      expect(recuperado.tab).toBe('planificacion')
      expect(recuperado.cue).toBe('1800001-00')
      expect(recuperado.origen).toBe('mapa')
      expect(recuperado.horizonte).toBe(24)
      expect(recuperado.variable).toBe('viento')
      expect(recuperado.vista).toBe('inundacion')
      expect(recuperado.tieneFiltrosEnUrl).toBe(true)
      expect(recuperado.filtrosParciales).toEqual({
        q: 'Escuela 12',
        departamentos: ['Capital', 'Goya'],
        niveles: ['Primario'],
        direcciones: [2],
        gravedades: [3, 4],
        clases: ['sin', 'evacuado'],
        apoyo: ['brinda', 'no'],
        sinActualizar: true,
        solucionadasRecientes: true,
      })
    })

    it('ignora valores inválidos de enums o CUE y degrada radar cuando está deshabilitado', () => {
      const recuperado = parsearContextoMapaDeQuery(
        new URLSearchParams(
          'modo=radar&cue=invalido&severidad=Alta,99&clases=normal,inventado&horizonte=999&variable=nieve&vista=otra',
        ),
        '',
        { radarHabilitado: false },
      )

      expect(recuperado.tab).toBe('actual')
      expect(recuperado.cue).toBeNull()
      expect(recuperado.filtrosParciales.gravedades).toEqual([3])
      expect(recuperado.filtrosParciales.clases).toEqual(['normal'])
      expect(recuperado.horizonte).toBeNull()
      expect(recuperado.variable).toBeNull()
      expect(recuperado.vista).toBeNull()
    })
  })

  describe('construirUrlFichaEscuela y construirUrlRetornoMapa', () => {
    it('arma la URL canónica de la ficha con contexto desde el mapa', () => {
      const url = construirUrlFichaEscuela('1800001-00', {
        tab: 'radar',
        filtros: { ...FILTROS_MAPA_VACIOS, departamentos: ['Capital'] },
        horizonte: 240,
        variable: 'granizo',
        desdeMapa: true,
      })

      expect(url).toBe(
        '/mapas/infraestructura/escuelas/1800001-00?origen=mapa&modo=radar&depto=Capital&horizonte=240&variable=granizo',
      )
    })

    it('arma la URL de retorno al mapa con hash de pestaña y selección', () => {
      expect(
        construirUrlRetornoMapa({
          cueAnexo: '1800001-00',
          tab: 'actual',
        }),
      ).toBe('/mapas/infraestructura?cue=1800001-00#actual')
    })
  })

  describe('snapshot en sessionStorage', () => {
    it('guarda, lee y limpia un snapshot válido e ignora JSON corrupto o versión inválida', () => {
      const storage = crearStorageMemoria()
      const snapshot: SnapshotRetornoMapa = {
        version: 1,
        origen: 'mapa',
        tab: 'radar',
        ultimaPestanaMapa: 'radar',
        filtros: { ...FILTROS_MAPA_VACIOS, departamentos: ['Goya'] },
        seleccionCue: '1800001-00',
        previewAbierto: false,
        camara: { lng: -58.83, lat: -27.47, zoom: 13.5, bearing: 0, pitch: 0 },
        basemap: 'positron',
        capasVisibles: { ...CAPAS_VISIBLES_DEFAULT, escuelasAisladas: true },
        horasLluvia: 24,
        horizonteSeleccionado: 24,
        variableRadar: 'viento',
        vistaPlanificacion: 'inundacion',
        departamentoSeleccionado: 'Goya',
        departamentoRadarId: '18001',
      }

      guardarSnapshotRetornoMapa(snapshot, storage)
      expect(leerSnapshotRetornoMapa(storage)).toEqual(snapshot)

      storage.setItem(STORAGE_KEY_RETORNO_MAPA, '{corrupto')
      expect(leerSnapshotRetornoMapa(storage)).toBeNull()

      storage.setItem(STORAGE_KEY_RETORNO_MAPA, JSON.stringify({ version: 2 }))
      expect(leerSnapshotRetornoMapa(storage)).toBeNull()

      guardarSnapshotRetornoMapa(snapshot, storage)
      limpiarSnapshotRetornoMapa(storage)
      expect(leerSnapshotRetornoMapa(storage)).toBeNull()
    })
  })
})
