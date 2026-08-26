'use client'

import type { ReactNode } from 'react'
import {
  makeStyles,
  mergeClasses,
  tokens,
  Body1,
  Button,
  Title3,
} from '@fluentui/react-components'
import {
  HTML_IFRAME_SANDBOX,
  archivoSrc,
  viewerKind,
} from '@/lib/recurso-viewer'

const useStyles = makeStyles({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  fill: {
    flexGrow: 1,
    minHeight: 0,
    height: '100%',
    gap: 0,
  },
  titleBar: {
    flexShrink: 0,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  frameFill: {
    width: '100%',
    flexGrow: 1,
    minHeight: 0,
    height: '100%',
    border: 'none',
    borderRadius: 0,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  image: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    outline: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  download: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalM,
    maxWidth: '640px',
  },
  hint: {
    color: tokens.colorNeutralForeground2,
  },
})

export function RecursoViewer({
  recurso,
}: {
  recurso: { id: string; titulo: string; mime: string | null }
}) {
  const styles = useStyles()
  const kind = viewerKind(recurso.mime)
  const src = archivoSrc(recurso.id)
  const fillFrame = kind === 'html' || kind === 'pdf'

  let body: ReactNode
  if (kind === 'html') {
    body = (
      <iframe
        className={styles.frameFill}
        sandbox={HTML_IFRAME_SANDBOX}
        src={src}
        title={recurso.titulo}
      />
    )
  } else if (kind === 'image') {
    body = (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={styles.image} src={src} alt={recurso.titulo} />
    )
  } else if (kind === 'pdf') {
    body = (
      <iframe
        className={styles.frameFill}
        src={src}
        title={recurso.titulo}
      />
    )
  } else {
    body = (
      <div className={styles.download}>
        <Body1 className={styles.hint}>
          Este archivo no se puede previsualizar en el navegador.
        </Body1>
        <Button as="a" href={archivoSrc(recurso.id, true)} appearance="primary">
          Descargar
        </Button>
      </div>
    )
  }

  return (
    <div className={mergeClasses(styles.wrap, fillFrame && styles.fill)}>
      <Title3 as="h1" className={fillFrame ? styles.titleBar : undefined}>
        {recurso.titulo}
      </Title3>
      {body}
    </div>
  )
}
