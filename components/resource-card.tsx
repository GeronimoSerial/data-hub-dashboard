'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  makeStyles,
  tokens,
  typographyStyles,
  Badge,
  Body1,
  Caption1,
  Card,
  CardHeader,
  Subtitle2,
  Tag,
  TagGroup,
} from '@fluentui/react-components'
import {
  DataArea24Regular,
  DocumentText24Regular,
  Map24Regular,
} from '@fluentui/react-icons'
import {
  FORMATOS,
  type Recurso,
  categoria as findCategoria,
  formatearFecha,
  nivelNombre,
  tagNombres,
  tipoNombre,
} from '@/lib/model'
import { useHubData } from '@/components/hub-data'

const FORMATO_ICON = {
  reporte: <DocumentText24Regular />,
  tablero: <DataArea24Regular />,
  mapa: <Map24Regular />,
}

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  link: {
    textDecorationLine: 'none',
    color: 'inherit',
    display: 'block',
    height: '100%',
  },
  topline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalM,
    flexGrow: 1,
  },
  desc: {
    color: tokens.colorNeutralForeground2,
    flexGrow: 1,
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    alignItems: 'center',
  },
  metaLabel: {
    ...typographyStyles.caption1Strong,
    color: tokens.colorNeutralForeground3,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalXS,
  },
})

export function ResourceCard({ recurso }: { recurso: Recurso }) {
  const styles = useStyles()
  const { niveles, tipos, categorias, tags } = useHubData()
  const formato = FORMATOS[recurso.formato]
  const cat = findCategoria(categorias, recurso.categoriaId)
  const nombresTags = tagNombres(tags, recurso.tagIds)

  const card = (
    <Card className={styles.card}>
      <div className={styles.topline}>
        {/* Content type — clearly differentiated by icon + colored badge */}
        <Badge
          appearance="filled"
          color={formato.color}
          icon={FORMATO_ICON[recurso.formato]}
        >
          {formato.label}
        </Badge>
        {/* Primary visible TAG = categoría */}
        {cat ? (
          <Badge appearance="tint" color={cat.color}>
            {cat.nombre}
          </Badge>
        ) : null}
      </div>

      <CardHeader
        header={<Subtitle2>{recurso.titulo}</Subtitle2>}
        description={
          <Caption1>
            {nivelNombre(niveles, recurso.nivelId)} ·{' '}
            {tipoNombre(tipos, recurso.tipoId)}
          </Caption1>
        }
      />

      <div className={styles.body}>
        <Body1 className={styles.desc}>{recurso.descripcion}</Body1>

        {nombresTags.length > 0 ? (
          <TagGroup aria-label="Etiquetas del recurso">
            {nombresTags.map((t) => (
              <Tag key={t} size="small" appearance="outline">
                {t}
              </Tag>
            ))}
          </TagGroup>
        ) : null}

        <div className={styles.footer}>
          <Caption1>{recurso.area}</Caption1>
          <Caption1>Actualizado {formatearFecha(recurso.actualizado)}</Caption1>
        </div>
      </div>
    </Card>
  )

  if (recurso.ruta) {
    return (
      <Link href={recurso.ruta} className={styles.link}>
        {card}
      </Link>
    )
  }

  return card
}
