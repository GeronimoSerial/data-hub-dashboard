'use client'

import * as React from 'react'
import {
  makeStyles,
  tokens,
  typographyStyles,
  Badge,
  Body1,
  Caption1,
  Divider,
  Subtitle2,
  Tab,
  TabList,
  Title3,
  type SelectTabData,
  type SelectTabEvent,
} from '@fluentui/react-components'
import { FORMATOS } from '@/lib/model'
import { useHubData } from '@/components/hub-data'
import { ResourceCard } from '@/components/resource-card'

const useStyles = makeStyles({
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalL,
  },
  eyebrow: {
    ...typographyStyles.caption1Strong,
    letterSpacing: '1.2px',
    color: tokens.colorBrandForeground1,
  },
  intro: { color: tokens.colorNeutralForeground2, maxWidth: '640px' },
  filterBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalL,
  },
  stepLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  stepNum: {
    ...typographyStyles.caption1Strong,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  resultBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalL,
    marginBottom: tokens.spacingVerticalM,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: tokens.spacingHorizontalL,
  },
  empty: {
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
})

export function ReportesPage() {
  const styles = useStyles()
  const { recursos, niveles, tipos } = useHubData()

  // Solo reportes
  const reportes = React.useMemo(
    () => recursos.filter((r) => r.formato === 'reporte'),
    [recursos],
  )

  // Paso 1 — Nivel (eje primario). Solo niveles con reportes.
  const nivelesConReportes = React.useMemo(
    () =>
      [...niveles]
        .sort((a, b) => a.orden - b.orden)
        .filter((n) => reportes.some((r) => r.nivelId === n.id)),
    [niveles, reportes],
  )

  const [nivelId, setNivelId] = React.useState<string>('all')
  const [tipoId, setTipoId] = React.useState<string>('all')

  // Reportes tras el filtro de nivel
  const porNivel = React.useMemo(
    () =>
      nivelId === 'all'
        ? reportes
        : reportes.filter((r) => r.nivelId === nivelId),
    [reportes, nivelId],
  )

  // Paso 2 — Tipo (dependiente del nivel elegido). Solo tipos presentes.
  const tiposDisponibles = React.useMemo(
    () => tipos.filter((t) => porNivel.some((r) => r.tipoId === t.id)),
    [tipos, porNivel],
  )

  // Si el tipo activo ya no existe en el nivel elegido, se reinicia.
  React.useEffect(() => {
    if (tipoId !== 'all' && !tiposDisponibles.some((t) => t.id === tipoId)) {
      setTipoId('all')
    }
  }, [tipoId, tiposDisponibles])

  const resultado = React.useMemo(
    () =>
      tipoId === 'all'
        ? porNivel
        : porNivel.filter((r) => r.tipoId === tipoId),
    [porNivel, tipoId],
  )

  const onNivel = (_e: SelectTabEvent, data: SelectTabData) => {
    setNivelId(data.value as string)
    setTipoId('all')
  }
  const onTipo = (_e: SelectTabEvent, data: SelectTabData) =>
    setTipoId(data.value as string)

  return (
    <div>
      <div className={styles.header}>
        <span className={styles.eyebrow}>DOCUMENTOS PARA LA GESTIÓN</span>
        <Title3 as="h1">{FORMATOS.reporte.plural}</Title3>
        <Body1 className={styles.intro}>
          Informes, boletines, indicadores y series producidos por las áreas.
          Filtre primero por <strong>nivel educativo</strong> y luego por{' '}
          <strong>tipo de reporte</strong>.
        </Body1>
      </div>

      <Divider />

      {/* Paso 1 — Nivel */}
      <div className={styles.filterBlock}>
        <div className={styles.stepLabel}>
          <span className={styles.stepNum}>1</span>
          <Subtitle2>Nivel educativo</Subtitle2>
        </div>
        <TabList selectedValue={nivelId} onTabSelect={onNivel} size="medium">
          <Tab value="all">Todos</Tab>
          {nivelesConReportes.map((n) => (
            <Tab key={n.id} value={n.id}>
              {n.nombre}
            </Tab>
          ))}
        </TabList>
      </div>

      {/* Paso 2 — Tipo (dependiente del nivel) */}
      <div className={styles.filterBlock}>
        <div className={styles.stepLabel}>
          <span className={styles.stepNum}>2</span>
          <Subtitle2>Tipo de reporte</Subtitle2>
        </div>
        <TabList
          selectedValue={tipoId}
          onTabSelect={onTipo}
          size="medium"
          appearance="subtle"
        >
          <Tab value="all">Todos</Tab>
          {tiposDisponibles.map((t) => (
            <Tab key={t.id} value={t.id}>
              {t.nombre}
            </Tab>
          ))}
        </TabList>
      </div>

      <div className={styles.resultBar}>
        <Badge appearance="tint" color="brand">
          {resultado.length}{' '}
          {resultado.length === 1 ? 'reporte' : 'reportes'}
        </Badge>
        <Caption1>
          {nivelId === 'all'
            ? 'Todos los niveles'
            : nivelesConReportes.find((n) => n.id === nivelId)?.nombre}{' '}
          ·{' '}
          {tipoId === 'all'
            ? 'Todos los tipos'
            : tiposDisponibles.find((t) => t.id === tipoId)?.nombre}
        </Caption1>
      </div>

      {resultado.length === 0 ? (
        <div className={styles.empty}>
          <Body1>No hay reportes para esta combinación de filtros.</Body1>
        </div>
      ) : (
        <div className={styles.grid}>
          {resultado.map((r) => (
            <ResourceCard key={r.id} recurso={r} />
          ))}
        </div>
      )}
    </div>
  )
}
