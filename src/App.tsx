import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Flag,
  Gauge,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquareText,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UploadCloud,
  User,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAppStore, type Complaint, type ComplaintStatus, type Role } from './store/useAppStore'

const navConfig = {
  citizen: [
    { label: 'Overview', to: '/citizen/overview', icon: LayoutDashboard },
    { label: 'Submit Complaint', to: '/citizen/submit', icon: Plus },
    { label: 'My Complaints', to: '/citizen/complaints', icon: FileText },
    { label: 'Track Complaint', to: '/citizen/track', icon: MapPin },
    { label: 'Notifications', to: '/citizen/notifications', icon: Bell },
    { label: 'My Profile', to: '/citizen/profile', icon: User },
  ],
  officer: [
    { label: 'Overview', to: '/officer/overview', icon: LayoutDashboard },
    { label: 'Assigned Complaints', to: '/officer/assigned', icon: ClipboardCheck },
    { label: 'Department Complaints', to: '/officer/department', icon: FileText },
    { label: 'Duplicate Complaints', to: '/officer/duplicates', icon: AlertTriangle },
    { label: 'Suspicious Submissions', to: '/officer/suspicious', icon: ShieldCheck },
    { label: 'Reports', to: '/officer/reports', icon: TrendingUp },
  ],
  admin: [
    { label: 'Overview', to: '/admin/overview', icon: LayoutDashboard },
    { label: 'All Complaints', to: '/admin/complaints', icon: FileText },
    { label: 'AI Monitoring', to: '/admin/ai', icon: Sparkles },
    { label: 'Duplicate Detection', to: '/admin/duplicates', icon: AlertTriangle },
    { label: 'Fraud Review Queue', to: '/admin/fraud', icon: Flag },
    { label: 'Citizens', to: '/admin/citizens', icon: Users },
    { label: 'Officers', to: '/admin/officers', icon: ShieldCheck },
    { label: 'Departments', to: '/admin/departments', icon: Building2 },
    { label: 'Analytics & Reports', to: '/admin/reports', icon: TrendingUp },
  ],
} as const

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
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))

const complaintSchema = z.object({
  title: z.string().min(10, 'Please provide a clear title.'),
  description: z.string().min(30, 'Please describe the issue in more detail.'),
  category: z.string().min(1, 'Choose a category.'),
  subcategory: z.string().min(1, 'Choose a subcategory.'),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  incidentDate: z.string().min(1, 'Select the incident date and time.'),
  address: z.string().min(5, 'Provide the full address.'),
  state: z.string().min(2, 'State is required.'),
  district: z.string().min(2, 'District is required.'),
  city: z.string().min(2, 'City is required.'),
  pincode: z.string().min(6, 'Enter a valid pincode.'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  remarks: z.string().optional(),
  consent: z.boolean().refine((boolean) => boolean === true, 'Please confirm the information is accurate.'),
})

type ComplaintFormValues = z.infer<typeof complaintSchema>

function App() {
  const session = useAppStore((state) => state.session)

  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={session ? <Navigate to={`/${session.role}`} replace /> : <LoginPage />} />
        <Route path="/citizen/*" element={session && session.role === 'citizen' ? <DashboardLayout role="citizen" /> : <Navigate to="/login" replace />} />
        <Route path="/officer/*" element={session && session.role === 'officer' ? <DashboardLayout role="officer" /> : <Navigate to="/login" replace />} />
        <Route path="/admin/*" element={session && session.role === 'admin' ? <DashboardLayout role="admin" /> : <Navigate to="/login" replace />} />
      </Routes>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-4">
        <div id="toast-root" />
      </div>
    </>
  )
}

