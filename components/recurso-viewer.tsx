'use client'

import type { ReactNode } from 'react'
import {
  makeStyles,
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
  frame: {
    width: '100%',
    minHeight: '70vh',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
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

  let body: ReactNode
  if (kind === 'html') {
    body = (
      <iframe
        className={styles.frame}
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
      <iframe className={styles.frame} src={src} title={recurso.titulo} />
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
    <div className={styles.wrap}>
      <Title3 as="h1">{recurso.titulo}</Title3>
      {body}
    </div>
  )
}
