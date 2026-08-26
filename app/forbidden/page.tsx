'use client'

import Link from 'next/link'
import {
  makeStyles,
  tokens,
  Body1,
  Title3,
} from '@fluentui/react-components'

const useStyles = makeStyles({
  wrap: {
    display: 'flex',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXXL,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
  },
  intro: {
    color: tokens.colorNeutralForeground2,
  },
})

export default function ForbiddenPage() {
  const styles = useStyles()
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Title3>No tenés acceso a este recurso</Title3>
        <Body1 className={styles.intro}>
          Pedí acceso a quien administra el hub si necesitás verlo.
        </Body1>
        <Link href="/">Volver al inicio</Link>
      </div>
    </div>
  )
}
