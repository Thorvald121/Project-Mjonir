import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES    = ['/login', '/portal/login', '/csat', '/quote-approval', '/auth/callback']
const PORTAL_ROUTES    = ['/portal']
const ADMIN_ROUTES     = ['/dashboard','/tickets','/customers','/invoices','/time-tracking','/inventory','/quotes','/pipeline','/reports','/knowledge-base','/settings','/tech-dashboard','/email-automations','/ticket-automations']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_ROUTES.some(r => path.startsWith(r))

  // Not logged in
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = PORTAL_ROUTES.some(r => path.startsWith(r)) ? '/portal/login' : '/login'
    url.searchParams.set('redirectTo', path)
    return NextResponse.redirect(url)
  }

  // Logged in — check role
  if (user) {
    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const role = member?.role ?? 'client'
    const isStaff  = ['owner', 'admin', 'technician'].includes(role)
    const isClient = role === 'client'

    // Redirect away from login pages
    if (path === '/login' || path === '/portal/login') {
      const url = request.nextUrl.clone()
      url.pathname = isStaff ? '/dashboard' : '/portal'
      return NextResponse.redirect(url)
    }

    // Client trying to reach admin area
    if (isClient && ADMIN_ROUTES.some(r => path.startsWith(r))) {
      return NextResponse.redirect(new URL('/portal', request.url))
    }

    // Staff trying to reach client portal
    if (isStaff && path.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
