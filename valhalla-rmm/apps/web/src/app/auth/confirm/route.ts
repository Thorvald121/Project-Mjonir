// apps/web/src/app/auth/confirm/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')
  const code       = searchParams.get('code')

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()             { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        },
      },
    }
  )

  // PKCE code exchange
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/portal/set-password`)
    }
  }

  // Token hash (from custom email template)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as any,
    })
    if (!error) {
      // Session is now set in cookies — send to set-password page
      if (type === 'recovery' || type === 'invite' || type === 'signup') {
        return NextResponse.redirect(`${origin}/portal/set-password`)
      }
      return NextResponse.redirect(`${origin}/portal`)
    }
    // Log the error so we can see it in Supabase function logs
    console.error('verifyOtp error:', error.message, 'type:', type)
  }

  // Failed — link expired or invalid
  return NextResponse.redirect(
    `${origin}/portal/login?error=link_expired`
  )
}