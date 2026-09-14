import { normalizeForbiddenNext } from '@/lib/nav'
import { ForbiddenActions } from '@/components/forbidden-actions'

export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  // Only a validated internal path is trusted; the destination is never used
  // to re-navigate to the denied target (that would loop). It is only carried
  // as a safe callback for the change-account flow.
  const destination = normalizeForbiddenNext(next)
  const callbackUrl = destination
    ? `/login?callbackUrl=${encodeURIComponent(destination)}`
    : '/login'

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="page-title page-title--sm">
          No tenés acceso a este recurso
        </h1>
        <p className="auth-intro">
          Pedí acceso a quien administra el hub si necesitás verlo. Esta página
          no muestra información detallada del recurso sin permiso.
        </p>
        <ForbiddenActions callbackUrl={callbackUrl} />
      </div>
    </div>
  )
}