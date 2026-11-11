import type { ComponentType, ReactNode } from 'react'

const statusStyles: Record<string, string> = {
  Pending: 'bg-amber-100 text-amber-700',
  Assigned: 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-violet-100 text-violet-700',
  'Under Review': 'bg-orange-100 text-orange-700',
  Resolved: 'bg-emerald-100 text-emerald-700',
  Escalated: 'bg-red-100 text-red-700',
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-orange-100 text-orange-700',
  Low: 'bg-emerald-100 text-emerald-700',
  Critical: 'bg-red-100 text-red-700',
  Active: 'bg-emerald-100 text-emerald-700',
  Inactive: 'bg-slate-100 text-slate-600',
  Overdue: 'bg-red-100 text-red-700',
  'Due soon': 'bg-amber-100 text-amber-700',
  'On track': 'bg-emerald-100 text-emerald-700',
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600">{eyebrow}</div>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'blue',
}: {
  label: string
  value: string
  note: string
  icon: ComponentType<{ size?: number }>
  tone?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone === 'blue' ? 'bg-sky-100 text-blue-600' : tone === 'green' ? 'bg-emerald-100 text-emerald-600' : tone === 'violet' ? 'bg-violet-100 text-violet-600' : 'bg-amber-100 text-amber-600'}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
          <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-900">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{note}</div>
        </div>
      </div>
    </div>
  )
}

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${className}`}>{children}</span>
}

export function StatusBadge({ status }: { status: string }) {
  const className = statusStyles[status] ?? 'bg-slate-100 text-slate-700'
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${className}`}>{status}</span>
}
