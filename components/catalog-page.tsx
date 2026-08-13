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
  Tab,
  TabList,
  Title3,
  type SelectTabData,
  type SelectTabEvent,
} from '@fluentui/react-components'
import { FORMATOS, type Formato } from '@/lib/model'
import { useHubData } from '@/components/hub-data'
import { ResourceCard } from '@/components/resource-card'

const EYEBROW: Record<Formato, string> = {
  reporte: 'DOCUMENTOS PARA LA GESTIÓN',
  tablero: 'SEGUIMIENTO Y MONITOREO',
  mapa: 'ANÁLISIS TERRITORIAL',
}

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

export function CatalogPage({ formato }: { formato: Formato }) {
  const styles = useStyles()
  const { recursos, categorias } = useHubData()

  const items = React.useMemo(
    () => recursos.filter((r) => r.formato === formato),
    [recursos, formato],
  )

  const [catId, setCatId] = React.useState<string>('all')

  const categoriasConItems = React.useMemo(
    () => categorias.filter((c) => items.some((r) => r.categoriaId === c.id)),
    [categorias, items],
  )

  React.useEffect(() => {
    if (catId !== 'all' && !categoriasConItems.some((c) => c.id === catId)) {
      setCatId('all')
    }
  }, [catId, categoriasConItems])

  const resultado = React.useMemo(
    () =>
      catId === 'all' ? items : items.filter((r) => r.categoriaId === catId),
    [items, catId],
  )

  const onCat = (_e: SelectTabEvent, data: SelectTabData) =>
    setCatId(data.value as string)

  const meta = FORMATOS[formato]

  return (
    <div>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{EYEBROW[formato]}</span>
        <Title3 as="h1">{meta.plural}</Title3>
        <Body1 className={styles.intro}>{meta.descripcion}</Body1>
      </div>

      <Divider />

      <div className={styles.filterBlock}>
        <Caption1>Filtrar por categoría</Caption1>
        <TabList selectedValue={catId} onTabSelect={onCat} size="medium">
          <Tab value="all">Todas</Tab>
          {categoriasConItems.map((c) => (
            <Tab key={c.id} value={c.id}>
              {c.nombre}
            </Tab>
          ))}
        </TabList>
      </div>

      <Badge appearance="tint" color={meta.color}>
        {resultado.length} {resultado.length === 1 ? 'recurso' : 'recursos'}
      </Badge>

      <div style={{ height: tokens.spacingVerticalM }} />

      {resultado.length === 0 ? (
        <div className={styles.empty}>
          <Body1>No hay recursos para esta categoría.</Body1>
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
