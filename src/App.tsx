import { zodResolver } from '@hookform/resolvers/zod'
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
import { Fragment, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
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
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAppStore, type Complaint, type ComplaintStatus, type Role } from './store/useAppStore'
import { authService } from './services/auth.service'
import { complaintService } from './services/complaint.service'
import { departmentService } from './services/department.service'
import { categoryService } from './services/category.service'
import { officerService } from './services/officer.service'
import { adminService } from './services/admin.service'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { downloadCsv } from './utils/csv'
import { LocationMap } from './components/maps/LocationMap'
import { Pill, SectionHeader, StatCard, StatusBadge } from './components/common/PortalUI'

const navConfig = {
  citizen: [
    { label: 'Overview', to: '/citizen/overview', icon: LayoutDashboard },
    { label: 'Submit Complaint', to: '/citizen/submit', icon: Plus },
    { label: 'My Complaints', to: '/citizen/complaints', icon: FileText },
    { label: 'Track Complaint', to: '/citizen/track', icon: MapPin },
    { label: 'Notifications', to: '/citizen/notifications', icon: Bell },
    { label: 'My Profile', to: '/citizen/profile', icon: User },
    { label: 'Help & Support', to: '/citizen/help', icon: MessageSquareText },
  ],
  officer: [
    { label: 'Overview', to: '/officer/overview', icon: LayoutDashboard },
    { label: 'Assigned Complaints', to: '/officer/assigned', icon: ClipboardCheck },
    { label: 'Department Complaints', to: '/officer/department', icon: FileText },
    { label: 'Duplicate Complaints', to: '/officer/duplicates', icon: AlertTriangle },
    { label: 'Suspicious Submissions', to: '/officer/suspicious', icon: ShieldCheck },
    { label: 'Reports', to: '/officer/reports', icon: TrendingUp },
    { label: 'Profile', to: '/officer/profile', icon: User },
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
    { label: 'Categories', to: '/admin/categories', icon: FileText },
    { label: 'SLA Management', to: '/admin/sla', icon: Gauge },
    { label: 'Analytics & Reports', to: '/admin/reports', icon: TrendingUp },
    { label: 'Audit Logs', to: '/admin/audit-logs', icon: ClipboardCheck },
    { label: 'Settings', to: '/admin/settings', icon: Gauge },
    { label: 'Profile', to: '/admin/profile', icon: User },
  ],
} as const

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
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode.'),
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
        <Route path="/register" element={session ? <Navigate to={`/${session.role}`} replace /> : <RegisterPage />} />
        <Route path="/citizen/*" element={<ProtectedRoute role="citizen"><DashboardLayout role="citizen" /></ProtectedRoute>} />
        <Route path="/officer/*" element={<ProtectedRoute role="officer"><DashboardLayout role="officer" /></ProtectedRoute>} />
        <Route path="/admin/*" element={<ProtectedRoute role="admin"><DashboardLayout role="admin" /></ProtectedRoute>} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-4">
        <div id="toast-root" />
      </div>
    </>
  )
}

