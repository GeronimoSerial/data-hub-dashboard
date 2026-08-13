'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  makeStyles,
  tokens,
  typographyStyles,
  Badge,
  Body1,
  Caption1,
  Card,
  Divider,
  LargeTitle,
  Subtitle1,
  Subtitle2,
  Title3,
} from '@fluentui/react-components'
import {
  ArrowRight20Regular,
  DataArea32Regular,
  DocumentText32Regular,
  Globe32Regular,
} from '@fluentui/react-icons'
import { FORMATOS, type Formato } from '@/lib/model'
import { useHubData } from '@/components/hub-data'
import { ResourceCard } from '@/components/resource-card'
import { isReadyHref } from '@/lib/nav'

const FORMATO_ICON: Record<Formato, React.ReactNode> = {
  reporte: <DocumentText32Regular />,
  tablero: <DataArea32Regular />,
  mapa: <Globe32Regular />,
}

const FORMATO_ROUTE: Record<Formato, string> = {
  reporte: '/reportes',
  tablero: '/tableros',
  mapa: '/mapas',
}

const useStyles = makeStyles({
  hero: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    maxWidth: '720px',
  },
  eyebrow: {
    ...typographyStyles.caption1Strong,
    letterSpacing: '1.2px',
    color: tokens.colorBrandForeground1,
  },
  intro: {
    color: tokens.colorNeutralForeground2,
  },
  sectionHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    marginTop: tokens.spacingVerticalXXL,
    marginBottom: tokens.spacingVerticalL,
  },
  typeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: tokens.spacingHorizontalL,
  },
  typeCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    paddingTop: tokens.spacingVerticalL,
    paddingBottom: tokens.spacingVerticalL,
    cursor: 'pointer',
    borderTopWidth: tokens.strokeWidthThicker,
    borderTopStyle: 'solid',
    transitionDuration: tokens.durationNormal,
    transitionProperty: 'transform, box-shadow',
    ':hover': {
      transform: 'translateY(-3px)',
      boxShadow: tokens.shadow16,
    },
  },
  typeCardDisabled: {
    cursor: 'default',
    ':hover': {
      transform: 'none',
      boxShadow: 'none',
    },
  },
  reporteTop: { borderTopColor: tokens.colorBrandBackground },
  tableroTop: { borderTopColor: tokens.colorPaletteGreenBackground3 },
  mapaTop: { borderTopColor: tokens.colorPaletteMarigoldBackground3 },
  typeIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '52px',
    height: '52px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
  },
  typeMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorBrandForeground1,
    marginTop: 'auto',
  },
  typeDesc: {
    color: tokens.colorNeutralForeground2,
    minHeight: '60px',
  },
  recentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: tokens.spacingHorizontalL,
  },
})

const TOP_CLASS: Record<Formato, keyof ReturnType<typeof useStyles>> = {
  reporte: 'reporteTop',
  tablero: 'tableroTop',
  mapa: 'mapaTop',
}

export function HubPage() {
  const styles = useStyles()
  const router = useRouter()
  const { recursos } = useHubData()

  const conteo = (f: Formato) =>
    recursos.filter((r) => r.formato === f && r.estado === 'publicado').length

  const recientes = [...recursos]
    .filter((r) => r.estado === 'publicado')
    .sort((a, b) => b.actualizado.localeCompare(a.actualizado))
    .slice(0, 3)

  return (
    <div>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>INFORMACIÓN PARA DECIDIR</span>
        <LargeTitle as="h1">Hub de Datos</LargeTitle>
        <Body1 className={styles.intro}>
          Un único espacio que reúne los recursos analíticos del sistema
          educativo provincial. La información se organiza en tres tipos de
          contenido claramente diferenciados, para orientar prioridades y
          sostener decisiones con evidencia.
        </Body1>
      </section>

      <div className={styles.sectionHead}>
        <Title3 as="h2">Tipos de contenido</Title3>
        <Caption1>
          Cada recurso pertenece a un único tipo de contenido. Seleccione uno
          para explorar el catálogo.
        </Caption1>
      </div>

      <div className={styles.typeGrid}>
        {(Object.keys(FORMATOS) as Formato[]).map((f) => {
          const meta = FORMATOS[f]
          const topClass = styles[TOP_CLASS[f]] as string
          const ready = isReadyHref(FORMATO_ROUTE[f])
          return (
            <Card
              key={f}
              className={`${styles.typeCard} ${topClass}${ready ? '' : ` ${styles.typeCardDisabled}`}`}
              onClick={ready ? () => router.push(FORMATO_ROUTE[f]) : undefined}
              role={ready ? 'link' : undefined}
              tabIndex={ready ? 0 : undefined}
              onKeyDown={
                ready
                  ? (e) => {
                      if (e.key === 'Enter') router.push(FORMATO_ROUTE[f])
                    }
                  : undefined
              }
            >
              <div className={styles.typeIcon}>{FORMATO_ICON[f]}</div>
              <div>
                <Subtitle1>{meta.plural}</Subtitle1>{' '}
                <Badge appearance="tint" color={meta.color}>
                  {conteo(f)}
                </Badge>
              </div>
              <Body1 className={styles.typeDesc}>{meta.descripcion}</Body1>
              <span className={styles.typeMeta}>
                <Caption1>
                  {ready
                    ? `Explorar ${meta.plural.toLowerCase()}`
                    : 'Próximamente'}
                </Caption1>
                {ready ? <ArrowRight20Regular /> : null}
              </span>
            </Card>
          )
        })}
      </div>

      <Divider style={{ marginTop: tokens.spacingVerticalXXXL }} />

      <div className={styles.sectionHead}>
        <Subtitle2 as="h2">Actualizaciones recientes</Subtitle2>
        <Caption1>Los últimos recursos publicados en el Hub.</Caption1>
      </div>

      <div className={styles.recentGrid}>
        {recientes.map((r) => (
          <ResourceCard key={r.id} recurso={r} />
        ))}
      </div>
    </div>
  )
}
