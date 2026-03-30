import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/portal/login', '/invite', '/forgot-password', '/reset-password', '/csat', '/quote-approval', '/auth/callback', '/verify-2fa', '/agent']
const ADMIN_ROUTES  = [
  '/dashboard', '/tickets', '/customers', '/invoices', '/time-tracking',
  '/inventory', '/quotes', '/pipeline', '/reports', '/knowledge-base',
  '/settings', '/tech-dashboard', '/email-automations', '/ticket-automations',
  '/canned-replies', '/msp-plans', '/monitoring', '/ticket-templates', '/scheduled-reports', '/contracts', '/audit-log', '/csat-analytics', '/maintenance',
]

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path     = request.nextUrl.pathname
  const isPublic = PUBLIC_ROUTES.some(r => path.startsWith(r))

  // Not logged in
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = path.startsWith('/portal') ? '/portal/login' : '/login'
    url.searchParams.set('redirectTo', path)
    return NextResponse.redirect(url)
  }

  if (user) {
    const { data: member } = await supabase
      .from('organization_members').select('role').eq('user_id', user.id).single()

    const role    = member?.role ?? 'client'
    const isStaff = ['owner', 'admin', 'technician'].includes(role)

    // Redirect away from login pages
    if (path === '/login' || path === '/portal/login') {
      return NextResponse.redirect(new URL(isStaff ? '/dashboard' : '/portal', request.url))
    }

    // Root → role-based redirect
    if (path === '/') {
      return NextResponse.redirect(new URL(isStaff ? '/dashboard' : '/portal', request.url))
    }

    // Client trying to reach admin area → portal
    if (!isStaff && ADMIN_ROUTES.some(r => path.startsWith(r))) {
      return NextResponse.redirect(new URL('/portal', request.url))
    }

    // Staff trying to reach client portal → dashboard
    if (isStaff && path.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}