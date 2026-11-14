// Spanish (Corrientes) texts of the `libTextos` group. Values stay byte-for-byte as shipped.
export const libTextosEs = {
  funcionamiento: {
    sinAfectaciones: 'Sin afectaciones reportadas',
    sinDatos: 'Sin datos para calcular el funcionamiento',
    sinInformacionClases: 'Sin información de clases',
    severidad: {
      Baja: 'Funcionamiento con afectación leve',
      Media: 'Funcionamiento afectado',
      Alta: 'Funcionamiento gravemente afectado',
      Crítica: 'Funcionamiento críticamente afectado',
    },
    clases: {
      normal: 'Clases normales',
      parcial: 'Clases parcialmente suspendidas',
      sin: 'Clases suspendidas',
      evacuado: 'Evacuado',
      centro: 'Usado como centro de evacuados',
    },
  },
  prioridad: {
    sinDatos: 'Sin datos para calcular la prioridad',
    // Alta y Crítica se escriben igual en pt: no van al diccionario (ver severidadPrioridad).
    severidad: {
      Baja: 'Baja',
      Media: 'Media',
    },
    resumen: (afectados: number, matricula: number | null, porcentaje: string, prioridad: string) =>
      `${afectados} de ${matricula} alumnos · ${porcentaje}% · Prioridad ${prioridad}`,
  },
  distanciaCentro: {
    porCamino: (km: string) => `${km} km por camino`,
    enLineaRecta: (km: string) => `${km} km en línea recta (sin camino calculado)`,
  },
  accesos: {
    textos: {
      tituloAcceso: 'Dificultad para llegar por camino',
      subtituloAcceso:
        'De 0 (muy baja) a 3 (alta). Es un cálculo con datos de mapa, no el estado del camino hoy.',
      queMideAcceso:
        'Estima qué tan difícil es llegar por camino desde la escuela hasta la ciudad cabecera de su departamento. Tiene en cuenta la distancia, los tramos de tierra y los cruces de ríos, arroyos o canales que figuran en OpenStreetMap (el mapa abierto de donde salen los caminos).',
      nivelesAcceso:
        'Cuanto más alto el número, más difícil es llegar: 0 muy baja, 1 baja, 2 media, 3 alta.',
      noRepresentaAcceso:
        'No dice si hoy el camino está cortado, no es un pronóstico y no muestra el estado del edificio. El riesgo de acceso pronosticado está en el modo Radar y la situación de hoy, en los partes.',
      tituloInundacion: 'Agua estimada por crecida de río (en la escuela)',
      subtituloInundacion:
        'Metros de agua estimados en el punto de la escuela para una crecida que ocurre, en promedio, una vez cada {periodo} años.',
      sinProfundidad: 'El modelo no estima agua en ese punto (0 m). Es un resultado del cálculo, no una garantía de que nunca se inunde.',
      sinCobertura:
        'Sin dato: esta escuela no está en los datos calculados, así que no se sabe su valor. No equivale a nivel 0 ni a "sin agua".',
      detalleDatos: 'Datos calculados con mapas y modelos; no reemplazan el parte ni confirman el estado del edificio.',
      periodoEscenario:
        'Período de retorno: {periodo} años (una crecida que ocurre, en promedio, una vez cada {periodo} años) · escenario con clima histórico',
      sinRuta: 'Sin recorrido para mostrar',
      verRecorrido: 'Ver recorrido',
    },
    aislamiento: {
      0: {
        nombre: 'Muy baja',
        detalle:
          'Camino de hasta 3 km hasta la ciudad cabecera de su departamento, sin cruces de agua y con como mucho 1 tramo de tierra.',
      },
      1: {
        nombre: 'Baja',
        detalle:
          'Ningún cruce de agua carece de puente registrado, pero el trayecto no es el más simple: más de 3 km, cruces con puente o varios tramos de tierra.',
      },
      2: {
        nombre: 'Media',
        detalle:
          'Hay al menos un cruce de agua sin puente registrado, pero existe otro camino que lo evita.',
      },
      3: {
        detalle:
          'Más de 20 km hasta la ciudad cabecera de su departamento, o un cruce de agua sin puente registrado y ningún camino que lo evite.',
      },
      sin_datos_red: {
        nombre: 'No calculable',
        detalle:
          'No se pudo calcular: no hay un camino cargado cerca de la escuela, el camino cercano no llega a la ciudad cabecera o la ubicación cargada no coincide con su departamento. Es falta de dato: no significa acceso fácil ni difícil.',
      },
    },
    inundacion: {
      medio: 'Medio',
      bajo: 'Bajo',
      sin_riesgo: 'Sin riesgo',
      sin_dato: 'Sin dato',
    },
    cruce: {
      etiqueta: {
        puente: 'Puente',
        vado: 'Vado',
        vado_probable: 'Vado probable',
        sin_evidencia: 'Sin puente registrado',
      },
      descripcion: {
        puente: 'Cruce de agua con puente cargado en el mapa.',
        vado: 'Cruce de agua a nivel del cauce, sin puente. No dice si hoy se puede pasar.',
        vado_probable: 'Cruce sin tag ford=yes sobre una vía no pavimentada; se estima como vado para el índice.',
        sin_evidencia:
          'No hay puente cargado en el mapa en este cruce; puede existir sin estar cargado. No dice si hoy se puede pasar.',
      },
    },
    motivoSinRuta: {
      generico: 'No hay recorrido calculado para esta escuela.',
      sin_conexion_red:
        'La escuela no conecta con la red de caminos hasta la ciudad cabecera, así que no se calculó un recorrido.',
      coordenada_fuera_de_departamento:
        'La ubicación cargada de la escuela cae fuera de su departamento. Para no mostrar un dato en un lugar equivocado, no se calculó nada. Conviene revisar la ubicación en el padrón.',
      red_vial_no_conectada:
        'Hay un camino a menos de 5 km, pero no se conecta con los caminos principales ni llega a la ciudad cabecera, así que no se dibuja un recorrido. Es falta de dato: no significa que la escuela sea inaccesible.',
      sin_via_osm_cercana:
        'No hay caminos cargados en OpenStreetMap a menos de 5 km de la escuela, así que no se puede calcular. Es falta de dato, no acceso fácil ni difícil.',
      ruta_degenerada: 'La escuela está junto a la ciudad cabecera de su departamento: no hay recorrido para dibujar.',
      sin_geometria_importada: 'Todavía no se cargó el recorrido de esta escuela.',
    },
    superficie: {
      ripio: 'de ripio',
      tierra: 'de tierra',
    },
    via: {
      calleUrbana: 'Calle urbana',
      caminoRural: 'Camino rural',
      caminoAcceso: (km: string) => `Camino de acceso · ${km}`,
    },
    cruces: {
      sinCruces: 'Sin cruces de agua',
      cantidad: (n: number) => `${n} ${n === 1 ? 'cruce' : 'cruces'} de agua en el camino`,
      detalle: {
        puente: (n: number) => `${n} con puente`,
        vado: (n: number) => `${n} vado`,
        sinEvidencia: (n: number) => `${n} sin puente registrado`,
      },
    },
    claseRuta: {
      medio: 'Medio',
      bajo: 'Bajo',
      sin_riesgo: 'Sin riesgo',
      sin_dato: 'Sin dato',
      sin_ruta: 'Sin ruta',
    },
  },
}
