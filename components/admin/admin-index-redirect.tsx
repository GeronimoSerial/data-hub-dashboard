'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { adminSection, adminSectionHref, LEGACY_HASHES } from '@/components/admin/sections'

/** `/admin` has no content of its own; it forwards legacy `#hash` links to their section route. */
export function AdminIndexRedirect() {
  const router = useRouter()
  React.useEffect(() => {
    const hash = window.location.hash.slice(1)
    const slug = LEGACY_HASHES[hash] ?? adminSection(hash)?.slug ?? 'recursos'
    router.replace(adminSectionHref(slug))
  }, [router])
  return null
}
