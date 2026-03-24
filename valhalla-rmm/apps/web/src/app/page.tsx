// Root route — middleware handles role-based redirect to /dashboard or /portal
// This page is only reached if middleware passes through (shouldn't happen in practice)
import { redirect } from 'next/navigation'
export default function RootPage() {
  redirect('/login')
}