'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BookletBalanceView } from '@/lib/cuadernillos/types'
import { Drawer, DrawerBody, DrawerFoot, Note, Stepper, formatCount } from '../kit'

/** Register stock for one grade. The movement kind follows the data: no stock yet means initial, otherwise replenishment. */
export function StockDrawer({ product, saving, error, onClose, onSubmit }: {
  product: BookletBalanceView | null
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (quantity: number, movement: 'initial' | 'replenishment') => void
}) {
  return (
    <Drawer open={product !== null} title={product?.productLabel ?? 'Stock'} description="Cargar stock global" onClose={onClose}>
      {product ? <StockForm key={product.productId} product={product} saving={saving} error={error} onSubmit={onSubmit} /> : null}
    </Drawer>
  )
}

function StockForm({ product, saving, error, onSubmit }: {
  product: BookletBalanceView
  saving: boolean
  error: string | null
  onSubmit: (quantity: number, movement: 'initial' | 'replenishment') => void
}) {
  const [quantity, setQuantity] = useState(0)
  const initial = product.globalAvailable === null
  const movement = initial ? 'initial' : 'replenishment'
  return (
    <>
      <DrawerBody>
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
          {initial ? 'Todavía no hay stock de este grado. Este es el ingreso inicial.' : `Stock actual: ${formatCount(product.globalAvailable ?? 0)}. Lo que cargues se suma como reposición.`}
        </p>
        <div className="k-qty-row">
          <span className="k-row-title">{initial ? 'Ingreso inicial' : 'Reposición'}</span>
          <Stepper label="Cantidad de stock" value={quantity} disabled={saving} onChange={setQuantity} />
        </div>
        {error ? <Note tone="danger">{error}</Note> : null}
      </DrawerBody>
      <DrawerFoot>
        <Button type="button" disabled={saving || quantity <= 0} onClick={() => onSubmit(quantity, movement)}>
          {saving ? 'Guardando…' : 'Registrar movimiento'}
        </Button>
      </DrawerFoot>
    </>
  )
}