function LandingPage() {
  const navigate = useNavigate()

  const enterDemo = (role: Role) => {
    const sessionMap = {
      citizen: 'citizen@example.com',
      officer: 'officer@example.com',
      admin: 'admin@example.com',
    }

    const store = useAppStore.getState()
    const user = store.login(sessionMap[role], 'Demo@123')
    if (user) {
      toast.success(`Logged in as ${user.name}.`)
      navigate(`/${role}/overview`)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy text-white shadow-soft">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight text-slate-900">
              Nagrik <span className="text-blue-600">Setu</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Public Grievance Portal</div>
          </div>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
          <a href="#how">How it works</a>
          <a href="#services">Services</a>
          <a href="#transparency">Transparency</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="flex items-center gap-3">
          <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-navy" onClick={() => navigate('/login')}>Login</button>
          <button className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white shadow-soft" onClick={() => enterDemo('citizen')}>Register</button>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-8 px-6 pb-20 pt-16 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Government of Haryana · Digital Services
            </div>
            <h1 className="mt-6 text-5xl font-black leading-[0.94] tracking-[-0.05em] text-slate-900 md:text-7xl">
              Your voice.<br />
              <span className="font-serif text-blue-600 italic">Your rights.</span><br />
              Our responsibility.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-slate-600">
              Report civic issues, track your grievances and help build a more accountable and responsive government service system.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-3 font-semibold text-white shadow-soft" onClick={() => enterDemo('citizen')}>
                <Plus size={18} /> Submit a complaint
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-navy" onClick={() => enterDemo('citizen')}>
                Track a complaint <ArrowRight size={18} />
              </button>
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs font-medium text-slate-500">
              <ShieldCheck size={15} className="text-emerald-500" /> Secure, transparent and accountable by design
            </div>
          </div>

          <div className="relative">
            <div className="absolute -left-8 top-16 h-52 w-52 rounded-full bg-sky-100 blur-3xl" />
            <div className="absolute -right-4 bottom-6 h-52 w-52 rounded-full bg-blue-100 blur-3xl" />
            <div className="relative mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-3 shadow-soft">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-blue-600"><ShieldCheck size={15} /></div>
                Live Service Status
                <span className="ml-auto h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <div className="relative h-64 overflow-hidden rounded-2xl bg-slate-100">
                <div className="absolute inset-0 bg-[linear-gradient(30deg,transparent_44%,#d7e4f2_45%,#d7e4f2_47%,transparent_48%),linear-gradient(120deg,transparent_44%,#d7e4f2_45%,#d7e4f2_47%,transparent_48%)] bg-[length:72px_52px] opacity-70" />
                <div className="absolute left-10 top-10 h-2.5 w-24 -rotate-12 border-t-2 border-sky-400" />
                <div className="absolute left-28 top-24 h-2.5 w-28 rotate-12 border-t-2 border-emerald-400" />
                <div className="absolute left-20 top-20 flex h-8 w-8 -rotate-45 items-center justify-center rounded-full bg-blue-600 text-white">
                  <MapPin size={15} />
                </div>
                <div className="absolute right-24 bottom-12 flex h-8 w-8 -rotate-45 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <MapPin size={15} />
                </div>
                <div className="absolute left-24 top-14 rounded-lg bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm">Roads & transport</div>
                <div className="absolute bottom-10 right-8 rounded-lg bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm">Water & sanitation</div>
              </div>
              <div className="grid grid-cols-2 gap-6 px-4 py-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Active requests</div>
                  <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">2,481</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Resolved</div>
                  <div className="mt-2 text-3xl font-bold tracking-tight text-emerald-600">1,942</div>
                </div>
              </div>
            </div>
            <div className="absolute left-0 top-24 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600"><CheckCircle2 size={18} /></div>
              <div>
                <div className="text-[11px] font-semibold text-slate-800">Complaint resolved</div>
                <div className="text-[10px] text-slate-500">GRV-2026-00438</div>
              </div>
            </div>
            <div className="absolute -bottom-2 right-0 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><Sparkles size={18} /></div>
              <div>
                <div className="text-[11px] font-semibold text-slate-800">AI-assisted routing</div>
                <div className="text-[10px] text-slate-500">Right team, first time</div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-navy text-white">
          <div className="mx-auto grid max-w-7xl gap-0 md:grid-cols-4">
            {[['12,846', 'Complaints submitted'], ['8,276', 'Successfully resolved'], ['64.4%', 'Resolution rate'], ['3.8 days', 'Average resolution time']].map(([value, label]) => (
              <div key={label} className="border-r border-white/10 px-8 py-9 text-center last:border-r-0">
                <div className="text-3xl font-black tracking-tight">{value}</div>
                <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-sky-100/80">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-12 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">How it works</div>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.05em] text-slate-900">From concern to resolution,<br /><span className="italic text-blue-600">without the runaround.</span></h2>
            </div>
            <p className="max-w-md text-sm leading-7 text-slate-600">One simple platform to make your voice heard and keep you informed every step of the way.</p>
          </div>
          <div className="grid gap-7 md:grid-cols-4">
            {[
              { step: '01', icon: FileText, title: 'Submit your grievance', description: 'Share the details, location and supporting evidence in a few simple steps.' },
              { step: '02', icon: Sparkles, title: 'We route it intelligently', description: 'The system helps identify the right category and department for quicker action.' },
              { step: '03', icon: Gauge, title: 'Track every update', description: 'Get clear status updates and know exactly what happens next.' },
              { step: '04', icon: CheckCircle2, title: 'See it get resolved', description: 'Receive the resolution details and help us improve your city.' },
            ].map(({ step, icon: Icon, title, description }) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{step}</div>
                <div className="mt-5 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-blue-600">
                  <Icon size={22} />
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="transparency" className="bg-slate-100/80 py-24">
          <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Built for trust</div>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.05em] text-slate-900">Governance that<br /><span className="italic text-blue-600">keeps you in the loop.</span></h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-slate-600">Every complaint is assigned a reference ID, a responsible department and a clear resolution trail. No black boxes. No dead ends.</p>
              <button className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-600" onClick={() => enterDemo('citizen')}>
                Explore the portal <ArrowRight size={16} />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['AI-assisted triage', 'Machine-driven classification supports human decision-making and department routing.'],
                ['Real-time tracking', 'Monitor complaint status with timely updates, remarks and resolution evidence.'],
                ['Transparent resolution', 'Review officer actions, evidence and final status before closure.'],
                ['Accountability', 'Every step is logged with role-based access and audit visibility.'],
              ].map(([title, description]) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-blue-600"><Sparkles size={18} /></div>
                  <h3 className="text-base font-bold text-slate-900">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer id="contact" className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-10 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="font-semibold text-slate-700">Nagrik Setu</span> · Smart grievance redressal & fake complaint detection system
          </div>
          <div className="flex gap-5">
            <a href="#how">How it works</a>
            <a href="#transparency">Transparency</a>
            <a href="#contact">Support</a>
          </div>
        </footer>
      </main>
    </div>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const login = useAppStore((state) => state.login)
  const [form, setForm] = useState({ email: 'citizen@example.com', password: 'Demo@123' })
  const [error, setError] = useState('')

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const user = login(form.email, form.password)
    if (!user) {
      setError('Invalid credentials. Use the demo accounts listed on the page.')
      toast.error('Login failed. Please try again.')
      return
    }

    toast.success(`Welcome back, ${user.name}.`)
    navigate(`/${user.role}/overview`)
  }

  const demoAccounts = [
    ['Citizen', 'citizen@example.com', 'Demo@123'],
    ['Officer', 'officer@example.com', 'Demo@123'],
    ['Admin', 'admin@example.com', 'Demo@123'],
  ]

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-8 bg-slate-900 px-8 py-10 text-white lg:px-12">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><ShieldCheck size={20} /></div>
              <div>
                <div className="text-lg font-bold">Nagrik Setu</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-300">Secure access</div>
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-[-0.05em]">Welcome back.</h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">Sign in to continue managing public grievances across citizen, officer and administrator workflows.</p>
            </div>
            <div className="grid gap-3">
              {demoAccounts.map(([role, email, password]) => (
                <div key={role} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-300">{role}</div>
                  <div className="mt-2 text-sm font-medium text-white">{email}</div>
                  <div className="text-xs text-slate-300">{password}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-8 lg:p-10">
            <div className="mb-6">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Demo authentication</div>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-900">Sign in</h2>
            </div>
            <form onSubmit={onSubmit} className="space-y-5">
              <label className="block text-sm font-medium text-slate-700">
                Email address
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <button type="submit" className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white shadow-soft">Log in</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

function DashboardLayout({ role }: { role: Role }) {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAppStore((state) => state.logout)
  const session = useAppStore((state) => state.session)

  const items = navConfig[role]
  const activeLabel = items.find((item) => location.pathname.startsWith(item.to))?.label ?? items[0].label

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-full max-w-[260px] bg-navy p-4 text-slate-200 lg:block">
          <div className="flex items-center gap-3 px-2 pb-6 pt-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-navy"><ShieldCheck size={20} /></div>
            <div>
              <div className="text-lg font-bold text-white">Nagrik <span className="text-blue-300">Setu</span></div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-300">Public portal</div>
            </div>
          </div>
          <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-300">Workspace</div>
            <div className="mt-2 text-sm font-semibold text-white">Gurugram District</div>
          </div>
          <nav className="space-y-2">
            {items.map(({ label, to, icon: Icon }) => (
              <NavLink
                key={label}
                to={to}
                className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white/10 text-white shadow-inner' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-navy font-bold">{session?.name.slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{session?.name}</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-300">{role}</div>
              </div>
            </div>
            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white" onClick={handleLogout}>
              <LogOut size={16} /> Log out
            </button>
          </div>
        </aside>

        <main className="flex-1">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
            <div className="flex items-center gap-3">
              <button className="rounded-xl border border-slate-200 p-2 lg:hidden"><Menu size={18} /></button>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Home</span>
                <ChevronRight size={16} />
                <span className="font-semibold text-slate-900">{activeLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Demo role: {role}
              </div>
              <button className="rounded-xl border border-slate-200 bg-white p-2"><Search size={18} /></button>
              <button className="relative rounded-xl border border-slate-200 bg-white p-2">
                <Bell size={18} />
                <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
              </button>
            </div>
          </header>

          <div className="px-6 py-8">
            <Routes>
              <Route path="overview" element={role === 'citizen' ? <CitizenOverview /> : role === 'officer' ? <OfficerOverview /> : <AdminOverview />} />
              <Route path="submit" element={<CitizenSubmitComplaint />} />
              <Route path="complaints" element={<CitizenComplaints />} />
              <Route path="track" element={<TrackComplaint />} />
              <Route path="notifications" element={<CitizenNotifications />} />
              <Route path="profile" element={<CitizenProfile />} />
              <Route path="assigned" element={<OfficerAssignments />} />
              <Route path="department" element={<DepartmentComplaints />} />
              <Route path="duplicates" element={<DuplicateReview />} />
              <Route path="suspicious" element={<SuspiciousReview />} />
              <Route path="reports" element={<OfficerReports />} />
              <Route path="ai" element={<AdminMonitoring />} />
              <Route path="complaints" element={<AdminAllComplaints />} />
              <Route path="fraud" element={<FraudReview />} />
              <Route path="citizens" element={<CitizenManagement />} />
              <Route path="officers" element={<OfficerManagement />} />
              <Route path="departments" element={<DepartmentManagement />} />
              <Route path="reports" element={<AdminReports />} />
              <Route index element={<Navigate to="overview" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  )
}

function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
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

function StatCard({ label, value, note, icon: Icon, tone = 'blue' }: { label: string; value: string; note: string; icon: React.ComponentType<{ size?: number }>; tone?: string }) {
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

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${className}`}>{children}</span>
}

function StatusBadge({ status }: { status: string }) {
  const className = statusStyles[status] ?? 'bg-slate-100 text-slate-700'
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${className}`}>{status}</span>
}

function CitizenOverview() {
  const session = useAppStore((state) => state.session)
  const complaints = useAppStore((state) => state.complaints.filter((complaint) => complaint.citizenEmail === session?.email))
  const notifications = useAppStore((state) => state.notifications)
  const navigate = useNavigate()

  const stats = [
    { label: 'Total complaints', value: String(complaints.length), note: 'Across all issues', icon: FileText, tone: 'blue' },
    { label: 'Pending', value: String(complaints.filter((item) => item.status === 'Pending').length), note: 'Awaiting review', icon: Gauge, tone: 'amber' },
    { label: 'In progress', value: String(complaints.filter((item) => item.status === 'In Progress').length), note: 'Active assignments', icon: TrendingUp, tone: 'violet' },
    { label: 'Resolved', value: String(complaints.filter((item) => item.status === 'Resolved').length), note: 'Completed cases', icon: CheckCircle2, tone: 'green' },
  ]

  const chartData = [
    { name: 'Pending', value: complaints.filter((item) => item.status === 'Pending').length },
    { name: 'Assigned', value: complaints.filter((item) => item.status === 'Assigned').length },
    { name: 'In Progress', value: complaints.filter((item) => item.status === 'In Progress').length },
    { name: 'Resolved', value: complaints.filter((item) => item.status === 'Resolved').length },
  ]

  return (
    <>
      <SectionHeader
        eyebrow="Citizen portal"
        title={`Good morning, ${session?.name ?? 'Citizen'}`}
        description="Track your grievances and stay updated on how your cases are progressing."
        action={<button className="rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white" onClick={() => navigate('/citizen/submit')}><Plus size={16} className="mr-2 inline" />Submit complaint</button>}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{stats.map((item) => <StatCard key={item.label} {...item} />)}</div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Complaint status</h2>
              <p className="text-xs text-slate-500">Current lifecycle</p>
            </div>
            <button className="text-sm font-medium text-blue-600" onClick={() => navigate('/citizen/complaints')}>View all</button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#2563EB" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
              <p className="text-xs text-slate-500">Recent updates</p>
            </div>
            <button className="text-sm font-medium text-blue-600" onClick={() => navigate('/citizen/notifications')}>Open</button>
          </div>
          <div className="space-y-3">
            {notifications.slice(0, 3).map((item) => (
              <div key={item.id} className={`rounded-xl border p-3 ${item.read ? 'border-slate-200 bg-slate-50' : 'border-blue-100 bg-blue-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm text-slate-700">{item.message}</div>
                  {!item.read ? <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> : null}
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-slate-400">{formatDate(item.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Recent complaints</h2>
            <p className="text-xs text-slate-500">Latest case activity</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <th className="pb-3 pr-4">Complaint</th>
                <th className="pb-3 pr-4">Category</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Priority</th>
                <th className="pb-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {complaints.slice(0, 4).map((complaint) => (
                <tr key={complaint.id}>
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-slate-900">{complaint.title}</div>
                    <div className="text-xs text-slate-500">{complaint.id}</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{complaint.category}</td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.status} /></td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.priority} /></td>
                  <td className="py-3 text-slate-600">{formatDate(complaint.lastUpdated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function CitizenSubmitComplaint() {
  const navigate = useNavigate()
  const session = useAppStore((state) => state.session)
  const createComplaint = useAppStore((state) => state.createComplaint)
  const [imagePreviews, setImagePreviews] = useState<string[]>([])

  const defaultValues: ComplaintFormValues = {
    title: '',
    description: '',
    category: 'Sanitation',
    subcategory: 'Drainage',
    severity: 'Medium',
    incidentDate: new Date().toISOString().slice(0, 16),
    address: 'Sector 14 Market Road',
    state: 'Haryana',
    district: 'Gurugram',
    city: 'Gurugram',
    pincode: '122002',
    latitude: 28.4595,
    longitude: 77.0266,
    remarks: '',
    consent: false,
  }

  const form = useForm<ComplaintFormValues>({
    resolver: zodResolver(complaintSchema),
    defaultValues,
  })

  const watchedCategory = form.watch('category')
  const watchedSeverity = form.watch('severity')

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    const next = files
      .filter((file) => /image\/(png|jpe?g|webp)/i.test(file.type))
      .slice(0, 4)
      .map((file) => URL.createObjectURL(file))
    setImagePreviews(next)
  }

  const onSubmit = (values: ComplaintFormValues) => {
    const complaint: Omit<Complaint, 'id' | 'createdAt' | 'lastUpdated'> = {
      title: values.title,
      description: values.description,
      category: values.category,
      subcategory: values.subcategory,
      severity: values.severity,
      incidentDate: values.incidentDate,
      address: values.address,
      state: values.state,
      district: values.district,
      city: values.city,
      pincode: values.pincode,
      latitude: values.latitude,
      longitude: values.longitude,
      remarks: [values.remarks || 'Complaint filed and awaiting review.'],
      consent: values.consent,
      status: 'Pending',
      priority: values.severity,
      department: values.category === 'Street Lighting' ? 'Electrical Services' : 'Municipal Corporation',
      assignedOfficer: 'Priya Sharma',
      citizenName: session?.name ?? 'Citizen User',
      citizenEmail: session?.email ?? 'citizen@example.com',
      images: imagePreviews,
      riskScore: 18,
      ai: {
        predictedCategory: values.category,
        suggestedDepartment: values.category === 'Street Lighting' ? 'Electrical Services' : 'Municipal Corporation',
        duplicateWarning: 'No duplicate signal found in local review.',
        confidence: 91,
        imageRisk: 15,
      },
    }

    const created = createComplaint(complaint)
    toast.success(`Complaint ${created.id} submitted successfully.`)
    navigate('/citizen/track')
  }

  return (
    <>
      <SectionHeader eyebrow="New grievance" title="Submit a complaint" description="Provide detailed information so the right department can investigate and resolve it." />
      <div className="grid gap-8 xl:grid-cols-[1.7fr_0.9fr]">
        <form onSubmit={form.handleSubmit(onSubmit)} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900">Complaint information</h2>
          </div>
          <div className="space-y-6 p-5">
            <div>
              <label className="text-sm font-medium text-slate-700">Complaint title</label>
              <input {...form.register('title')} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" placeholder="e.g. Open drain near Sector 14 market" />
              {form.formState.errors.title ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.title.message}</p> : null}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Detailed description</label>
              <textarea {...form.register('description')} rows={5} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" placeholder="Describe the condition, timeline and impact on the neighborhood." />
              {form.formState.errors.description ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.description.message}</p> : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">Category</label>
                <select {...form.register('category')} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <option>Sanitation</option>
                  <option>Street Lighting</option>
                  <option>Roads & Transport</option>
                  <option>Water Supply</option>
                  <option>Waste Management</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Subcategory</label>
                <select {...form.register('subcategory')} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <option>Drainage</option>
                  <option>Public lighting</option>
                  <option>Pothole</option>
                  <option>Water leakage</option>
                  <option>Garbage pickup</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Severity</label>
                <select {...form.register('severity')} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Incident date & time</label>
                <input type="datetime-local" {...form.register('incidentDate')} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Full address</label>
              <input {...form.register('address')} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="text-sm font-medium text-slate-700">State</label>
                <input {...form.register('state')} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">District</label>
                <input {...form.register('district')} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">City</label>
                <input {...form.register('city')} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Pincode</label>
                <input {...form.register('pincode')} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Location capture</label>
                <button type="button" className="text-sm font-semibold text-blue-600">Use my current location</button>
              </div>
              <div className="mt-3 h-64 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <LocationMap lat={form.watch('latitude')} lng={form.watch('longitude')} onSelect={(latitude, longitude) => { form.setValue('latitude', latitude); form.setValue('longitude', longitude) }} />
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Latitude</label>
                  <input value={form.watch('latitude')} onChange={(event) => form.setValue('latitude', Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Longitude</label>
                  <input value={form.watch('longitude')} onChange={(event) => form.setValue('longitude', Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Additional remarks</label>
              <textarea {...form.register('remarks')} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" placeholder="Any extra context or latest updates." />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Images</label>
              <div className="mt-2 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                <UploadCloud size={28} className="text-blue-600" />
                <p className="mt-3 text-sm font-medium text-slate-700">Drag & drop files here or browse</p>
                <p className="text-xs text-slate-500">JPG, JPEG, PNG and WEBP only · Up to 4 images</p>
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="mt-3 max-w-xs" onChange={onFileChange} />
              </div>
              {imagePreviews.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {imagePreviews.map((src, index) => (
                    <div key={src} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <img src={src} alt={`Preview ${index + 1}`} className="h-28 w-full object-cover" />
                      <button type="button" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700" onClick={() => setImagePreviews((current) => current.filter((item) => item !== src))}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="flex items-center gap-3 text-sm text-slate-600">
              <input type="checkbox" {...form.register('consent')} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
              I confirm the information provided is accurate to the best of my knowledge.
            </label>
            {form.formState.errors.consent ? <p className="text-xs text-red-600">{form.formState.errors.consent.message}</p> : null}

            <div className="flex justify-end">
              <button type="submit" className="rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white">Submit grievance</button>
            </div>
          </div>
        </form>

        <aside className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600"><Sparkles size={18} /></div>
            <div>
              <div className="text-sm font-bold text-slate-900">AI routing preview</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">DEMO DATA</div>
            </div>
          </div>
          <div className="mt-5 space-y-4 text-sm">
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Predicted category</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-800">{watchedCategory}</span>
                <Pill className="bg-emerald-100 text-emerald-700">{Math.max(88, 90 + (watchedSeverity === 'Critical' ? 6 : watchedSeverity === 'High' ? 3 : 0))}%</Pill>
              </div>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Suggested department</div>
              <div className="mt-2 font-semibold text-slate-800">{watchedCategory === 'Street Lighting' ? 'Electrical Services' : 'Municipal Corporation'}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-amber-700">Potential duplicate warning</div>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><AlertTriangle size={15} /> Similar complaint found</div>
              <div className="mt-1 text-xs text-slate-600">GRV-2026-00476 · 86% similarity</div>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Image risk indicators</div>
              <div className="mt-2 text-sm font-semibold text-slate-800">{imagePreviews.length ? 'Low to moderate risk' : 'Awaiting evidence review'}</div>
            </div>
          </div>
          <p className="mt-5 text-xs leading-6 text-slate-500">AI suggestions are only demonstration feedback and must be reviewed by an officer before any action is finalized.</p>
        </aside>
      </div>
    </>
  )
}

function CitizenComplaints() {
  const complaints = useAppStore((state) => state.complaints)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')

  const filtered = useMemo(() => complaints.filter((complaint) => {
    const text = `${complaint.id} ${complaint.title} ${complaint.category}`.toLowerCase()
    const matchesQuery = text.includes(query.toLowerCase())
    const matchesStatus = status === 'All' || complaint.status === status
    return matchesQuery && matchesStatus
  }), [complaints, query, status])

  return (
    <>
      <SectionHeader eyebrow="My complaints" title="Complaint dashboard" description="Search, filter and review all of your submitted grievances." />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search size={16} className="text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by ID, title or category" className="w-full bg-transparent text-sm text-slate-700 outline-none" />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <option>All</option>
            <option>Pending</option>
            <option>Assigned</option>
            <option>In Progress</option>
            <option>Under Review</option>
            <option>Resolved</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <th className="pb-3 pr-4">Complaint</th>
                <th className="pb-3 pr-4">Department</th>
                <th className="pb-3 pr-4">Date</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((complaint) => (
                <tr key={complaint.id}>
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-slate-900">{complaint.title}</div>
                    <div className="text-xs text-slate-500">{complaint.id}</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{complaint.department}</td>
                  <td className="py-3 pr-4 text-slate-700">{formatDate(complaint.createdAt)}</td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.status} /></td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function TrackComplaint() {
  const complaints = useAppStore((state) => state.complaints)
  const [selectedId, setSelectedId] = useState(complaints[0]?.id ?? '')

  const selectedComplaint = complaints.find((complaint) => complaint.id === selectedId) ?? complaints[0]

  return (
    <>
      <SectionHeader eyebrow="Tracking" title="Track complaint" description="Use the complaint ID or select a case to review its timeline and latest updates." />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.4fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="text-sm font-medium text-slate-700">Complaint ID</label>
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            {complaints.map((complaint) => (
              <option key={complaint.id} value={complaint.id}>{complaint.id}</option>
            ))}
          </select>
          {selectedComplaint ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Current status</div>
              <div className="mt-2 text-xl font-bold text-slate-900">{selectedComplaint.status}</div>
              <div className="mt-4 text-sm text-slate-600">{selectedComplaint.department}</div>
              <div className="mt-1 text-sm text-slate-600">Assigned to {selectedComplaint.assignedOfficer}</div>
            </div>
          ) : null}
        </div>
        {selectedComplaint ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-blue-600">Reference ID</div>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900">{selectedComplaint.id}</h2>
              </div>
              <StatusBadge status={selectedComplaint.status} />
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Title</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{selectedComplaint.title}</div>
                <div className="mt-4 text-sm leading-7 text-slate-600">{selectedComplaint.description}</div>
              </div>
              <div className="space-y-4 text-sm text-slate-600">
                <div><span className="font-semibold text-slate-900">Category:</span> {selectedComplaint.category}</div>
                <div><span className="font-semibold text-slate-900">Department:</span> {selectedComplaint.department}</div>
                <div><span className="font-semibold text-slate-900">Location:</span> {selectedComplaint.city}, {selectedComplaint.state}</div>
                <div><span className="font-semibold text-slate-900">Last updated:</span> {formatDate(selectedComplaint.lastUpdated)}</div>
              </div>
            </div>
            <div className="mt-8">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Timeline</div>
              <div className="mt-4 space-y-4">
                {selectedComplaint.remarks.map((remark, index) => (
                  <div key={`${selectedComplaint.id}-${index}`} className="flex gap-3">
                    <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-600"><MessageSquareText size={14} /></div>
                    <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{remark}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

function CitizenNotifications() {
  const notifications = useAppStore((state) => state.notifications)
  const markNotificationRead = useAppStore((state) => state.markNotificationRead)
  const markAllNotificationsRead = useAppStore((state) => state.markAllNotificationsRead)

  return (
    <>
      <SectionHeader eyebrow="Notifications" title="Updates and alerts" description="Stay informed about changes, assignments and decisions related to your complaints." action={<button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700" onClick={markAllNotificationsRead}>Mark all as read</button>} />
      <div className="space-y-4">
        {notifications.map((item) => (
          <div key={item.id} className={`rounded-2xl border p-4 shadow-sm ${item.read ? 'border-slate-200 bg-white' : 'border-blue-200 bg-blue-50'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.type}</div>
                <div className="mt-2 text-base font-semibold text-slate-800">{item.message}</div>
                <div className="mt-2 text-xs text-slate-500">{formatDate(item.createdAt)}</div>
              </div>
              {!item.read ? (
                <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700" onClick={() => markNotificationRead(item.id)}>Mark read</button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function CitizenProfile() {
  const session = useAppStore((state) => state.session)
  return (
    <>
      <SectionHeader eyebrow="Profile" title="My profile" description="Review and update your personal and contact information." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-xl font-black text-navy">{session?.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <div className="text-2xl font-black tracking-[-0.04em] text-slate-900">{session?.name}</div>
              <div className="text-sm text-slate-500">Citizen · Gurugram</div>
            </div>
          </div>
          <div className="mt-6 space-y-4 text-sm text-slate-600">
            <div><span className="font-semibold text-slate-900">Email:</span> {session?.email}</div>
            <div><span className="font-semibold text-slate-900">Phone:</span> +91 9876543210</div>
            <div><span className="font-semibold text-slate-900">Address:</span> Sector 14, Gurugram, Haryana</div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Full name</label>
              <input defaultValue={session?.name} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Mobile number</label>
              <input defaultValue="+91 9876543210" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Address</label>
              <input defaultValue="Sector 14, Gurugram, Haryana" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">State</label>
              <input defaultValue="Haryana" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">District</label>
              <input defaultValue="Gurugram" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            </div>
          </div>
          <button className="mt-6 rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white">Save changes</button>
        </div>
      </div>
    </>
  )
}

function OfficerOverview() {
  const complaints = useAppStore((state) => state.complaints)
  const session = useAppStore((state) => state.session)
  const officerComplaints = complaints.filter((complaint) => complaint.assignedOfficer === session?.name)

  const stats = [
    { label: 'Assigned complaints', value: String(officerComplaints.length), note: 'Current load', icon: ClipboardCheck, tone: 'blue' },
    { label: 'Pending', value: String(officerComplaints.filter((item) => item.status === 'Pending').length), note: 'Awaiting review', icon: Gauge, tone: 'amber' },
    { label: 'In progress', value: String(officerComplaints.filter((item) => item.status === 'In Progress').length), note: 'Active cases', icon: TrendingUp, tone: 'violet' },
    { label: 'Resolved', value: String(officerComplaints.filter((item) => item.status === 'Resolved').length), note: 'Completed', icon: CheckCircle2, tone: 'green' },
  ]

  const chartData = [
    { name: 'Assigned', value: officerComplaints.length },
    { name: 'Pending', value: officerComplaints.filter((item) => item.status === 'Pending').length },
    { name: 'In progress', value: officerComplaints.filter((item) => item.status === 'In Progress').length },
    { name: 'Resolved', value: officerComplaints.filter((item) => item.status === 'Resolved').length },
  ]

  return (
    <>
      <SectionHeader eyebrow="Officer console" title="Good morning, Priya" description="Review the operational load and track assignments across your department." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{stats.map((item) => <StatCard key={item.label} {...item} />)}</div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Complaint trends</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#2563EB" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Priority distribution</h2>
          <div className="space-y-4">
            {['High', 'Medium', 'Low'].map((level) => {
              const value = officerComplaints.filter((item) => item.priority === level).length
              return (
                <div key={level}>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-600"><span>{level}</span><span>{value}</span></div>
                  <div className="h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-500" style={{ width: `${(value / Math.max(1, officerComplaints.length)) * 100}%` }} /></div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

function OfficerAssignments() {
  const complaints = useAppStore((state) => state.complaints)
  const session = useAppStore((state) => state.session)
  const updateComplaintStatus = useAppStore((state) => state.updateComplaintStatus)
  const filtered = complaints.filter((complaint) => complaint.assignedOfficer === session?.name)

  return (
    <>
      <SectionHeader eyebrow="Assigned complaints" title="Investigation queue" description="Review assigned grievances, update statuses and capture remarks." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <th className="pb-3 pr-4">Complaint</th>
                <th className="pb-3 pr-4">Category</th>
                <th className="pb-3 pr-4">Location</th>
                <th className="pb-3 pr-4">Priority</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((complaint) => (
                <tr key={complaint.id}>
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-slate-900">{complaint.title}</div>
                    <div className="text-xs text-slate-500">{complaint.id}</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{complaint.category}</td>
                  <td className="py-3 pr-4 text-slate-700">{complaint.city}</td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.priority} /></td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.status} /></td>
                  <td className="py-3">
                    <select defaultValue={complaint.status} onChange={(event) => updateComplaintStatus(complaint.id, event.target.value as ComplaintStatus, session?.name)} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                      <option>Pending</option>
                      <option>Assigned</option>
                      <option>In Progress</option>
                      <option>Under Review</option>
                      <option>Resolved</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function DepartmentComplaints() {
  return (
    <>
      <SectionHeader eyebrow="Department view" title="Department complaints" description="Monitor complaint volumes and review all issues waiting in your department queue." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          {['Pending review', 'Assigned', 'Resolved'].map((value) => (
            <div key={value} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{value}</div>
              <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-900">{value === 'Pending review' ? '32' : value === 'Assigned' ? '76' : '140'}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function DuplicateReview() {
  const complaints = useAppStore((state) => state.complaints)
  const duplicates = complaints.filter((complaint) => complaint.ai.duplicateWarning.toLowerCase().includes('similar'))

  return (
    <>
      <SectionHeader eyebrow="Duplicate review" title="Possible duplicate submissions" description="These complaints require manual review to confirm whether they are the same incident or separate cases." />
      <div className="space-y-4">
        {duplicates.map((complaint) => (
          <div key={complaint.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{complaint.id}</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{complaint.title}</div>
              </div>
              <div className="flex gap-2">
                <button className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">Link complaint</button>
                <button className="rounded-xl bg-navy px-3 py-2 text-sm font-medium text-white">Mark separate</button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm text-slate-600">
              <div><span className="font-semibold text-slate-900">Similarity:</span> {complaint.ai.confidence}%</div>
              <div><span className="font-semibold text-slate-900">Image risk:</span> {complaint.ai.imageRisk}%</div>
              <div><span className="font-semibold text-slate-900">Location:</span> {complaint.city}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function SuspiciousReview() {
  const complaints = useAppStore((state) => state.complaints)
  const suspicious = complaints.filter((complaint) => complaint.riskScore > 20)

  return (
    <>
      <SectionHeader eyebrow="Suspicious submissions" title="Flagged complaints requiring review" description="Review AI signals with human oversight before final verification and action." />
      <div className="space-y-4">
        {suspicious.map((complaint) => (
          <div key={complaint.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-amber-700">{complaint.id}</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{complaint.title}</div>
              </div>
              <div className="flex gap-2">
                <button className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-700">Request evidence</button>
                <button className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white">Verify</button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm text-slate-600">
              <div><span className="font-semibold text-slate-900">Risk score:</span> {complaint.riskScore}</div>
              <div><span className="font-semibold text-slate-900">AI signal:</span> {complaint.ai.predictedCategory}</div>
              <div><span className="font-semibold text-slate-900">Officer:</span> {complaint.assignedOfficer}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function OfficerReports() {
  const data = [
    { name: 'Jan', resolved: 120, pending: 30 },
    { name: 'Feb', resolved: 136, pending: 26 },
    { name: 'Mar', resolved: 148, pending: 29 },
    { name: 'Apr', resolved: 158, pending: 24 },
    { name: 'May', resolved: 172, pending: 18 },
  ]

  return (
    <>
      <SectionHeader eyebrow="Reports" title="Operational performance" description="Weekly and monthly trends across assigned and resolved complaints." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="resolved" fill="#2563EB" radius={[8, 8, 0, 0]} />
              <Bar dataKey="pending" fill="#94A3B8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}

function AdminOverview() {
  const complaints = useAppStore((state) => state.complaints)
  const citizens = useAppStore((state) => state.citizens)
  const officers = useAppStore((state) => state.officers)
  const chartData = [
    { name: 'Jan', total: 160 },
    { name: 'Feb', total: 180 },
    { name: 'Mar', total: 220 },
    { name: 'Apr', total: 260 },
    { name: 'May', total: 300 },
    { name: 'Jun', total: 340 },
  ]
  const pieData = [
    { name: 'Pending', value: complaints.filter((item) => item.status === 'Pending').length, color: '#3B82F6' },
    { name: 'In Progress', value: complaints.filter((item) => item.status === 'In Progress').length, color: '#8B5CF6' },
    { name: 'Resolved', value: complaints.filter((item) => item.status === 'Resolved').length, color: '#10B981' },
  ]

  const stats = [
    { label: 'Total complaints', value: String(complaints.length), note: 'Across all districts', icon: FileText, tone: 'blue' },
    { label: 'Citizens', value: String(citizens.length), note: 'Registered users', icon: Users, tone: 'violet' },
    { label: 'Officers', value: String(officers.length), note: 'Available staff', icon: ShieldCheck, tone: 'green' },
    { label: 'Pending', value: String(complaints.filter((item) => item.status !== 'Resolved').length), note: 'Open cases', icon: AlertTriangle, tone: 'amber' },
  ]

  return (
    <>
      <SectionHeader eyebrow="Platform overview" title="Platform overview" description="Monitor compliance, grievance performance and service delivery across the district." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{stats.map((item) => <StatCard key={item.label} {...item} />)}</div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Monthly trends</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="total" fill="#163A5F" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Complaint distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={52} outerRadius={80} paddingAngle={3}>
                  {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  )
}

function AdminMonitoring() {
  return (
    <>
      <SectionHeader eyebrow="AI monitoring" title="AI monitoring" description="Review model performance, duplicate detection and suspicious-content classification." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Image classification', '98%', 'Operational', 'blue'],
          ['Duplicate detection', '94%', 'Operational', 'violet'],
          ['Image forensics', '89%', 'Needs review', 'amber'],
          ['Department routing', '99%', 'Operational', 'green'],
        ].map(([label, value, status, tone]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">{label}</div>
              <Pill className={tone === 'green' ? 'bg-emerald-100 text-emerald-700' : tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-blue-700'}>{status}</Pill>
            </div>
            <div className="text-3xl font-black tracking-[-0.05em] text-slate-900">{value}</div>
          </div>
        ))}
      </div>
    </>
  )
}

function AdminAllComplaints() {
  const complaints = useAppStore((state) => state.complaints)
  return (
    <>
      <SectionHeader eyebrow="All complaints" title="All complaints" description="Full districtwide oversight across complaint creation, status updates and department ownership." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <th className="pb-3 pr-4">Complaint</th>
                <th className="pb-3 pr-4">Citizen</th>
                <th className="pb-3 pr-4">Department</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3">Assigned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {complaints.map((complaint) => (
                <tr key={complaint.id}>
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-slate-900">{complaint.title}</div>
                    <div className="text-xs text-slate-500">{complaint.id}</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{complaint.citizenName}</td>
                  <td className="py-3 pr-4 text-slate-700">{complaint.department}</td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.status} /></td>
                  <td className="py-3 text-slate-700">{complaint.assignedOfficer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function FraudReview() {
  return (
    <>
      <SectionHeader eyebrow="Fraud review queue" title="Fraud and risk review" description="View suspicious uploads, risk indicators and verification outcomes before final action." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          {['Synthetic image pattern detected', 'Duplicate metadata mismatch', 'Multiple geolocation entries found'].map((entry) => (
            <div key={entry} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-slate-800">{entry}</div>
              <div className="mt-2 text-xs text-slate-600">Requires evidence verification and human review.</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function CitizenManagement() {
  const citizens = useAppStore((state) => state.citizens)
  return (
    <>
      <SectionHeader eyebrow="Citizens" title="Citizen management" description="Search residents, review their complaint history and verify account status." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              <th className="pb-3 pr-4">Citizen</th>
              <th className="pb-3 pr-4">Email</th>
              <th className="pb-3 pr-4">District</th>
              <th className="pb-3 pr-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {citizens.map((citizen) => (
              <tr key={citizen.id}>
                <td className="py-3 pr-4"><div className="font-semibold text-slate-900">{citizen.name}</div></td>
                <td className="py-3 pr-4 text-slate-700">{citizen.email}</td>
                <td className="py-3 pr-4 text-slate-700">{citizen.district}</td>
                <td className="py-3 pr-4"><StatusBadge status={citizen.active ? 'Resolved' : 'Pending'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function OfficerManagement() {
  const officers = useAppStore((state) => state.officers)
  return (
    <>
      <SectionHeader eyebrow="Officers" title="Officer management" description="Manage officer assignments, workloads and department jurisdiction visibility." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              <th className="pb-3 pr-4">Officer</th>
              <th className="pb-3 pr-4">Department</th>
              <th className="pb-3 pr-4">Jurisdiction</th>
              <th className="pb-3 pr-4">Workload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {officers.map((officer) => (
              <tr key={officer.id}>
                <td className="py-3 pr-4"><div className="font-semibold text-slate-900">{officer.name}</div></td>
                <td className="py-3 pr-4 text-slate-700">{officer.department}</td>
                <td className="py-3 pr-4 text-slate-700">{officer.jurisdiction}</td>
                <td className="py-3 pr-4 text-slate-700">{officer.workload} cases</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function DepartmentManagement() {
  const departments = useAppStore((state) => state.departments)
  return (
    <>
      <SectionHeader eyebrow="Departments" title="Department management" description="Review department health, response rates and complaint load." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {departments.map((department) => (
          <div key={department.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-slate-900">{department.name}</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{department.code}</div>
              </div>
              <Pill className="bg-emerald-100 text-emerald-700">Active</Pill>
            </div>
            <div className="mt-4 text-3xl font-black tracking-[-0.05em] text-slate-900">{department.resolutionRate}%</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${department.resolutionRate}%` }} /></div>
          </div>
        ))}
      </div>
    </>
  )
}

function AdminReports() {
  return (
    <>
      <SectionHeader eyebrow="Analytics" title="Analytics and reports" description="Track performance, trends and resolution dashboards for all departments." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[{ name: 'Municipal', value: 78 }, { name: 'Roads', value: 71 }, { name: 'Electrical', value: 68 }, { name: 'Water', value: 62 }]}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563EB" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}

function LocationMap({ lat, lng, onSelect }: { lat: number; lng: number; onSelect: (latitude: number, longitude: number) => void }) {
  function MapPicker() {
    useMapEvents({
      click(event) {
        onSelect(event.latlng.lat, event.latlng.lng)
      },
    })
    return null
  }

  return (
    <MapContainer center={[lat, lng]} zoom={13} scrollWheelZoom className="h-full w-full">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
      <MapPicker />
      <Marker position={[lat, lng]} />
    </MapContainer>
  )
}

export default App
