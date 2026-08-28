import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BreadcrumbItem = { label: string; href?: string }

/**
 * shadcn Breadcrumb composition over semantic markup.
 * No interactive primitive is reinvented: items are simple, accessible
 * lists of links; the current page is marked with aria-current="page".
 */

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <React.Fragment key={`${item.label}-${index}`}>
              <BreadcrumbItem>
                {item.href && !isLast ? (
                  <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {!isLast ? <BreadcrumbSeparator /> : null}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function Breadcrumb({ className, ...props }: React.ComponentProps<'nav'>) {
  return <nav aria-label="Breadcrumb" className={cn('breadcrumb', className)} {...props} />
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<'ol'>) {
  return <ol className={cn('breadcrumb__list', className)} {...props} />
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li className={cn('breadcrumb__item', className)} {...props} />
}

function BreadcrumbLink({
  className,
  href,
  children,
  ...props
}: React.ComponentProps<'a'> & { href: string }) {
  return (
    <Link href={href} className={cn('breadcrumb__link', className)} {...props}>
      {children}
    </Link>
  )
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span aria-current="page" className={cn('breadcrumb__page', className)} {...props} />
  )
}

function BreadcrumbSeparator({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      role="presentation"
      aria-hidden="true"
      className={cn('breadcrumb__separator', className)}
      {...props}
    >
      <ChevronRight size={15} />
    </li>
  )
}

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span role="presentation" aria-hidden="true" className={cn('breadcrumb__ellipsis', className)} {...props}>
      <MoreHorizontal size={16} />
    </span>
  )
}

export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis }