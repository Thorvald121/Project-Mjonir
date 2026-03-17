import { Settings2 } from 'lucide-react'

// TODO: Full page migration from Base44
// This placeholder prevents 404 errors while pages are being migrated.
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Platform configuration</p>
      </div>
      <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
          <Settings2 className="w-7 h-7 text-amber-500" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-slate-800 dark:text-slate-200">Settings</p>
          <p className="text-sm text-slate-400 mt-1">This page is being migrated from Base44.<br />Full functionality coming soon.</p>
        </div>
      </div>
    </div>
  )
}