function LandingPage() {
  const navigate = useNavigate()
  const complaints = useAppStore((state) => state.complaints)
  const resolvedCount = complaints.filter((complaint) => complaint.status === 'Resolved').length

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
          <button className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white shadow-soft" onClick={() => navigate('/register')}>Register</button>
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
                Demo Service Snapshot
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
                  <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{complaints.length}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Resolved</div>
                  <div className="mt-2 text-3xl font-bold tracking-tight text-emerald-600">{resolvedCount}</div>
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
            {[
              [String(complaints.length), 'Complaints submitted'],
              [String(resolvedCount), 'Marked resolved'],
              [`${complaints.length ? Math.round((resolvedCount / complaints.length) * 100) : 0}%`, 'Resolution rate'],
              ['Demo', 'Sample records'],
            ].map(([value, label]) => (
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
  const [form, setForm] = useState({ email: 'citizen@example.com', password: 'Demo@123' })
  const [error, setError] = useState('')

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const user = authService.login(form.email, form.password)
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
            <p className="mt-5 text-center text-sm text-slate-500">New to Nagrik Setu? <button onClick={() => navigate('/register')} className="font-semibold text-blue-600">Create a citizen account</button></p>
          </div>
        </div>
      </div>
    </div>
  )
}

function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (values.password !== values.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    const result = authService.registerCitizen(values.name, values.email, values.password)
    if (!result.user) {
      setError(result.error ?? 'Unable to create the account.')
      return
    }
    toast.success('Demo citizen account created.')
    navigate('/citizen/overview', { replace: true })
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Citizen registration · Demo</div>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-900">Create an account</h1>
        <p className="mt-2 text-sm text-slate-500">This account is stored locally in this browser for demonstration only.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Full name
            <input required minLength={2} value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Email
            <input required type="email" value={values.email} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Password
            <input required minLength={8} type="password" value={values.password} onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Confirm password
            <input required minLength={8} type="password" value={values.confirmPassword} onChange={(event) => setValues((current) => ({ ...current, confirmPassword: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
          </label>
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white">Create demo account</button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">Already registered? <button onClick={() => navigate('/login')} className="font-semibold text-blue-600">Sign in</button></p>
      </div>
    </div>
  )
}

function DashboardLayout({ role }: { role: Role }) {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAppStore((state) => state.logout)
  const addAuditEvent = useAppStore((state) => state.addAuditEvent)
  const session = useAppStore((state) => state.session)
  const notifications = useAppStore((state) => state.notifications)
  const [mobileOpen, setMobileOpen] = useState(false)

  const items = navConfig[role]
  const unreadCount = notifications.filter((item) => !item.read && (!item.recipientEmail || item.recipientEmail === session?.email)).length
  const activeLabel = items.find((item) => location.pathname.startsWith(item.to))?.label ?? items[0].label

  const handleLogout = () => {
    addAuditEvent('Logged out')
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        {mobileOpen ? <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setMobileOpen(false)} /> : null}
        <aside className={`${mobileOpen ? 'fixed inset-y-0 left-0 z-40 block w-[280px]' : 'hidden'} max-w-[260px] shrink-0 bg-navy p-4 text-slate-200 lg:relative lg:block lg:w-[260px]`}>
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
                onClick={() => setMobileOpen(false)}
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
              <button aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen} className="rounded-xl border border-slate-200 p-2 lg:hidden" onClick={() => setMobileOpen((open) => !open)}><Menu size={18} /></button>
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
              <button aria-label="Open complaints" onClick={() => navigate(role === 'citizen' ? '/citizen/complaints' : role === 'officer' ? '/officer/assigned' : '/admin/complaints')} className="rounded-xl border border-slate-200 bg-white p-2"><Search size={18} /></button>
              <button aria-label={`Open ${role === 'citizen' ? 'notifications' : 'activity'}`} onClick={() => navigate(role === 'citizen' ? '/citizen/notifications' : role === 'officer' ? '/officer/assigned' : '/admin/audit-logs')} className="relative rounded-xl border border-slate-200 bg-white p-2">
                <Bell size={18} />
                {unreadCount ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unreadCount}</span> : null}
              </button>
            </div>
          </header>

          <div className="px-6 py-8">
            <Routes>
              <Route path="overview" element={role === 'citizen' ? <CitizenOverview /> : role === 'officer' ? <OfficerOverview /> : <AdminOverview />} />
              {role === 'citizen' ? <>
                <Route path="submit" element={<CitizenSubmitComplaint />} />
                <Route path="complaints" element={<CitizenComplaints />} />
                <Route path="track" element={<TrackComplaint />} />
                <Route path="notifications" element={<CitizenNotifications />} />
                <Route path="profile" element={<CitizenProfile />} />
                <Route path="help" element={<HelpSupport />} />
              </> : null}
              {role === 'officer' ? <>
                <Route path="assigned" element={<OfficerAssignments />} />
                <Route path="department" element={<DepartmentComplaints />} />
                <Route path="duplicates" element={<DuplicateReview />} />
                <Route path="suspicious" element={<SuspiciousReview />} />
                <Route path="reports" element={<OfficerReports />} />
                <Route path="profile" element={<CitizenProfile />} />
              </> : null}
              {role === 'admin' ? <>
                <Route path="complaints" element={<AdminAllComplaints />} />
                <Route path="ai" element={<AdminMonitoring />} />
                <Route path="duplicates" element={<DuplicateReview />} />
                <Route path="fraud" element={<FraudReview />} />
                <Route path="citizens" element={<CitizenManagement />} />
                <Route path="officers" element={<OfficerManagement />} />
                <Route path="departments" element={<DepartmentManagement />} />
                <Route path="categories" element={<CategoryManagement />} />
                <Route path="sla" element={<SlaManagement />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="audit-logs" element={<AuditLogs />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="profile" element={<CitizenProfile />} />
              </> : null}
              <Route index element={<Navigate to="overview" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  )
}

function CitizenOverview() {
  const session = useAppStore((state) => state.session)
  const allComplaints = useAppStore((state) => state.complaints)
  const allNotifications = useAppStore((state) => state.notifications)
  const complaints = allComplaints.filter((complaint) => complaint.citizenEmail === session?.email)
  const notifications = allNotifications.filter((item) =>
    item.recipientEmail === session?.email ||
    (!item.recipientEmail && item.complaintId && complaints.some((complaint) => complaint.id === item.complaintId)),
  )
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
  const allCategories = useAppStore((state) => state.categories)
  const categories = allCategories.filter((category) => category.active)
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const defaultValues: ComplaintFormValues = {
    title: '',
    description: '',
    category: categories[0]?.name ?? 'Sanitation',
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
  const selectedCategory = categories.find((category) => category.name === watchedCategory)

  const addImages = async (files: File[]) => {
    const accepted: File[] = []
    for (const file of files) {
      if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
        toast.error(`${file.name}: choose a JPG, PNG, or WEBP image.`)
        continue
      }
      if (file.size > 512 * 1024) {
        toast.error(`${file.name}: image must be 512 KB or smaller for browser demo storage.`)
        continue
      }
      if (accepted.length + imagePreviews.length >= 4) {
        toast.error('You can attach up to 4 images.')
        break
      }
      accepted.push(file)
    }

    const dataUrls = await Promise.all(accepted.map((file) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the selected image.'))
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
      reader.readAsDataURL(file)
    })))
    setImagePreviews((current) => [...current, ...dataUrls].slice(0, 4))
  }

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void addImages(Array.from(event.target.files ?? [])).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Unable to load image files.')
    })
    event.target.value = ''
  }

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Location is not available in this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        form.setValue('latitude', coords.latitude, { shouldValidate: true })
        form.setValue('longitude', coords.longitude, { shouldValidate: true })
        toast.success('Current location captured.')
      },
      (error) => toast.error(error.message || 'Location permission was not granted.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const onSubmit = async (values: ComplaintFormValues) => {
    setIsSubmitting(true)
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 350))
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
        department: selectedCategory?.department ?? 'Municipal Corporation',
        assignedOfficer: 'Priya Sharma',
        citizenName: session?.name ?? 'Citizen User',
        citizenEmail: session?.email ?? 'citizen@example.com',
        images: imagePreviews,
        riskScore: 18,
        ai: {
          predictedCategory: values.category,
          suggestedDepartment: selectedCategory?.department ?? 'Municipal Corporation',
          duplicateWarning: 'No duplicate signal found in local review.',
          confidence: 91,
          imageRisk: 15,
        },
      }

      const created = complaintService.createComplaint(complaint)
      toast.success(`Complaint ${created.id} submitted successfully.`)
      navigate(`/citizen/track?complaint=${encodeURIComponent(created.id)}`)
    } catch (error) {
      toast.error(error instanceof Error ? `Complaint could not be saved: ${error.message}` : 'Complaint could not be saved.')
    } finally {
      setIsSubmitting(false)
    }
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
                <select {...form.register('category', { onChange: (event) => {
                  const category = categories.find((item) => item.name === event.target.value)
                  if (category) form.setValue('severity', category.defaultPriority, { shouldValidate: true })
                } })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                </select>
                {form.formState.errors.category ? <p className="mt-1 text-xs text-red-600">{form.formState.errors.category.message}</p> : null}
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
                <button type="button" onClick={useCurrentLocation} className="text-sm font-semibold text-blue-600">Use my current location</button>
              </div>
              <div className="mt-3 h-64 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <LocationMap lat={form.watch('latitude')} lng={form.watch('longitude')} onSelect={(latitude, longitude) => { form.setValue('latitude', latitude); form.setValue('longitude', longitude) }} />
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Latitude</label>
                  <input type="number" step="any" value={form.watch('latitude')} onChange={(event) => form.setValue('latitude', Number(event.target.value), { shouldValidate: true })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Longitude</label>
                  <input type="number" step="any" value={form.watch('longitude')} onChange={(event) => form.setValue('longitude', Number(event.target.value), { shouldValidate: true })} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Additional remarks</label>
              <textarea {...form.register('remarks')} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" placeholder="Any extra context or latest updates." />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Images</label>
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  void addImages(Array.from(event.dataTransfer.files)).catch((error: unknown) => {
                    toast.error(error instanceof Error ? error.message : 'Unable to load image files.')
                  })
                }}
                className="mt-2 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center"
              >
                <UploadCloud size={28} className="text-blue-600" />
                <p className="mt-3 text-sm font-medium text-slate-700">Drag & drop files here or browse</p>
                <p className="text-xs text-slate-500">JPG, JPEG, PNG and WEBP · Up to 4 images, 512 KB each</p>
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
              <button type="submit" disabled={isSubmitting} className="rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{isSubmitting ? 'Submitting…' : 'Submit grievance'}</button>
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
              <div className="mt-2 font-semibold text-slate-800">{selectedCategory?.department ?? 'Municipal Corporation'}</div>
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
  const session = useAppStore((state) => state.session)
  const allComplaints = useAppStore((state) => state.complaints)
  const complaints = allComplaints.filter((complaint) => complaint.citizenEmail === session?.email)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [category, setCategory] = useState('All')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const pageSize = 5

  const filtered = useMemo(() => complaints.filter((complaint) => {
    const text = `${complaint.id} ${complaint.title} ${complaint.category}`.toLowerCase()
    const matchesQuery = text.includes(query.toLowerCase())
    const matchesStatus = status === 'All' || complaint.status === status
    const matchesCategory = category === 'All' || complaint.category === category
    const complaintDate = complaint.createdAt.slice(0, 10)
    const matchesDate = (!dateFrom || complaintDate >= dateFrom) && (!dateTo || complaintDate <= dateTo)
    return matchesQuery && matchesStatus && matchesCategory && matchesDate
  }).sort((a, b) => sortOrder === 'newest'
    ? b.createdAt.localeCompare(a.createdAt)
    : a.createdAt.localeCompare(b.createdAt)), [complaints, query, status, category, dateFrom, dateTo, sortOrder])
  const categories = [...new Set(complaints.map((complaint) => complaint.category))]
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <>
      <SectionHeader eyebrow="My complaints" title="Complaint dashboard" description="Search, filter and review all of your submitted grievances." />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search size={16} className="text-slate-400" />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search by ID, title or category" className="w-full bg-transparent text-sm text-slate-700 outline-none" />
          </div>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <option>All</option>
            <option>Pending</option>
            <option>Assigned</option>
            <option>In Progress</option>
            <option>Under Review</option>
            <option>Resolved</option>
            <option>Escalated</option>
            <option>Escalated</option>
          </select>
          <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1) }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <option>All</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <input aria-label="Submitted from" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <input aria-label="Submitted to" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <select aria-label="Sort complaints by date" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><option value="newest">Newest</option><option value="oldest">Oldest</option></select>
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600" onClick={() => { setQuery(''); setStatus('All'); setCategory('All'); setDateFrom(''); setDateTo(''); setSortOrder('newest'); setPage(1) }}>Reset</button>
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
                <th className="pb-3 pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map((complaint) => (
                <tr key={complaint.id}>
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-slate-900">{complaint.title}</div>
                    <div className="text-xs text-slate-500">{complaint.id}</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{complaint.department}</td>
                  <td className="py-3 pr-4 text-slate-700">{formatDate(complaint.createdAt)}</td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.status} /></td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.priority} /></td>
                  <td className="py-3 pr-4"><button className="font-semibold text-blue-600" onClick={() => navigate(`/citizen/track?complaint=${encodeURIComponent(complaint.id)}`)}>Track</button></td>
                </tr>
              ))}
              {!pageItems.length ? <tr><td className="py-8 text-center text-slate-500" colSpan={6}>No complaints match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>{filtered.length} complaint{filtered.length === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button>
            <span>Page {Math.min(page, pageCount)} of {pageCount}</span>
            <button disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </>
  )
}

function TrackComplaint() {
  const session = useAppStore((state) => state.session)
  const allComplaints = useAppStore((state) => state.complaints)
  const complaints = allComplaints.filter((complaint) => complaint.citizenEmail === session?.email)
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('complaint') ?? '')
  const selectedId = searchParams.get('complaint') ?? ''
  const selectedComplaint = complaints.find((complaint) => complaint.id.toLowerCase() === selectedId.trim().toLowerCase())

  return (
    <>
      <SectionHeader eyebrow="Tracking" title="Track complaint" description="Use the complaint ID or select a case to review its timeline and latest updates." />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.4fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <form onSubmit={(event) => { event.preventDefault(); setSearchParams({ complaint: query.trim() }) }}>
            <label className="text-sm font-medium text-slate-700" htmlFor="complaint-tracking-id">Complaint ID</label>
            <input id="complaint-tracking-id" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. GRV-2026-000001" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            <button type="submit" className="mt-3 w-full rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">Track complaint</button>
          </form>
          {selectedComplaint ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Current status</div>
              <div className="mt-2 text-xl font-bold text-slate-900">{selectedComplaint.status}</div>
              <div className="mt-4 text-sm text-slate-600">{selectedComplaint.department}</div>
              <div className="mt-1 text-sm text-slate-600">Assigned to {selectedComplaint.assignedOfficer}</div>
            </div>
          ) : selectedId ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">No complaint found for that ID in your account.</div> : null}
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
                {(selectedComplaint.statusHistory?.length
                  ? selectedComplaint.statusHistory
                  : selectedComplaint.remarks.map((message, index) => ({ message, status: selectedComplaint.status, createdAt: index === 0 ? selectedComplaint.createdAt : selectedComplaint.lastUpdated }))
                ).map((entry, index) => (
                  <div key={`${selectedComplaint.id}-${index}`} className="flex gap-3">
                    <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-600"><MessageSquareText size={14} /></div>
                    <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <div>{entry.message}</div>
                      <div className="mt-1 text-xs text-slate-400">{entry.status} · {formatDate(entry.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Reported location</h3>
                <p className="mt-2 text-sm text-slate-600">{selectedComplaint.address}, {selectedComplaint.city}, {selectedComplaint.district}, {selectedComplaint.state} {selectedComplaint.pincode}</p>
                <div className="mt-3 h-56 overflow-hidden rounded-xl border border-slate-200">
                  <LocationMap lat={selectedComplaint.latitude} lng={selectedComplaint.longitude} interactive={false} />
                </div>
              </section>
              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Evidence and review preview</h3>
                {selectedComplaint.images.length ? <div className="mt-3 grid grid-cols-2 gap-2">{selectedComplaint.images.map((image, index) => <img key={`${selectedComplaint.id}-${index}`} src={image} alt={`Evidence ${index + 1}`} className="h-28 w-full rounded-lg object-cover" />)}</div> : <p className="mt-3 text-sm text-slate-500">No evidence images attached.</p>}
                {selectedComplaint.resolutionImages?.length ? <div className="mt-4"><div className="text-xs font-semibold text-slate-600">Resolution evidence</div><div className="mt-2 grid grid-cols-2 gap-2">{selectedComplaint.resolutionImages.map((image, index) => <img key={`${selectedComplaint.id}-resolution-${index}`} src={image} alt={`Resolution evidence ${index + 1}`} className="h-28 w-full rounded-lg object-cover" />)}</div></div> : null}
                <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm">
                  <div className="font-semibold text-slate-800">Simulated AI review · human verification required</div>
                  <div className="mt-2 text-slate-600">Category: {selectedComplaint.ai.predictedCategory} ({selectedComplaint.ai.confidence}% demo confidence)</div>
                  <div className="mt-1 text-slate-600">Risk score: {selectedComplaint.riskScore} · {selectedComplaint.ai.duplicateWarning}</div>
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

function CitizenNotifications() {
  const session = useAppStore((state) => state.session)
  const allComplaints = useAppStore((state) => state.complaints)
  const complaintIds = allComplaints.filter((complaint) => complaint.citizenEmail === session?.email).map((complaint) => complaint.id)
  const allNotifications = useAppStore((state) => state.notifications)
  const notifications = allNotifications.filter((item) => item.recipientEmail === session?.email || (!item.recipientEmail && item.complaintId && complaintIds.includes(item.complaintId)))
  const [filter, setFilter] = useState('All')
  const markNotificationRead = useAppStore((state) => state.markNotificationRead)
  const markAllNotificationsRead = useAppStore((state) => state.markAllNotificationsRead)
  const navigate = useNavigate()

  return (
    <>
      <SectionHeader eyebrow="Notifications" title="Updates and alerts" description="Stay informed about changes, assignments and decisions related to your complaints." action={<div className="flex gap-2"><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option>All</option><option>Unread</option><option>Read</option></select><button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => markAllNotificationsRead(session?.email)}>Mark all as read</button></div>} />
      <div className="space-y-4">
        {notifications.filter((item) => filter === 'All' || (filter === 'Unread' ? !item.read : item.read)).map((item) => (
          <div key={item.id} className={`rounded-2xl border p-4 shadow-sm ${item.read ? 'border-slate-200 bg-white' : 'border-blue-200 bg-blue-50'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.type}</div>
                <div className="mt-2 text-base font-semibold text-slate-800">{item.message}</div>
                <div className="mt-2 text-xs text-slate-500">{formatDate(item.createdAt)}</div>
                {item.complaintId ? <button onClick={() => navigate(`/citizen/track?complaint=${encodeURIComponent(item.complaintId!)}`)} className="mt-3 text-xs font-semibold text-blue-600">View complaint</button> : null}
              </div>
              {!item.read ? (
                <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700" onClick={() => markNotificationRead(item.id)}>Mark read</button>
              ) : null}
            </div>
          </div>
        ))}
        {!notifications.length ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No notifications yet.</div> : null}
      </div>
    </>
  )
}

function CitizenProfile() {
  const session = useAppStore((state) => state.session)
  const citizen = useAppStore((state) => state.citizens.find((item) => item.email === session?.email))
  const officer = useAppStore((state) => state.officers.find((item) => item.email === session?.email))
  const updateProfile = useAppStore((state) => state.updateProfile)
  const defaults = {
    name: citizen?.name ?? session?.name ?? '',
    phone: citizen?.phone ?? officer?.phone ?? '',
    address: citizen?.address ?? officer?.address ?? '',
    state: citizen?.state ?? officer?.state ?? '',
    district: citizen?.district ?? officer?.district ?? '',
    city: citizen?.city ?? officer?.city ?? '',
    pincode: citizen?.pincode ?? officer?.pincode ?? '',
  }
  const [profile, setProfile] = useState(defaults)
  const [editing, setEditing] = useState(false)
  const save = () => {
    if (profile.name.trim().length < 2 || (session?.role === 'citizen' && (!/^\+?[0-9\s-]{8,16}$/.test(profile.phone) || profile.address.trim().length < 5 || !/^\d{6}$/.test(profile.pincode)))) {
      toast.error(session?.role === 'citizen' ? 'Enter a valid name, phone number, address and 6-digit pincode.' : 'Enter a valid name.')
      return
    }
    updateProfile(profile)
    setEditing(false)
    toast.success('Profile updated.')
  }
  return (
    <>
      <SectionHeader eyebrow="Profile" title="My profile" description="Review and update your personal and contact information." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-xl font-black text-navy">{session?.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <div className="text-2xl font-black tracking-[-0.04em] text-slate-900">{session?.name}</div>
              <div className="text-sm text-slate-500">{session?.role} · {profile.city || profile.district}</div>
            </div>
          </div>
          <div className="mt-6 space-y-4 text-sm text-slate-600">
            <div><span className="font-semibold text-slate-900">Email:</span> {session?.email}</div>
            <div><span className="font-semibold text-slate-900">Phone:</span> {profile.phone || 'Not provided'}</div>
            <div><span className="font-semibold text-slate-900">Address:</span> {[profile.address, profile.city, profile.district, profile.state, profile.pincode].filter(Boolean).join(', ') || 'Not provided'}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Full name</label>
              <input disabled={!editing} value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Mobile number</label>
              <input disabled={!editing} value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Address</label>
              <input disabled={!editing} value={profile.address} onChange={(event) => setProfile((current) => ({ ...current, address: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">State</label>
              <input disabled={!editing} value={profile.state} onChange={(event) => setProfile((current) => ({ ...current, state: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">District</label>
              <input disabled={!editing} value={profile.district} onChange={(event) => setProfile((current) => ({ ...current, district: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">City</label>
              <input disabled={!editing} value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Pincode</label>
              <input disabled={!editing} value={profile.pincode} onChange={(event) => setProfile((current) => ({ ...current, pincode: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            {!editing ? <button onClick={() => setEditing(true)} className="rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white">Edit profile</button> : <>
              <button onClick={save} className="rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white">Save changes</button>
              <button onClick={() => { setProfile(defaults); setEditing(false) }} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Cancel</button>
            </>}
          </div>
        </div>
      </div>
    </>
  )
}

function OfficerOverview() {
  const complaints = useAppStore((state) => state.complaints)
  const session = useAppStore((state) => state.session)
  const officerComplaints = complaints.filter((complaint) => complaint.assignedOfficer === session?.name)
  const overdueCount = officerComplaints.filter((complaint) =>
    complaint.status !== 'Resolved' && Date.now() - new Date(complaint.createdAt).getTime() > 72 * 60 * 60 * 1000,
  ).length

  const stats = [
    { label: 'Assigned complaints', value: String(officerComplaints.length), note: 'Current load', icon: ClipboardCheck, tone: 'blue' },
    { label: 'Pending', value: String(officerComplaints.filter((item) => item.status === 'Pending').length), note: 'Awaiting review', icon: Gauge, tone: 'amber' },
    { label: 'In progress', value: String(officerComplaints.filter((item) => item.status === 'In Progress').length), note: 'Active cases', icon: TrendingUp, tone: 'violet' },
    { label: 'Resolved', value: String(officerComplaints.filter((item) => item.status === 'Resolved').length), note: 'Completed', icon: CheckCircle2, tone: 'green' },
    { label: 'Overdue', value: String(overdueCount), note: 'Open over 72 hours', icon: AlertTriangle, tone: 'amber' },
  ]

  const chartData = [
    { name: 'Assigned', value: officerComplaints.length },
    { name: 'Pending', value: officerComplaints.filter((item) => item.status === 'Pending').length },
    { name: 'In progress', value: officerComplaints.filter((item) => item.status === 'In Progress').length },
    { name: 'Resolved', value: officerComplaints.filter((item) => item.status === 'Resolved').length },
  ]

  return (
    <>
      <SectionHeader eyebrow="Officer console" title={`Good morning, ${session?.name ?? 'Officer'}`} description="Review the operational load and track assignments across your department." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{stats.map((item) => <StatCard key={item.label} {...item} />)}</div>
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
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const assigned = complaints.filter((complaint) => complaint.assignedOfficer === session?.name)
  const filtered = assigned.filter((complaint) => {
    const text = `${complaint.id} ${complaint.title} ${complaint.category} ${complaint.city}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (statusFilter === 'All' || complaint.status === statusFilter)
  })
  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <>
      <SectionHeader eyebrow="Assigned complaints" title="Investigation queue" description="Review assigned grievances, update statuses and capture remarks." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"><Search size={16} className="text-slate-400" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search ID, title, category or location" className="w-full bg-transparent text-sm outline-none" /></label>
          <select aria-label="Filter assignments by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{['All', 'Pending', 'Assigned', 'In Progress', 'Under Review', 'Resolved', 'Escalated'].map((item) => <option key={item}>{item}</option>)}</select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <th className="pb-3 pr-4">Complaint</th>
                <th className="pb-3 pr-4">Category</th>
                <th className="pb-3 pr-4">Location</th>
                <th className="pb-3 pr-4">Priority</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Update status</th>
                <th className="pb-3">Investigation note</th>
                <th className="pb-3">Resolution evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map((complaint) => (
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
                    <select value={complaint.status} onChange={(event) => {
                      complaintService.updateComplaintStatus(complaint.id, event.target.value as ComplaintStatus, session?.name)
                      toast.success(`Updated ${complaint.id}.`)
                    }} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                      <option>Pending</option>
                      <option>Assigned</option>
                      <option>In Progress</option>
                      <option>Under Review</option>
                      <option>Resolved</option>
                    </select>
                  </td>
                  <td className="py-3">
                    <form className="flex min-w-56 gap-2" onSubmit={(event) => {
                      event.preventDefault()
                      const note = remarks[complaint.id]?.trim()
                      if (!note) { toast.error('Enter an investigation note first.'); return }
                      complaintService.addRemark(complaint.id, note)
                      setRemarks((current) => ({ ...current, [complaint.id]: '' }))
                      toast.success('Investigation note added.')
                    }}>
                      <input value={remarks[complaint.id] ?? ''} onChange={(event) => setRemarks((current) => ({ ...current, [complaint.id]: event.target.value }))} placeholder="Add a note" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs" />
                      <button type="submit" className="rounded-lg bg-navy px-2 py-1 text-xs font-semibold text-white">Add</button>
                    </form>
                  </td>
                  <td className="py-3">
                    <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={`Upload resolution evidence for ${complaint.id}`} className="max-w-40 text-xs" onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (!file) return
                      if (!/^image\/(png|jpeg|webp)$/i.test(file.type) || file.size > 512 * 1024) {
                        toast.error('Choose a JPG, PNG or WEBP image under 512 KB.')
                        return
                      }
                      const reader = new FileReader()
                      reader.onload = () => {
                        if (typeof reader.result !== 'string') {
                          toast.error('Unable to read the selected image.')
                          return
                        }
                        try {
                          complaintService.addResolutionImage(complaint.id, reader.result)
                          toast.success('Resolution evidence saved.')
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : 'Resolution evidence could not be saved.')
                        }
                      }
                      reader.onerror = () => toast.error('Unable to read the selected image.')
                      reader.readAsDataURL(file)
                    }} />
                    {complaint.resolutionImages?.length ? <div className="mt-2 text-xs text-emerald-700">{complaint.resolutionImages.length} resolution image(s)</div> : null}
                  </td>
                </tr>
              ))}
              {!pageItems.length ? <tr><td colSpan={8} className="py-8 text-center text-slate-500">No assignments match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600"><span>{filtered.length} assignments</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><span>Page {Math.min(page, pageCount)} of {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
      </div>
    </>
  )
}

function DepartmentComplaints() {
  const session = useAppStore((state) => state.session)
  const complaints = useAppStore((state) => state.complaints)
  const officer = useAppStore((state) => state.officers.find((item) => item.email === session?.email))
  const departmentComplaints = complaints.filter((item) => item.department === officer?.department)
  return (
    <>
      <SectionHeader eyebrow="Department view" title="Department complaints" description="Monitor complaint volumes and review all issues waiting in your department queue." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          {['Pending review', 'Assigned', 'Resolved'].map((value) => (
            <div key={value} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{value}</div>
              <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-900">{departmentComplaints.filter((item) => value === 'Pending review' ? item.status === 'Pending' : item.status === value).length}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-3">
          {departmentComplaints.map((item) => <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="font-semibold text-slate-900">{item.title}</div><div className="text-xs text-slate-500">{item.id} · {item.city}</div></div>
            <StatusBadge status={item.status} />
          </div>)}
          {!departmentComplaints.length ? <p className="py-4 text-sm text-slate-500">No complaints are currently associated with your department.</p> : null}
        </div>
      </div>
    </>
  )
}

function DuplicateReview() {
  const complaints = useAppStore((state) => state.complaints)
  const duplicates = complaints.filter((complaint) => complaint.ai.duplicateWarning.toLowerCase().includes('similar'))
  const [candidateById, setCandidateById] = useState<Record<string, string>>({})
  const distanceKm = (first: Complaint, second: Complaint) => {
    const radians = (value: number) => value * Math.PI / 180
    const dLat = radians(second.latitude - first.latitude)
    const dLng = radians(second.longitude - first.longitude)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(dLng / 2) ** 2
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  return (
    <>
      <SectionHeader eyebrow="Duplicate review" title="Possible duplicate submissions" description="These complaints require manual review to confirm whether they are the same incident or separate cases." />
      <div className="space-y-4">
        {duplicates.map((complaint) => {
          const candidates = complaints
            .filter((other) => other.id !== complaint.id)
            .map((other) => ({ complaint: other, distance: distanceKm(complaint, other) }))
            .sort((a, b) => a.distance - b.distance)
          const selectedId = candidateById[complaint.id] ?? candidates[0]?.complaint.id ?? ''
          const selected = candidates.find((candidate) => candidate.complaint.id === selectedId)
          return (
          <div key={complaint.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{complaint.id}</div>
                <div className="mt-2 text-lg font-bold text-slate-900">{complaint.title}</div>
                {complaint.duplicateDecision ? <div className="mt-1 text-xs text-slate-500">Decision recorded: {complaint.duplicateDecision}{complaint.duplicateGroupId ? ` · group ${complaint.duplicateGroupId.slice(0, 8)}` : ''}</div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <select aria-label={`Potential duplicate for ${complaint.id}`} value={selectedId} onChange={(event) => setCandidateById((current) => ({ ...current, [complaint.id]: event.target.value }))} className="max-w-52 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  {candidates.map(({ complaint: other }) => <option key={other.id} value={other.id}>{other.id} · {other.title.slice(0, 28)}</option>)}
                </select>
                <button disabled={!selected} onClick={() => {
                  try { complaintService.reviewDuplicate(complaint.id, 'linked', selectedId); toast.success('Complaints linked into the same review group.') }
                  catch (error) { toast.error(error instanceof Error ? error.message : 'Could not link the complaints.') }
                }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40">Link complaint</button>
                <button onClick={() => { complaintService.reviewDuplicate(complaint.id, 'separate'); toast.success('Separate-issue decision recorded.') }} className="rounded-xl bg-navy px-3 py-2 text-sm font-medium text-white">Mark separate</button>
                <button onClick={() => { complaintService.reviewDuplicate(complaint.id, 'manual-review'); toast.success('Forwarded for manual review.') }} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">Manual review</button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm text-slate-600">
              <div><span className="font-semibold text-slate-900">Similarity:</span> {complaint.ai.confidence}% (simulated)</div>
              <div><span className="font-semibold text-slate-900">Image risk:</span> {complaint.ai.imageRisk}%</div>
              <div><span className="font-semibold text-slate-900">Location:</span> {complaint.city}{selected ? ` · ${selected.distance.toFixed(1)} km to ${selected.complaint.id}` : ''}</div>
            </div>
          </div>
          )
        })}
        {!duplicates.length ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No potential duplicate signals are present in the demo data.</div> : null}
      </div>
    </>
  )
}

function SuspiciousReview() {
  const complaints = useAppStore((state) => state.complaints)
  const session = useAppStore((state) => state.session)
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
                <button onClick={() => { complaintService.addRemark(complaint.id, 'Additional evidence requested by the reviewing officer.'); toast.success('Evidence request added to the complaint timeline.') }} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-700">Request evidence</button>
                <button onClick={() => { complaintService.updateComplaintStatus(complaint.id, 'Under Review', session?.name); toast.success('Complaint moved to human review.') }} className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white">Send for review</button>
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
  const complaints = useAppStore((state) => state.complaints)
  const session = useAppStore((state) => state.session)
  const assigned = complaints.filter((item) => item.assignedOfficer === session?.name)
  const data = ['Pending', 'Assigned', 'In Progress', 'Under Review', 'Resolved'].map((status) => ({
    name: status,
    count: assigned.filter((item) => item.status === status).length,
  }))

  return (
    <>
      <SectionHeader eyebrow="Reports" title="Operational performance" description="Complaint-status distribution for your current assignments." action={<button onClick={() => downloadCsv('officer-complaints.csv', assigned.map((item) => ({ id: item.id, title: item.title, category: item.category, status: item.status, priority: item.priority, department: item.department })))} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">Export CSV</button>} />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#2563EB" radius={[8, 8, 0, 0]} />
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
  const chartData = Array.from({ length: 6 }, (_, index) => {
    const month = new Date()
    month.setDate(1)
    month.setMonth(month.getMonth() - (5 - index))
    return {
      name: month.toLocaleString('en-IN', { month: 'short' }),
      total: complaints.filter((item) => {
        const created = new Date(item.createdAt)
        return created.getMonth() === month.getMonth() && created.getFullYear() === month.getFullYear()
      }).length,
    }
  })
  const pieData = [
    { name: 'Pending', value: complaints.filter((item) => item.status === 'Pending').length, color: '#3B82F6' },
    { name: 'Assigned', value: complaints.filter((item) => item.status === 'Assigned').length, color: '#0EA5E9' },
    { name: 'In Progress', value: complaints.filter((item) => item.status === 'In Progress').length, color: '#8B5CF6' },
    { name: 'Under Review', value: complaints.filter((item) => item.status === 'Under Review').length, color: '#F59E0B' },
    { name: 'Resolved', value: complaints.filter((item) => item.status === 'Resolved').length, color: '#10B981' },
    { name: 'Escalated', value: complaints.filter((item) => item.status === 'Escalated').length, color: '#EF4444' },
  ]

  const stats = [
    { label: 'Total complaints', value: String(complaints.length), note: 'Across all districts', icon: FileText, tone: 'blue' },
    { label: 'Citizens', value: String(citizens.length), note: 'Registered users', icon: Users, tone: 'violet' },
    { label: 'Officers', value: String(officers.filter((item) => item.active).length), note: 'Available staff', icon: ShieldCheck, tone: 'green' },
    { label: 'Pending', value: String(complaints.filter((item) => item.status === 'Pending').length), note: 'Awaiting review', icon: Gauge, tone: 'amber' },
    { label: 'Resolved', value: String(complaints.filter((item) => item.status === 'Resolved').length), note: 'Closed cases', icon: CheckCircle2, tone: 'green' },
    { label: 'Suspicious', value: String(complaints.filter((item) => item.riskScore > 20).length), note: 'Needs human review', icon: AlertTriangle, tone: 'amber' },
  ]

  return (
    <>
      <SectionHeader eyebrow="Platform overview" title="Platform overview" description="Monitor compliance, grievance performance and service delivery across the district." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{stats.map((item) => <StatCard key={item.label} {...item} />)}</div>
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
      <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">All model metrics and outputs shown here are simulated demonstration data, not production AI analysis.</p>
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
  const departments = useAppStore((state) => state.departments)
  const officers = useAppStore((state) => state.officers)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(1)
  const filtered = complaints.filter((complaint) => {
    const text = `${complaint.id} ${complaint.title} ${complaint.citizenName} ${complaint.department}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (status === 'All' || complaint.status === status)
  }).sort((a, b) => sortOrder === 'newest'
    ? b.createdAt.localeCompare(a.createdAt)
    : a.createdAt.localeCompare(b.createdAt))
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)
  return (
    <>
      <SectionHeader eyebrow="All complaints" title="All complaints" description="Full districtwide oversight across complaint creation, status updates and department ownership." action={<button onClick={() => downloadCsv('all-complaints.csv', filtered.map((item) => ({ id: item.id, title: item.title, citizen: item.citizenName, category: item.category, department: item.department, officer: item.assignedOfficer, status: item.status, priority: item.priority, submitted: item.createdAt })))} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">Export CSV</button>} />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search size={16} className="text-slate-400" />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search ID, title, citizen or department" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
            {['All', 'Pending', 'Assigned', 'In Progress', 'Under Review', 'Resolved', 'Escalated'].map((item) => <option key={item}>{item}</option>)}
          </select>
          <select aria-label="Sort complaints by date" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                <th className="pb-3 pr-4">Complaint</th>
                <th className="pb-3 pr-4">Citizen</th>
                <th className="pb-3 pr-4">Department</th>
                <th className="pb-3 pr-4">Officer</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3">Update status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map((complaint) => (
                <tr key={complaint.id}>
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-slate-900">{complaint.title}</div>
                    <div className="text-xs text-slate-500">{complaint.id}</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{complaint.citizenName}</td>
                  <td className="py-3 pr-4">
                    <select aria-label={`Assign department for ${complaint.id}`} value={complaint.department} onChange={(event) => {
                      complaintService.assignComplaint(complaint.id, event.target.value)
                      toast.success('Complaint routing updated.')
                    }} className="max-w-40 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                      {departments.map((item) => <option key={item.id}>{item.name}</option>)}
                    </select>
                  </td>
                  <td className="py-3 pr-4">
                    <select aria-label={`Assign officer for ${complaint.id}`} value={complaint.assignedOfficer} onChange={(event) => {
                      complaintService.assignComplaint(complaint.id, complaint.department, event.target.value)
                      toast.success('Officer assignment updated.')
                    }} className="max-w-40 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                      <option value="Unassigned">Unassigned</option>
                      {officers.filter((item) => item.active && item.department === complaint.department).map((item) => <option key={item.id}>{item.name}</option>)}
                      {!officers.some((item) => item.name === complaint.assignedOfficer) && complaint.assignedOfficer !== 'Unassigned' ? <option>{complaint.assignedOfficer}</option> : null}
                    </select>
                  </td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.status} /></td>
                  <td className="py-3">
                    <select aria-label={`Update status for ${complaint.id}`} value={complaint.status} onChange={(event) => {
                      complaintService.updateComplaintStatus(complaint.id, event.target.value as ComplaintStatus)
                      toast.success(`Updated ${complaint.id}.`)
                    }} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                      {['Pending', 'Assigned', 'In Progress', 'Under Review', 'Resolved', 'Escalated'].map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {!pageItems.length ? <tr><td colSpan={6} className="py-8 text-center text-slate-500">No complaints match this search.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>{filtered.length} complaints</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button>
            <span>Page {Math.min(page, pageCount)} of {pageCount}</span>
            <button disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </>
  )
}

function FraudReview() {
  const complaints = useAppStore((state) => state.complaints)
  const flagged = complaints.filter((complaint) => complaint.riskScore > 20 || complaint.ai.imageRisk > 40)
  return (
    <>
      <SectionHeader eyebrow="Fraud review queue" title="Fraud and risk review" description="View suspicious uploads, risk indicators and verification outcomes before final action." />
      <div className="space-y-4">
        {flagged.map((complaint) => <div key={complaint.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="text-xs font-bold uppercase tracking-wider text-amber-700">{complaint.id} · risk {complaint.riskScore}/100</div><h2 className="mt-2 font-bold text-slate-900">{complaint.title}</h2><p className="mt-1 text-sm text-slate-600">{complaint.ai.duplicateWarning}</p></div>
            <div className="flex gap-2">
              <button onClick={() => { complaintService.addRemark(complaint.id, 'Senior review requested for flagged submission.'); toast.success('Forwarded for manual investigation.') }} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800">Forward for investigation</button>
              <button onClick={() => { complaintService.addRemark(complaint.id, 'Risk review completed; complaint verified by administrator.'); toast.success('Verification decision recorded.') }} className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-medium text-white">Verify</button>
            </div>
          </div>
          {complaint.images.length ? <div className="mt-4 flex gap-3">{complaint.images.map((image, index) => <img key={`${complaint.id}-${index}`} src={image} alt={`Evidence for ${complaint.id}`} className="h-20 w-20 rounded-lg object-cover" />)}</div> : null}
          <p className="mt-3 text-xs text-slate-500">Automated signals are simulated and never automatically reject a complaint.</p>
        </div>)}
        {!flagged.length ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No complaints are currently flagged for review.</div> : null}
      </div>
    </>
  )
}

function CitizenManagement() {
  const citizens = useAppStore((state) => state.citizens)
  const complaints = useAppStore((state) => state.complaints)
  const setCitizenActive = useAppStore((state) => state.setCitizenActive)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const filtered = citizens.filter((citizen) => `${citizen.name} ${citizen.email} ${citizen.district}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <>
      <SectionHeader eyebrow="Citizens" title="Citizen management" description="Search residents, review their complaint history and verify account status." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Search size={16} className="text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search citizens by name, email or district" className="w-full bg-transparent text-sm outline-none" />
        </label>
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              <th className="pb-3 pr-4">Citizen</th>
              <th className="pb-3 pr-4">Email</th>
              <th className="pb-3 pr-4">District</th>
              <th className="pb-3 pr-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((citizen) => (
              <Fragment key={citizen.id}>
              <tr>
                <td className="py-3 pr-4"><div className="font-semibold text-slate-900">{citizen.name}</div></td>
                <td className="py-3 pr-4 text-slate-700">{citizen.email}</td>
                <td className="py-3 pr-4 text-slate-700">{citizen.district}</td>
                <td className="py-3 pr-4"><StatusBadge status={citizen.active ? 'Active' : 'Inactive'} /></td>
                <td className="py-3 pr-4"><div className="flex gap-2"><button onClick={() => setSelectedId(selectedId === citizen.id ? '' : citizen.id)} className="text-xs font-semibold text-blue-600">Details</button><button onClick={() => { setCitizenActive(citizen.id, !citizen.active); toast.success(`Citizen account ${citizen.active ? 'deactivated' : 'activated'}.`) }} className="text-xs font-semibold text-slate-600">{citizen.active ? 'Deactivate' : 'Activate'}</button></div></td>
              </tr>
              {selectedId === citizen.id ? <tr><td colSpan={5} className="bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-800">{citizen.phone || 'No phone provided'} · {citizen.city}, {citizen.state}</div>
                <div className="mt-2 text-xs text-slate-500">Complaint history ({complaints.filter((item) => item.citizenEmail === citizen.email).length})</div>
                <div className="mt-2 space-y-2">{complaints.filter((item) => item.citizenEmail === citizen.email).map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm"><span>{item.id} · {item.title}</span><StatusBadge status={item.status} /></div>)}</div>
              </td></tr> : null}
              </Fragment>
            ))}
            {!filtered.length ? <tr><td colSpan={5} className="py-8 text-center text-slate-500">No citizens match this search.</td></tr> : null}
          </tbody>
        </table></div>
      </div>
    </>
  )
}

function OfficerManagement() {
  const officers = useAppStore((state) => state.officers)
  const departments = useAppStore((state) => state.departments)
  const setOfficerActive = useAppStore((state) => state.setOfficerActive)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState({ name: '', email: '', department: departments[0]?.name ?? '', jurisdiction: '', workload: 0 })
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) || !form.jurisdiction.trim()) {
      toast.error('Enter a name, valid email and jurisdiction.')
      return
    }
    try {
      officerService.saveOfficer({ ...form, active: officers.find((item) => item.id === editingId)?.active ?? true, id: editingId || undefined })
      setForm({ name: '', email: '', department: departments[0]?.name ?? '', jurisdiction: '', workload: 0 })
      setEditingId('')
      toast.success(editingId ? 'Officer updated.' : 'Officer created.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Officer could not be saved.')
    }
  }
  return (
    <>
      <SectionHeader eyebrow="Officers" title="Officer management" description="Manage officer assignments, workloads and department jurisdiction visibility." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-5">
          <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Officer name" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          <input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          <select value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{departments.map((item) => <option key={item.id}>{item.name}</option>)}</select>
          <input required value={form.jurisdiction} onChange={(event) => setForm((current) => ({ ...current, jurisdiction: event.target.value }))} placeholder="Jurisdiction" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white">{editingId ? 'Save officer' : 'Create officer'}</button>
        </form>
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              <th className="pb-3 pr-4">Officer</th>
              <th className="pb-3 pr-4">Department</th>
              <th className="pb-3 pr-4">Jurisdiction</th>
              <th className="pb-3 pr-4">Workload</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {officers.map((officer) => (
              <tr key={officer.id}>
                <td className="py-3 pr-4"><div className="font-semibold text-slate-900">{officer.name}</div></td>
                <td className="py-3 pr-4 text-slate-700">{officer.department}</td>
                <td className="py-3 pr-4 text-slate-700">{officer.jurisdiction}</td>
                <td className="py-3 pr-4 text-slate-700">{officer.workload} cases</td>
                <td className="py-3"><div className="flex gap-3"><button onClick={() => { setEditingId(officer.id); setForm({ name: officer.name, email: officer.email, department: officer.department, jurisdiction: officer.jurisdiction, workload: officer.workload }) }} className="text-xs font-semibold text-blue-600">Edit</button><button onClick={() => { setOfficerActive(officer.id, !officer.active); toast.success(`Officer ${officer.active ? 'deactivated' : 'activated'}.`) }} className="text-xs font-semibold text-slate-600">{officer.active ? 'Deactivate' : 'Activate'}</button></div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  )
}

function DepartmentManagement() {
  const departments = useAppStore((state) => state.departments)
  const complaints = useAppStore((state) => state.complaints)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState({ name: '', code: '', location: '' })
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !form.code.trim() || !form.location.trim()) {
      toast.error('Complete the department name, code and jurisdiction.')
      return
    }
    const current = departments.find((item) => item.id === editingId)
    try {
      const department = {
        ...(current ?? { resolutionRate: 0, totalComplaints: 0, pendingComplaints: 0, resolvedComplaints: 0, active: true }),
        ...form,
        id: editingId || undefined,
      }
      if (current) departmentService.updateDepartment({ ...department, id: current.id })
      else departmentService.createDepartment(department)
      setEditingId('')
      setForm({ name: '', code: '', location: '' })
      toast.success(current ? 'Department updated.' : 'Department created.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Department could not be saved.')
    }
  }
  return (
    <>
      <SectionHeader eyebrow="Departments" title="Department management" description="Review department health, response rates and complaint load." />
      <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Department name" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        <input required value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Department code" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        <input required value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="Jurisdiction" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white">{editingId ? 'Save department' : 'Create department'}</button>
      </form>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {departments.map((department) => {
          const departmentComplaints = complaints.filter((complaint) => complaint.department === department.name)
          const resolutionRate = departmentComplaints.length
            ? Math.round(departmentComplaints.filter((complaint) => complaint.status === 'Resolved').length / departmentComplaints.length * 100)
            : 0
          return (
          <div key={department.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-slate-900">{department.name}</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{department.code}</div>
              </div>
              <Pill className={department.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{department.active ? 'Active' : 'Inactive'}</Pill>
            </div>
            <div className="mt-2 text-xs text-slate-500">{department.location}</div>
            <div className="mt-4 text-3xl font-black tracking-[-0.05em] text-slate-900">{resolutionRate}%</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${resolutionRate}%` }} /></div>
            <div className="mt-2 text-xs text-slate-500">{departmentComplaints.length} complaint records</div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
              <button onClick={() => { setEditingId(department.id); setForm({ name: department.name, code: department.code, location: department.location }) }} className="text-blue-600">Edit</button>
              <button onClick={() => { departmentService.updateDepartment({ ...department, active: !department.active }); toast.success(`Department ${department.active ? 'deactivated' : 'activated'}.`) }} className="text-slate-600">{department.active ? 'Deactivate' : 'Activate'}</button>
              <button onClick={() => {
                if (!window.confirm(`Delete ${department.name}?`)) return
                try { departmentService.deleteDepartment(department.id); toast.success('Department deleted.') } catch (error) { toast.error(error instanceof Error ? error.message : 'Department could not be deleted.') }
              }} className="text-red-600">Delete</button>
            </div>
          </div>
          )
        })}
      </div>
    </>
  )
}

function CategoryManagement() {
  const categories = useAppStore((state) => state.categories)
  const departments = useAppStore((state) => state.departments)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState({ name: '', department: departments[0]?.name ?? '', defaultPriority: 'Medium' as Complaint['priority'], slaHours: 72 })
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !form.department || !Number.isFinite(form.slaHours) || form.slaHours < 1) {
      toast.error('Enter a category, department and positive SLA target.')
      return
    }
    try {
      categoryService.saveCategory({ ...form, active: true, id: editingId || undefined })
      setEditingId('')
      setForm({ name: '', department: departments[0]?.name ?? '', defaultPriority: 'Medium', slaHours: 72 })
      toast.success('Category saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Category could not be saved.')
    }
  }
  return (
    <>
      <SectionHeader eyebrow="Categories" title="Category management" description="Configure complaint routing, default priority and response targets." />
      <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-5">
        <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Category name" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        <select value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{departments.map((item) => <option key={item.id}>{item.name}</option>)}</select>
        <select value={form.defaultPriority} onChange={(event) => setForm((current) => ({ ...current, defaultPriority: event.target.value as Complaint['priority'] }))} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{['Low', 'Medium', 'High', 'Critical'].map((item) => <option key={item}>{item}</option>)}</select>
        <input required min={1} type="number" value={form.slaHours} onChange={(event) => setForm((current) => ({ ...current, slaHours: Number(event.target.value) }))} aria-label="SLA target in hours" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white">{editingId ? 'Save category' : 'Add category'}</button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead><tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400"><th className="pb-3 pr-4">Category</th><th className="pb-3 pr-4">Department</th><th className="pb-3 pr-4">Default priority</th><th className="pb-3 pr-4">SLA</th><th className="pb-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((category) => <tr key={category.id}>
              <td className="py-3 pr-4 font-semibold text-slate-800">{category.name}</td><td className="py-3 pr-4 text-slate-600">{category.department}</td><td className="py-3 pr-4"><StatusBadge status={category.defaultPriority} /></td><td className="py-3 pr-4">{category.slaHours} hours</td>
              <td className="py-3"><div className="flex gap-3"><button onClick={() => { setEditingId(category.id); setForm({ name: category.name, department: category.department, defaultPriority: category.defaultPriority, slaHours: category.slaHours }) }} className="text-xs font-semibold text-blue-600">Edit</button><button onClick={() => {
                if (!window.confirm(`Delete category ${category.name}?`)) return
                try { categoryService.deleteCategory(category.id); toast.success('Category deleted.') } catch (error) { toast.error(error instanceof Error ? error.message : 'Category could not be deleted.') }
              }} className="text-xs font-semibold text-red-600">Delete</button></div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </>
  )
}

function SlaManagement() {
  const categories = useAppStore((state) => state.categories)
  const complaints = useAppStore((state) => state.complaints)
  const departments = useAppStore((state) => state.departments)
  const prioritySlaHours = useAppStore((state) => state.prioritySlaHours)
  const setPrioritySla = useAppStore((state) => state.setPrioritySla)
  const [departmentFilter, setDepartmentFilter] = useState('All')
  const openComplaints = complaints.filter((complaint) => complaint.status !== 'Resolved')
  const now = Date.now()
  const deadlines = openComplaints.map((complaint) => {
    const category = categories.find((item) => item.name === complaint.category)
    const targetHours = Math.min(category?.slaHours ?? 72, prioritySlaHours[complaint.priority])
    const deadline = new Date(complaint.createdAt).getTime() + targetHours * 60 * 60 * 1000
    return { complaint, deadline, overdue: deadline < now }
  })
  return (
    <>
      <SectionHeader eyebrow="Service levels" title="SLA management" description="Configure category response targets and review overdue or approaching cases." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => <div key={category.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="font-bold text-slate-900">{category.name}</div>
          <label className="mt-3 block text-xs text-slate-500">Target response (hours)
            <input type="number" min={1} defaultValue={category.slaHours} onBlur={(event) => {
              const hours = Number(event.target.value)
              if (!Number.isFinite(hours) || hours < 1) { toast.error('SLA must be at least one hour.'); event.target.value = String(category.slaHours); return }
              if (hours !== category.slaHours) { categoryService.saveCategory({ ...category, slaHours: hours }); toast.success('SLA target updated.') }
            }} className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </label>
          <div className="mt-2 text-xs text-slate-500">Routed to {category.department}</div>
        </div>)}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(['Critical', 'High', 'Medium', 'Low'] as const).map((priority) => <label key={priority} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800">
          {priority} priority target
          <div className="mt-2 flex items-center gap-2 font-normal text-slate-500">
            <input type="number" min={1} value={prioritySlaHours[priority]} onChange={(event) => {
              const hours = Number(event.target.value)
              if (!Number.isFinite(hours) || hours < 1) return
              try { setPrioritySla(priority, hours) } catch (error) { toast.error(error instanceof Error ? error.message : 'SLA could not be saved.') }
            }} className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            hours
          </div>
        </label>)}
      </div>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-slate-900">Open complaint deadlines</h2><select aria-label="Filter by department" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><option>All</option>{departments.map((item) => <option key={item.id}>{item.name}</option>)}</select></div>
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead><tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400"><th className="pb-3 pr-4">Complaint</th><th className="pb-3 pr-4">Department</th><th className="pb-3 pr-4">Deadline</th><th className="pb-3">SLA state</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{deadlines.filter(({ complaint }) => departmentFilter === 'All' || complaint.department === departmentFilter).map(({ complaint, deadline, overdue }) => <tr key={complaint.id}>
            <td className="py-3 pr-4"><div className="font-semibold">{complaint.title}</div><div className="text-xs text-slate-500">{complaint.id}</div></td>
            <td className="py-3 pr-4">{complaint.department}</td>
            <td className="py-3 pr-4">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(deadline))}</td>
            <td className="py-3"><StatusBadge status={overdue ? 'Overdue' : deadline - now < 24 * 60 * 60 * 1000 ? 'Due soon' : 'On track'} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </>
  )
}

function AdminReports() {
  const complaints = useAppStore((state) => state.complaints)
  const departments = useAppStore((state) => state.departments)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const filtered = complaints.filter((complaint) => {
    const date = complaint.createdAt.slice(0, 10)
    return (!from || date >= from) && (!to || date <= to)
  })
  const data = departments.map((department) => {
    const items = filtered.filter((complaint) => complaint.department === department.name)
    return {
      name: department.name,
      total: items.length,
      resolved: items.filter((complaint) => complaint.status === 'Resolved').length,
      resolutionRate: items.length ? Math.round(items.filter((complaint) => complaint.status === 'Resolved').length / items.length * 100) : 0,
    }
  })
  return (
    <>
      <SectionHeader eyebrow="Analytics" title="Analytics and reports" description="Derived department performance for the selected complaint date range." action={<button onClick={() => downloadCsv('grievance-report.csv', data)} className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">Export CSV</button>} />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" /></label>
          <span className="text-sm text-slate-500">{filtered.length} complaints</span>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#2563EB" radius={[8, 8, 0, 0]} />
              <Bar dataKey="resolved" fill="#10B981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.map((item) => <div key={item.name} className="rounded-xl bg-slate-50 p-4"><div className="text-sm font-semibold text-slate-800">{item.name}</div><div className="mt-2 text-xs text-slate-500">{item.total} complaints · {item.resolutionRate}% resolved</div></div>)}
        </div>
      </div>
    </>
  )
}

function AuditLogs() {
  const auditLogs = useAppStore((state) => state.auditLogs)
  const [query, setQuery] = useState('')
  const filtered = auditLogs.filter((event) =>
    `${event.actor} ${event.role} ${event.action} ${event.relatedComplaintId ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <>
      <SectionHeader eyebrow="Audit trail" title="Audit logs" description="Demonstration record of actions taken by officers and administrators." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Search size={16} className="text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user, role, action or complaint ID" className="w-full bg-transparent text-sm outline-none" />
        </label>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400"><th className="pb-3 pr-4">User</th><th className="pb-3 pr-4">Role</th><th className="pb-3 pr-4">Action</th><th className="pb-3 pr-4">Related complaint</th><th className="pb-3 pr-4">Demo IP</th><th className="pb-3">Timestamp</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((event) => <tr key={event.id}>
                <td className="py-3 pr-4 font-medium text-slate-800">{event.actor}</td>
                <td className="py-3 pr-4 capitalize text-slate-600">{event.role}</td>
                <td className="py-3 pr-4 text-slate-600">{event.action}</td>
                <td className="py-3 pr-4 text-slate-600">{event.relatedComplaintId ?? '—'}</td>
                <td className="py-3 pr-4 text-slate-600">{event.ipAddress ?? 'Demo IP unavailable'}</td>
                <td className="py-3 text-slate-600">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.createdAt))}</td>
              </tr>)}
              {!filtered.length ? <tr><td colSpan={6} className="py-8 text-center text-slate-500">No audit activity found.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-400">The displayed IP is reserved demonstration data, not a captured client address. Audit records are local demo data only.</p>
      </div>
    </>
  )
}

function AdminSettings() {
  const navigate = useNavigate()
  const reset = () => {
    if (!window.confirm('Reset all local demo data to the original sample records? This cannot be undone.')) return
    adminService.resetDemoData()
    toast.success('Demo data reset.')
    navigate('/login', { replace: true })
  }
  return (
    <>
      <SectionHeader eyebrow="Settings" title="Demo settings" description="Manage local demonstration data. These settings do not affect a production service." />
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Reset demonstration data</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Reset complaints, notifications, profiles, departments, officers and audit events stored in this browser.</p>
        <button onClick={reset} className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">Reset demo data</button>
      </div>
    </>
  )
}

function HelpSupport() {
  return (
    <>
      <SectionHeader eyebrow="Support" title="Help & support" description="Guidance for using this grievance portal demonstration." />
      <div className="max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm leading-7 text-slate-600">
        <p>Submit a complaint with its location and supporting details. Your reference ID can be used on the Track Complaint page to review status updates.</p>
        <p>For this prototype, records are stored in this browser only. Do not submit sensitive personal information or rely on simulated AI review as a government decision.</p>
        <a className="font-semibold text-blue-600" href="mailto:support@example.com">Contact demonstration support</a>
      </div>
    </>
  )
}

function UnauthorizedPage() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <ShieldCheck className="mx-auto text-amber-500" size={36} />
        <h1 className="mt-4 text-2xl font-black text-slate-900">Access not permitted</h1>
        <p className="mt-2 text-sm text-slate-600">This page is not available for your current demo role.</p>
        <button onClick={() => navigate(`/${useAppStore.getState().session?.role ?? 'login'}`)} className="mt-5 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">Go to dashboard</button>
      </div>
    </div>
  )
}

export default App
