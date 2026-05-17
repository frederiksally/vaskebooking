import { NextResponse, type NextRequest } from 'next/server'

// UX gate only: redirects unauthed visitors to onboarding. The signed device_id
// JWT is verified by getSession() inside server actions — this proxy just checks
// that the apartment cookie is present, so a missing/forged cookie still gets
// rejected at the action layer.
const PUBLIC = ['/onboarding', '/_next', '/icons', '/manifest.webmanifest', '/sw.js', '/api/cron']

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next()
  const apartment = req.cookies.get('apartment')?.value
  if (!apartment) return NextResponse.redirect(new URL('/onboarding', req.url))
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
