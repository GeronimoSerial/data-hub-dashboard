'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BookletBalanceView } from '@/lib/cuadernillos/types'
import { Modal, ModalBody, ModalFoot, Note, Stepper, formatCount } from '../kit'

/** Register stock for one grade. The movement kind follows the data: no stock yet means initial, otherwise replenishment. */
export function StockModal({ product, saving, error, onClose, onSubmit }: {
  product: BookletBalanceView | null
  saving: boolean
  error: string | null
  onClose: () => void
  onSubmit: (quantity: number, movement: 'initial' | 'replenishment') => void
}) {
  return (
    <Modal open={product !== null} title={product?.productLabel ?? 'Stock'} description="Cargá cuántos cuadernillos hay para enviar." onClose={onClose}>
      {product ? <StockForm key={product.productId} product={product} saving={saving} error={error} onSubmit={onSubmit} /> : null}
    </Modal>
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
      <ModalBody>
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
          {initial ? 'Todavía no hay stock de este grado. Cargá cuántos cuadernillos tenés.' : `Stock actual: ${formatCount(product.globalAvailable ?? 0)}. Lo que cargues se suma al stock.`}
        </p>
        <div className="k-qty-row">
          <span className="k-row-title">{initial ? 'Cuántos tenés' : 'Cuántos sumás'}</span>
          <Stepper label="Cantidad de stock" value={quantity} disabled={saving} onChange={setQuantity} />
        </div>
        {error ? <Note tone="danger">{error}</Note> : null}
      </ModalBody>
      <ModalFoot>
        <Button type="button" disabled={saving || quantity <= 0} onClick={() => onSubmit(quantity, movement)}>
          {saving ? 'Guardando…' : 'Guardar stock'}
        </Button>
      </ModalFoot>
    </>
  )
}
