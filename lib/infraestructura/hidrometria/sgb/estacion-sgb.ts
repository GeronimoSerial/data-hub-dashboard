// Estación «MAO - Manaus» del SACE (Serviço Geológico do Brasil), Río Negro.
// Coordenadas y escala tomadas de la página pública de la estación:
// https://sace.sgb.gov.br/niveis/relatorio.php?apenas_grafico=sim&bacia=amazonas&pm=8&s=33&sr=106
// La escala de SACE tiene tres niveles: alerta 27,00 m, inundación 27,50 m e
// inundación severa 29,00 m. El puerto de río neutral usa sólo dos: `alertaM`
// es el nivel de alerta y `evacuacionM` el de inundación severa.
export type EstacionSgb = {
  estacionId: string
  nome: string
  rio: 'negro'
  lat: number
  lon: number
  alertaM: number
  evacuacionM: number
}

export const ESTACION_SGB_MANAUS: EstacionSgb = {
  estacionId: 'amazonas_8',
  nome: 'MAO - Manaus (SACE/SGB)',
  rio: 'negro',
  lat: -3.13667,
  lon: -60.02694,
  alertaM: 27,
  evacuacionM: 29,
}
