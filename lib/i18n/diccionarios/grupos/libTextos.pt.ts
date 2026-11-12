import type { DeepStringify } from '../tipos'
import type { libTextosEs } from './libTextos.es'

// Brazilian Portuguese texts of the `libTextos` group; must mirror libTextos.es.ts key for key.
export const libTextosPt: DeepStringify<typeof libTextosEs> = {
  funcionamiento: {
    sinAfectaciones: 'Sem afetações informadas',
    sinDatos: 'Sem dados para calcular o funcionamento',
    sinInformacionClases: 'Sem informação sobre aulas',
    severidad: {
      Baja: 'Funcionamento com afetação leve',
      Media: 'Funcionamento afetado',
      Alta: 'Funcionamento gravemente afetado',
      Crítica: 'Funcionamento criticamente afetado',
    },
    clases: {
      normal: 'Aulas normais',
      parcial: 'Aulas parcialmente suspensas',
      sin: 'Aulas suspensas',
      evacuado: 'Escola evacuada',
      centro: 'Usada como centro de evacuados',
    },
  },
  prioridad: {
    sinDatos: 'Sem dados para calcular a prioridade',
    severidad: {
      Baja: 'Baixa',
      Media: 'Média',
    },
    resumen: (afectados: number, matricula: number | null, porcentaje: string, prioridad: string) =>
      `${afectados} de ${matricula} alunos · ${porcentaje}% · Prioridade ${prioridad}`,
  },
  distanciaCentro: {
    porCamino: (km: string) => `${km} km por estrada`,
    enLineaRecta: (km: string) => `${km} km em linha reta (sem caminho calculado)`,
  },
  accesos: {
    textos: {
      tituloAcceso: 'Dificuldade para chegar por estrada',
      subtituloAcceso:
        'De 0 (muito baixa) a 3 (alta). É um cálculo com dados de mapa, não o estado atual da estrada.',
      queMideAcceso:
        'Estima o quão difícil é chegar por estrada da escola até a cidade sede do seu departamento. Leva em conta a distância, os trechos de terra e as travessias de rios, arroios ou canais que constam no OpenStreetMap (o mapa aberto de onde saem as estradas).',
      nivelesAcceso:
        'Quanto maior o número, mais difícil é chegar: 0 muito baixa, 1 baixa, 2 média, 3 alta.',
      noRepresentaAcceso:
        'Não diz se hoje a estrada está interditada, não é uma previsão e não mostra o estado do prédio. O risco de acesso previsto está no modo Radar e na situação de hoje, nos partes.',
      tituloInundacion: 'Água estimada por cheia de rio (na escola)',
      subtituloInundacion:
        'Metros de água estimados no ponto da escola para uma cheia que acontece, em média, uma vez a cada {periodo} anos.',
      sinProfundidad: 'O modelo não estima água nesse ponto (0 m). É um resultado do cálculo, não uma garantia de que nunca alague.',
      sinCobertura:
        'Sem dado: esta escola não está nos dados calculados, então não se sabe o seu valor. Não equivale ao nível 0 nem a "sem água".',
      detalleDatos: 'Dados calculados com mapas e modelos; não substituem o parte nem confirmam o estado do prédio.',
      periodoEscenario:
        'Período de retorno: {periodo} anos (uma cheia que acontece, em média, uma vez a cada {periodo} anos) · cenário com clima histórico',
      sinRuta: 'Sem trajeto para mostrar',
      verRecorrido: 'Ver trajeto',
    },
    aislamiento: {
      0: {
        nombre: 'Muito baixa',
        detalle:
          'Estrada de até 3 km até a cidade sede do seu departamento, sem travessias de água e com no máximo 1 trecho de terra.',
      },
      1: {
        nombre: 'Baixa',
        detalle:
          'Nenhuma travessia de água deixa de ter ponte registrada, mas o trajeto não é o mais simples: mais de 3 km, travessias com ponte ou vários trechos de terra.',
      },
      2: {
        nombre: 'Média',
        detalle:
          'Há pelo menos uma travessia de água sem ponte registrada, mas existe outro caminho que a evita.',
      },
      3: {
        detalle:
          'Mais de 20 km até a cidade sede do seu departamento, ou uma travessia de água sem ponte registrada e nenhum caminho que a evite.',
      },
      sin_datos_red: {
        nombre: 'Não calculável',
        detalle:
          'Não foi possível calcular: não há uma estrada carregada perto da escola, a estrada próxima não chega à cidade sede ou a localização carregada não coincide com o seu departamento. É falta de dado: não significa acesso fácil nem difícil.',
      },
    },
    inundacion: {
      medio: 'Médio',
      bajo: 'Baixo',
      sin_riesgo: 'Sem risco',
      sin_dato: 'Sem dado',
    },
    cruce: {
      etiqueta: {
        puente: 'Ponte',
        vado: 'Vau',
        vado_probable: 'Vau provável',
        sin_evidencia: 'Sem ponte registrada',
      },
      descripcion: {
        puente: 'Travessia de água com ponte carregada no mapa.',
        vado: 'Travessia de água no nível do leito, sem ponte. Não diz se hoje dá para passar.',
        vado_probable: 'Travessia sem tag ford=yes sobre uma via não pavimentada; é estimada como vau para o índice.',
        sin_evidencia:
          'Não há ponte carregada no mapa nesta travessia; pode existir sem estar carregada. Não diz se hoje dá para passar.',
      },
    },
    motivoSinRuta: {
      generico: 'Não há trajeto calculado para esta escola.',
      sin_conexion_red:
        'A escola não se conecta à rede de estradas até a cidade sede, então não se calculou um trajeto.',
      coordenada_fuera_de_departamento:
        'A localização carregada da escola cai fora do seu departamento. Para não mostrar um dado em um lugar errado, não se calculou nada. Convém revisar a localização no cadastro.',
      red_vial_no_conectada:
        'Há uma estrada a menos de 5 km, mas ela não se conecta às estradas principais nem chega à cidade sede, então não se desenha um trajeto. É falta de dado: não significa que a escola seja inacessível.',
      sin_via_osm_cercana:
        'Não há estradas carregadas no OpenStreetMap a menos de 5 km da escola, então não é possível calcular. É falta de dado, não acesso fácil nem difícil.',
      ruta_degenerada: 'A escola está junto à cidade sede do seu departamento: não há trajeto para desenhar.',
      sin_geometria_importada: 'O trajeto desta escola ainda não foi carregado.',
    },
    superficie: {
      ripio: 'de cascalho',
      tierra: 'de terra',
    },
    via: {
      calleUrbana: 'Rua urbana',
      caminoRural: 'Estrada rural',
      caminoAcceso: (km: string) => `Estrada de acesso · ${km}`,
    },
    cruces: {
      sinCruces: 'Sem travessias de água',
      cantidad: (n: number) => `${n} ${n === 1 ? 'travessia' : 'travessias'} de água na estrada`,
      detalle: {
        puente: (n: number) => `${n} com ponte`,
        vado: (n: number) => `${n} vau`,
        sinEvidencia: (n: number) => `${n} sem ponte registrada`,
      },
    },
    claseRuta: {
      medio: 'Médio',
      bajo: 'Baixo',
      sin_riesgo: 'Sem risco',
      sin_dato: 'Sem dado',
      sin_ruta: 'Sem trajeto',
    },
  },
}
