import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (code) {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Check the user's role to decide where to send them
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: member } = await supabase
          .from('organization_members')
          .select('role')
          .eq('user_id', user.id)
          .single()

        const role    = member?.role ?? 'client'
        const isStaff = ['owner', 'admin', 'technician'].includes(role)

        // If next is explicitly specified, honour it — otherwise route by role
        if (next) {
          return NextResponse.redirect(`${origin}${next}`)
        }

        return NextResponse.redirect(`${origin}${isStaff ? '/dashboard' : '/portal'}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}