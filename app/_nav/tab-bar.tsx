'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, ListChecks, Settings } from 'lucide-react'

const TABS = [
  { href: '/', label: 'Kalender', Icon: Calendar },
  { href: '/bookings', label: 'Bookinger', Icon: ListChecks },
  { href: '/settings', label: 'Indstillinger', Icon: Settings },
] as const

export function TabBar() {
  const pathname = usePathname()
  // Hide on onboarding — pre-auth surface should stay focused.
  if (pathname.startsWith('/onboarding')) return null

  return (
    <nav
      aria-label="Hovednavigation"
      className="sticky bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-3">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 px-2 py-2.5 text-xs transition-colors ${
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
