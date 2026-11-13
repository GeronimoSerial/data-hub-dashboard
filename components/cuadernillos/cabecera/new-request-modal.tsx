'use client'

import { useState } from 'react'
import type { BookletBalanceView } from '@/lib/cuadernillos/types'
import { Modal, ModalBody } from '../kit'
import type { CriticalSchool } from './cabecera-api'
import { QuantitiesForm } from './quantities-form'
import { SchoolSearch, useSchoolSearchState } from './school-search'

/** New request in two steps inside one modal: pick the school, then set quantities per grade. */
export function NewRequestModal({ open, cabeceraCue, campaignId, balances, onClose, onSaved }: {
  open: boolean
  cabeceraCue: string
  campaignId: string
  balances: BookletBalanceView[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [selected, setSelected] = useState<CriticalSchool | null>(null)
  const search = useSchoolSearchState()

  function close() {
    setSelected(null)
    search.setResults(null)
    search.setCueQuery('')
    onClose()
  }

  return (
    <Modal
      open={open}
      title="Nuevo pedido"
      description={selected ? `Cuántos cuadernillos pedís para ${selected.nombre}.` : 'Buscá la escuela destinataria por CUE.'}
      onClose={close}
    >
      {selected ? (
        <>
          <QuantitiesForm
            top={<SchoolSearch state={search} selected={selected} onChoose={setSelected} onClear={() => setSelected(null)} />}
            key={`${selected.cueAnexo}:${cabeceraCue}:${campaignId}`}
            school={selected}
            campaignId={campaignId}
            cabeceraCue={cabeceraCue}
            balances={balances}
            onSaved={(message) => { setSelected(null); onSaved(message) }}
          />
        </>
      ) : (
        <ModalBody>
          <SchoolSearch state={search} selected={null} onChoose={setSelected} onClear={() => setSelected(null)} />
        </ModalBody>
      )}
    </Modal>
  )
}
