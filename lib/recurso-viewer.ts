import { DOWNLOAD_MIMES, isViewerMime } from '@/lib/upload'

export const HTML_IFRAME_SANDBOX = 'allow-scripts allow-forms'

export type ViewerKind = 'html' | 'image' | 'pdf' | 'download' | 'unknown'

export function viewerKind(mime: string | null | undefined): ViewerKind {
  if (!mime) return 'unknown'
  if (mime === 'text/html') return 'html'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/') && isViewerMime(mime)) return 'image'
  if ((DOWNLOAD_MIMES as readonly string[]).includes(mime)) return 'download'
  return 'unknown'
}

export function archivoSrc(id: string, download = false) {
  const base = `/api/recursos/${id}/archivo`
  return download ? `${base}?download=1` : base
}
