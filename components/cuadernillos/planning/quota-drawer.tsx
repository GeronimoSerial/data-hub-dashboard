'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BookletBalanceView } from '@/lib/cuadernillos/types'
import { Drawer, DrawerBody, DrawerFoot, Note, Stepper, formatCount } from '../kit'

export type QuotaChange = { productId: string; quantity: number }
type Head = { cueAnexo: string; name: string }

/** Set the quota of every grade for one cabecera in a single pass. Only changed grades are saved. */
export function QuotaDrawer({ head, products, quotaOf, assignedTo, saving, error, onClose, onSubmit }: {
  head: Head | null
  products: BookletBalanceView[]
  quotaOf: (cue: string, productId: string) => number
  assignedTo: (productId: string) => number
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (changes: QuotaChange[]) => void
}) {
  return (
    <Drawer open={head !== null} title={head?.name ?? 'Cupos'} description={head ? `CUE ${head.cueAnexo} · Cuántos cuadernillos de cada grado puede pedir.` : undefined} onClose={onClose}>
      {head ? <QuotaForm key={head.cueAnexo} head={head} products={products} quotaOf={quotaOf} assignedTo={assignedTo} saving={saving} error={error} onSubmit={onSubmit} /> : null}
    </Drawer>
  )
}

function QuotaForm({ head, products, quotaOf, assignedTo, saving, error, onSubmit }: {
  head: Head
  products: BookletBalanceView[]
  quotaOf: (cue: string, productId: string) => number
  assignedTo: (productId: string) => number
  saving: boolean
  error: string | null
  onSubmit: (changes: QuotaChange[]) => void
}) {
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(products.map((row) => [row.productId, quotaOf(head.cueAnexo, row.productId)])))
  const changes = products.flatMap((row) => {
    const next = values[row.productId] ?? 0
    return next !== quotaOf(head.cueAnexo, row.productId) ? [{ productId: row.productId, quantity: next }] : []
  })
  return (
    <>
      <DrawerBody>
        <ul className="k-qty-list" aria-label={`Cupos de ${head.name}`}>
          {products.map((row) => {
            const stock = row.globalAvailable
            const current = quotaOf(head.cueAnexo, row.productId)
            // Stock left for this cabecera = stock minus what the other cabeceras already hold.
            const max = stock === null ? 0 : Math.max(0, stock - (assignedTo(row.productId) - current))
            return (
              <li key={row.productId} className="k-qty-row" data-active={(values[row.productId] ?? 0) !== current}>
                <div className="k-row-main">
                  <span className="k-row-title">{row.productLabel}</span>
                  <span className="k-row-meta">{stock === null ? 'Sin stock cargado' : `Podés asignar hasta ${formatCount(max)}`}</span>
                </div>
                <Stepper
                  label={`Cupo · ${row.productLabel}`}
                  value={values[row.productId] ?? 0}
                  max={max}
                  disabled={saving || stock === null}
                  onChange={(next) => setValues((currentValues) => ({ ...currentValues, [row.productId]: next }))}
                />
              </li>
            )
          })}
        </ul>
        {error ? <Note tone="danger">{error}</Note> : null}
      </DrawerBody>
      <DrawerFoot>
        <Button type="button" disabled={saving || changes.length === 0} onClick={() => onSubmit(changes)}>
          {saving ? 'Guardando…' : changes.length > 1 ? `Guardar ${changes.length} cupos` : 'Guardar cupo'}
        </Button>
      </DrawerFoot>
    </>
  )
}
