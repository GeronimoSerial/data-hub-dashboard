'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/** Shown on every visit to the booklet section while it is under development. */
export function CuadernillosDevNotice() {
  const [open, setOpen] = useState(true)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Sección en desarrollo</DialogTitle>
        <DialogDescription>
          Esta sección se encuentra en desarrollo y todavía no está lista para su uso.
        </DialogDescription>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <Button type="button" onClick={() => setOpen(false)}>Entendido</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
