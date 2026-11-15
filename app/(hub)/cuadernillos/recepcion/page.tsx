import { SchoolReceipts } from '@/components/cuadernillos/receipts/school-receipts'
import { requireServerHubPageAccess } from '@/lib/hub-entry-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function RecepcionPage() {
  await requireServerHubPageAccess('/cuadernillos/recepcion', 'cuadernillos')

  return <SchoolReceipts />
}
