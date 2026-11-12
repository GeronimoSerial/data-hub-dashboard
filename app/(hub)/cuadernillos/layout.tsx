import type { ReactNode } from 'react'
import { CuadernillosDevNotice } from '@/components/cuadernillos/dev-notice'

export default function CuadernillosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CuadernillosDevNotice />
      {children}
    </>
  )
}
