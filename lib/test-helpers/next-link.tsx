import * as React from 'react'

// Minimal next/link stand-in for rendering pages in isolation: it renders a
// plain anchor so tests can assert on href and interaction without a router.
export function NextLink({
  href,
  children,
  ...rest
}: {
  href?: string
  children?: React.ReactNode
}) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}