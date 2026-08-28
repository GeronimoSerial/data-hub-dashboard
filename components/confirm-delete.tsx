'use client'

import * as React from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function ConfirmDelete({
  title,
  description,
  onConfirm,
  triggerLabel,
  trigger,
  disabled,
}: {
  title: string
  description: string
  onConfirm: () => void
  triggerLabel: string
  trigger?: React.ReactNode
  disabled?: boolean
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          trigger && React.isValidElement(trigger)
            ? trigger
            : <Button variant="ghost" size="icon" aria-label={triggerLabel} disabled={disabled}><Trash2 size={16} /></Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <div className="ui-dialog-actions">
          <AlertDialogCancel render={<Button variant="secondary" />}>Cancelar</AlertDialogCancel>
          <AlertDialogAction render={<Button variant="destructive" />} onClick={() => onConfirm()}>
            Eliminar
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}