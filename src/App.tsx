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
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { isDemoMode, useAppStore, type Complaint, type ComplaintStatus, type Role } from './store/useAppStore'
import { authService } from './services/auth.service'
import { complaintService } from './services/complaint.service'
import { departmentService } from './services/department.service'
import { categoryService } from './services/category.service'
import { officerService } from './services/officer.service'
import { adminService } from './services/admin.service'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { downloadCsv } from './utils/csv'
import { fetchPortalData } from './services/portal-data.service'
import { getApiErrorMessage } from './services/api'
import { notificationService } from './services/notification.service'
import { ComplaintImageUploadError, type ComplaintSubmission } from './services/complaint.service'
import { mapStatus } from './services/api.models'
import { queryClient } from './services/queryClient'
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
    { label: 'Notifications', to: '/officer/notifications', icon: Bell },
    { label: 'Reports', to: '/officer/reports', icon: TrendingUp },
    { label: 'Profile', to: '/officer/profile', icon: User },
  ],
  admin: [
    { label: 'Overview', to: '/admin/overview', icon: LayoutDashboard },
    { label: 'All Complaints', to: '/admin/complaints', icon: FileText },
    { label: 'AI Monitoring', to: '/admin/ai', icon: Sparkles },
    { label: 'Duplicate Detection', to: '/admin/duplicates', icon: AlertTriangle },
    { label: 'Notifications', to: '/admin/notifications', icon: Bell },
    { label: 'Citizens', to: '/admin/citizens', icon: Users },
    { label: 'Officers', to: '/admin/officers', icon: ShieldCheck },
    { label: 'Departments', to: '/admin/departments', icon: Building2 },
    { label: 'Categories', to: '/admin/categories', icon: FileText },
    { label: 'SLA Management', to: '/admin/sla', icon: Gauge },
    { label: 'Analytics & Reports', to: '/admin/reports', icon: TrendingUp },
    { label: 'Audit Logs', to: '/admin/audit-logs', icon: ClipboardCheck },
    { label: 'Profile', to: '/admin/profile', icon: User },
  ],
} as const

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function getAvailableStatuses(current: ComplaintStatus): ComplaintStatus[] {
  const transitions: Record<ComplaintStatus, ComplaintStatus[]> = {
    Pending: ['Under Review', 'Escalated'],
    'AI Analysis': ['Under Review', 'Escalated'],
    Assigned: ['Under Review', 'In Progress', 'Escalated'],
    'Under Review': ['In Progress', 'Resolved', 'Escalated'],
    'In Progress': ['Under Review', 'Resolved', 'Escalated'],
    Resolved: ['Closed', 'In Progress'],
    Closed: [],
    Escalated: ['Under Review', 'In Progress', 'Resolved'],
  }
  return transitions[current]
}

const complaintSchema = z.object({
  title: z.string().min(10, 'Please provide a clear title.'),
  description: z.string().min(30, 'Please describe the issue in more detail.'),
  category: z.string().min(1, 'Choose a category.'),
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
  return isDemoMode ? <PortalRoutes /> : <ApiApplication />
}

function ApiApplication() {
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: authService.getCurrentSession, retry: false })
  const session = sessionQuery.data
  const portalQuery = useQuery({
    queryKey: ['portal-data', session?.role],
    queryFn: () => fetchPortalData(session!.role),
    enabled: Boolean(session),
  })

  useEffect(() => {
    if (sessionQuery.isSuccess) useAppStore.setState({ session: sessionQuery.data })
  }, [sessionQuery.data, sessionQuery.isSuccess])
  useEffect(() => {
    const handleExpiredSession = () => {
      useAppStore.setState({
        session: null,
        complaints: [],
        notifications: [],
        departments: [],
        categories: [],
        officers: [],
        citizens: [],
        auditLogs: [],
        dashboardStats: undefined,
        prioritySlaHours: { Critical: 12, High: 24, Medium: 72, Low: 120 },
      })
      queryClient.removeQueries({ queryKey: ['portal-data'] })
      queryClient.removeQueries({ queryKey: ['complaint-detail'] })
      queryClient.setQueryData(['session'], null)
    }
    window.addEventListener('portal:session-expired', handleExpiredSession)
    return () => window.removeEventListener('portal:session-expired', handleExpiredSession)
  }, [])
  useEffect(() => {
    if (portalQuery.data) useAppStore.setState(portalQuery.data)
  }, [portalQuery.data])

  if (sessionQuery.isLoading) return <LoadingPage message="Restoring your secure session…" />
  if (sessionQuery.isError) {
    return <RetryPage message={getApiErrorMessage(sessionQuery.error)} onRetry={() => void sessionQuery.refetch()} />
  }
  if (session && portalQuery.isLoading) return <LoadingPage message="Loading your grievance workspace…" />
  if (session && portalQuery.isError) {
    return <RetryPage message={getApiErrorMessage(portalQuery.error)} onRetry={() => void portalQuery.refetch()} />
  }
  return <PortalRoutes />
}

function LoadingPage({ message }: { message: string }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">{message}</div>
}

function RetryPage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Service temporarily unavailable</h1>
        <p role="alert" className="mt-2 text-sm text-slate-600">{message}</p>
        <button onClick={onRetry} className="mt-5 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">Try again</button>
      </div>
    </div>
  )
}

function PortalRoutes() {
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
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Public grievance services
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
              <button className="inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-3 font-semibold text-white shadow-soft" onClick={() => isDemoMode ? enterDemo('citizen') : navigate('/login')}>
                <Plus size={18} /> Submit a complaint
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-navy" onClick={() => isDemoMode ? enterDemo('citizen') : navigate('/login')}>
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
                Service map preview
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
                <div className="absolute left-24 top-14 rounded-lg bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm">Service area</div>
                <div className="absolute bottom-10 right-8 rounded-lg bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm">Incident location</div>
              </div>
              <div className="px-4 py-4 text-sm leading-6 text-slate-600">
                Sign in to submit a grievance or track an existing reference number.
              </div>
            </div>
          </div>
        </section>

        <section className="bg-navy text-white">
          <div className="mx-auto grid max-w-7xl gap-0 md:grid-cols-4">
            {[
              ['Secure', 'Account access'],
              ['Trackable', 'Status updates'],
              ['Human-led', 'Service decisions'],
              ['Private', 'Evidence storage'],
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
              { step: '02', icon: Building2, title: 'Reach the right department', description: 'Your selected category is associated with its configured service department.' },
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
  const [form, setForm] = useState({ email: isDemoMode ? 'citizen@example.com' : '', password: isDemoMode ? 'Demo@123' : '' })
  const [error, setError] = useState('')

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    try {
      const user = await authService.login(form.email, form.password)
      if (!user) throw new Error('Invalid email or password.')
      toast.success(`Welcome back, ${user.name}.`)
      navigate(`/${user.role}/overview`)
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, 'Invalid email or password.'))
      toast.error('Login failed. Please try again.')
    }
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
              {isDemoMode ? demoAccounts.map(([role, email, password]) => (
                <div key={role} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-300">{role}</div>
                  <div className="mt-2 text-sm font-medium text-white">{email}</div>
                  <div className="text-xs text-slate-300">{password}</div>
                </div>
              )) : <p className="text-sm leading-6 text-slate-300">Sign in with the account provided by your service administrator.</p>}
            </div>
          </div>
          <div className="p-8 lg:p-10">
            <div className="mb-6">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">{isDemoMode ? 'Demo authentication' : 'Secure authentication'}</div>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-900">Sign in</h2>
            </div>
            <form onSubmit={onSubmit} className="space-y-5">
              <label className="block text-sm font-medium text-slate-700">
                Email address
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  required
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
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (values.password !== values.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    try {
      const result = await authService.registerCitizen(values.name, values.email, values.password)
      if (!result.user) throw new Error(result.error ?? 'Unable to create the account.')
      toast.success(isDemoMode ? 'Demo citizen account created.' : 'Account created successfully.')
      navigate('/citizen/overview', { replace: true })
    } catch (registrationError) {
      setError(getApiErrorMessage(registrationError, 'Unable to create the account.'))
    }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">{isDemoMode ? 'Citizen registration · Demo' : 'Citizen registration'}</div>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-900">Create an account</h1>
        <p className="mt-2 text-sm text-slate-500">{isDemoMode ? 'This account exists only for this demonstration session.' : 'Your account is managed securely by the grievance service.'}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Full name
            <input required minLength={2} value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Email
            <input required type="email" value={values.email} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Password
            <input required minLength={isDemoMode ? 8 : 12} type="password" value={values.password} onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Confirm password
            <input required minLength={isDemoMode ? 8 : 12} type="password" value={values.confirmPassword} onChange={(event) => setValues((current) => ({ ...current, confirmPassword: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
          </label>
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
          <button type="submit" className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white">Create account</button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">Already registered? <button onClick={() => navigate('/login')} className="font-semibold text-blue-600">Sign in</button></p>
      </div>
    </div>
  )
}

function DashboardLayout({ role }: { role: Role }) {
  const navigate = useNavigate()
  const location = useLocation()
  const session = useAppStore((state) => state.session)
  const notifications = useAppStore((state) => state.notifications)
  const [mobileOpen, setMobileOpen] = useState(false)

  const items = navConfig[role]
  const unreadCount = notifications.filter((item) => !item.read && (!item.recipientEmail || item.recipientEmail === session?.email)).length
  const activeLabel = items.find((item) => location.pathname.startsWith(item.to))?.label ?? items[0].label

  const handleLogout = async () => {
    try {
      await authService.logout()
      navigate('/login')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not sign out cleanly.'))
      navigate('/login')
    }
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
                Workspace: {role}
              </div>
              <button aria-label="Open complaints" onClick={() => navigate(role === 'citizen' ? '/citizen/complaints' : role === 'officer' ? '/officer/assigned' : '/admin/complaints')} className="rounded-xl border border-slate-200 bg-white p-2"><Search size={18} /></button>
              <button aria-label="Open notifications" onClick={() => navigate(`/${role}/notifications`)} className="relative rounded-xl border border-slate-200 bg-white p-2">
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
                <Route path="notifications" element={<PortalNotifications />} />
                <Route path="profile" element={<CitizenProfile />} />
                <Route path="help" element={<HelpSupport />} />
              </> : null}
              {role === 'officer' ? <>
                <Route path="assigned" element={<OfficerAssignments />} />
                <Route path="complaint" element={<TrackComplaint />} />
                <Route path="notifications" element={<PortalNotifications />} />
                <Route path="reports" element={<OfficerReports />} />
                <Route path="profile" element={<CitizenProfile />} />
              </> : null}
              {role === 'admin' ? <>
                <Route path="complaints" element={<AdminAllComplaints />} />
                <Route path="complaint" element={<TrackComplaint />} />
                <Route path="notifications" element={<PortalNotifications />} />
                <Route path="ai" element={<AdminMonitoring />} />
                <Route path="duplicates" element={<DuplicateReview />} />
                <Route path="citizens" element={<CitizenManagement />} />
                <Route path="officers" element={<OfficerManagement />} />
                <Route path="departments" element={<DepartmentManagement />} />
                <Route path="categories" element={<CategoryManagement />} />
                <Route path="sla" element={<SlaManagement />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="audit-logs" element={<AuditLogs />} />
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
  const allCategories = useAppStore((state) => state.categories)
  const categories = allCategories.filter((category) => category.active)
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingImageUpload, setPendingImageUpload] = useState<{ complaintId: string; trackingId: string } | null>(null)
  const [locationConfirmed, setLocationConfirmed] = useState(false)

  const defaultValues: ComplaintFormValues = {
    title: '',
    description: '',
    category: categories[0]?.name ?? 'Sanitation',
    severity: 'Medium',
    incidentDate: new Date().toISOString().slice(0, 16),
    address: '',
    state: '',
    district: '',
    city: '',
    pincode: '',
    latitude: 20.5937,
    longitude: 78.9629,
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
        toast.error(`${file.name}: image must be 512 KB or smaller.`)
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
    setAttachedFiles((current) => [...current, ...accepted].slice(0, 4))
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
        setLocationConfirmed(true)
        toast.success('Current location captured.')
      },
      (error) => toast.error(error.message || 'Location permission was not granted.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const onSubmit = async (values: ComplaintFormValues) => {
    if (!locationConfirmed) {
      toast.error('Choose the incident location on the map or use your current location.')
      return
    }
    setIsSubmitting(true)
    setPendingImageUpload(null)
    try {
      const selectedCategory = categories.find((category) => category.name === values.category)
      if (!selectedCategory) throw new Error('The selected category is no longer available.')
      const additionalDetails = values.remarks?.trim()
      const description = additionalDetails ? `${values.description.trim()}\n\nAdditional details: ${additionalDetails}` : values.description.trim()
      const created = await complaintService.createComplaint({
        title: values.title,
        description,
        categoryId: selectedCategory.id,
        severity: values.severity.toUpperCase() as ComplaintSubmission['severity'],
        incidentAt: new Date(values.incidentDate).toISOString(),
        consent: true,
        location: {
          address: values.address,
          state: values.state,
          district: values.district,
          city: values.city,
          pincode: values.pincode,
          latitude: values.latitude,
          longitude: values.longitude,
        },
      }, attachedFiles)
      toast.success(`Complaint ${created.id} submitted successfully.`)
      navigate(`/citizen/track?complaint=${encodeURIComponent(created.id)}`)
    } catch (error) {
      if (error instanceof ComplaintImageUploadError) {
        setPendingImageUpload({ complaintId: error.complaint.recordId ?? '', trackingId: error.complaint.id })
        toast.error(`Complaint ${error.complaint.id} was created, but the images did not upload.`)
        return
      }
      toast.error(error instanceof Error ? `Complaint could not be saved: ${error.message}` : 'Complaint could not be saved.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const retryImageUpload = async () => {
    if (!pendingImageUpload?.complaintId) return
    setIsSubmitting(true)
    try {
      await complaintService.uploadImages(pendingImageUpload.complaintId, attachedFiles)
      toast.success('Complaint images uploaded.')
      navigate(`/citizen/track?complaint=${encodeURIComponent(pendingImageUpload.trackingId)}`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Images could not be uploaded. Try again.'))
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
                <LocationMap lat={form.watch('latitude')} lng={form.watch('longitude')} onSelect={(latitude, longitude) => { form.setValue('latitude', latitude); form.setValue('longitude', longitude); setLocationConfirmed(true) }} />
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Latitude</label>
                  <input type="number" step="any" value={form.watch('latitude')} onChange={(event) => { form.setValue('latitude', Number(event.target.value), { shouldValidate: true }); setLocationConfirmed(true) }} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Longitude</label>
                  <input type="number" step="any" value={form.watch('longitude')} onChange={(event) => { form.setValue('longitude', Number(event.target.value), { shouldValidate: true }); setLocationConfirmed(true) }} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
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
                      <button type="button" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700" onClick={() => {
                        setImagePreviews((current) => current.filter((_, currentIndex) => currentIndex !== index))
                        setAttachedFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
                      }}>
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
            {pendingImageUpload ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <span>Complaint {pendingImageUpload.trackingId} is saved. Upload its supporting images to complete submission.</span>
              <button type="button" disabled={isSubmitting} onClick={() => void retryImageUpload()} className="rounded-lg bg-amber-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{isSubmitting ? 'Uploading…' : 'Retry image upload'}</button>
            </div> : null}
          </div>
        </form>

        <aside className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600"><Sparkles size={18} /></div>
            <div>
              <div className="text-sm font-bold text-slate-900">Complaint routing</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">SERVICE METADATA</div>
            </div>
          </div>
          <div className="mt-5 space-y-4 text-sm">
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Selected category</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-800">{watchedCategory}</span>
                <Pill className="bg-slate-100 text-slate-600">{watchedSeverity}</Pill>
              </div>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Suggested department</div>
              <div className="mt-2 font-semibold text-slate-800">{selectedCategory?.department ?? 'Municipal Corporation'}</div>
            </div>
            <div className="rounded-xl border border-sky-200 bg-white p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Automated analysis</div>
              <div className="mt-2 text-sm font-semibold text-slate-800">Not configured</div>
              <div className="mt-1 text-xs text-slate-600">No AI score or duplicate determination is generated.</div>
            </div>
          </div>
          <p className="mt-5 text-xs leading-6 text-slate-500">Category and department information comes from the grievance service and is not an automated decision.</p>
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
            <option>AI Analysis</option>
            <option>Assigned</option>
            <option>In Progress</option>
            <option>Under Review</option>
            <option>Resolved</option>
            <option>Closed</option>
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
  const complaints = session?.role === 'citizen'
    ? allComplaints.filter((complaint) => complaint.citizenEmail === session.email)
    : allComplaints
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('complaint') ?? '')
  const selectedId = searchParams.get('complaint') ?? ''
  const cachedComplaint = complaints.find((complaint) => complaint.id.toLowerCase() === selectedId.trim().toLowerCase())
  const detailQuery = useQuery({
    queryKey: ['complaint-detail', selectedId],
    queryFn: () => complaintService.getComplaintByTrackingId(selectedId),
    enabled: !isDemoMode && Boolean(selectedId),
    retry: false,
  })
  const selectedComplaint = isDemoMode ? cachedComplaint : detailQuery.data ?? cachedComplaint
  const [images, setImages] = useState<string[]>([])
  const [resolutionImages, setResolutionImages] = useState<string[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [feedbackRating, setFeedbackRating] = useState(5)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

  useEffect(() => setFeedbackSubmitted(false), [selectedId])

  useEffect(() => {
    if (isDemoMode || !selectedComplaint?.recordId || (!selectedComplaint.imageIds?.length && !selectedComplaint.resolutionEvidenceIds?.length)) {
      setImages([])
      setResolutionImages([])
      setImagesLoading(false)
      return
    }
    let active = true
    let urls: string[] = []
    setImages([])
    setResolutionImages([])
    setImagesLoading(true)
    const complaintId = selectedComplaint.recordId
    const fetchImages = (ids: string[], resolution = false) => Promise.all(ids.map(async (id) => {
      try {
        return await complaintService.fetchComplaintImage(complaintId, id, resolution)
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'Complaint images could not be loaded.'))
        return null
      }
    }))
    void Promise.all([
      fetchImages(selectedComplaint.imageIds ?? []),
      fetchImages(selectedComplaint.resolutionEvidenceIds ?? [], true),
    ]).then(([complaintResults, evidenceResults]) => {
      const complaintImages = complaintResults.filter((url): url is string => Boolean(url))
      const evidenceImages = evidenceResults.filter((url): url is string => Boolean(url))
      urls = [...complaintImages, ...evidenceImages]
      if (active) {
        setImages(complaintImages)
        setResolutionImages(evidenceImages)
      } else urls.forEach((url) => URL.revokeObjectURL(url))
    }).finally(() => { if (active) setImagesLoading(false) })
    return () => {
      active = false
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [selectedComplaint?.recordId, selectedComplaint?.imageIds, selectedComplaint?.resolutionEvidenceIds])
  const complaintImages = isDemoMode ? selectedComplaint?.images ?? [] : images
  const complaintResolutionImages = isDemoMode ? selectedComplaint?.resolutionImages ?? [] : resolutionImages

  const submitFeedback = async () => {
    if (!selectedComplaint) return
    try {
      await complaintService.submitFeedback(selectedComplaint.id, feedbackRating, feedbackComment.trim() || undefined)
      setFeedbackSubmitted(true)
      toast.success('Thank you for your feedback.')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Feedback could not be submitted.'))
    }
  }

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
          {detailQuery.isLoading ? <p className="mt-4 text-sm text-slate-500">Loading complaint details…</p> : null}
          {detailQuery.isError ? <p role="alert" className="mt-4 text-sm text-red-600">{getApiErrorMessage(detailQuery.error, 'Complaint details could not be loaded.')}</p> : null}
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
                {complaintImages.length ? <div className="mt-3 grid grid-cols-2 gap-2">{complaintImages.map((image, index) => <img key={`${selectedComplaint.id}-${index}`} src={image} alt={`Evidence ${index + 1}`} className="h-28 w-full rounded-lg object-cover" />)}</div> : <p className="mt-3 text-sm text-slate-500">{imagesLoading ? 'Loading evidence images…' : selectedComplaint.imageIds?.length ? 'Evidence images are unavailable.' : 'No evidence images attached.'}</p>}
                {complaintResolutionImages.length ? <div className="mt-4"><div className="text-xs font-semibold text-slate-600">Resolution evidence</div><div className="mt-2 grid grid-cols-2 gap-2">{complaintResolutionImages.map((image, index) => <img key={`${selectedComplaint.id}-resolution-${index}`} src={image} alt={`Resolution evidence ${index + 1}`} className="h-28 w-full rounded-lg object-cover" />)}</div></div> : null}
                <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm">
                  <div className="font-semibold text-slate-800">Automated analysis status</div>
                  <div className="mt-2 text-slate-600">{selectedComplaint.aiStatus ?? 'NOT_CONFIGURED'}</div>
                  <div className="mt-1 text-xs text-slate-600">No confidence or risk score is available unless an analysis service is configured.</div>
                </div>
              </section>
            </div>
            {['Resolved', 'Closed'].includes(selectedComplaint.status) ? <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-900">Rate this resolution</h3>
              {selectedComplaint.feedback || feedbackSubmitted ? <p className="mt-2 text-sm text-emerald-700">Feedback submitted · {selectedComplaint.feedback?.rating ?? feedbackRating}/5. Thank you.</p> : <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-sm text-slate-600">Rating
                  <select value={feedbackRating} onChange={(event) => setFeedbackRating(Number(event.target.value))} className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select>
                </label>
                <label className="min-w-52 flex-1 text-sm text-slate-600">Comment
                  <input value={feedbackComment} onChange={(event) => setFeedbackComment(event.target.value)} maxLength={2000} className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
                </label>
                <button onClick={() => void submitFeedback()} className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">Submit feedback</button>
              </div>}
            </section> : null}
          </div>
        ) : null}
      </div>
    </>
  )
}

function PortalNotifications() {
  const session = useAppStore((state) => state.session)
  const allComplaints = useAppStore((state) => state.complaints)
  const visibleComplaints = session?.role === 'citizen'
    ? allComplaints.filter((complaint) => complaint.citizenEmail === session.email)
    : allComplaints
  const complaintIds = visibleComplaints.map((complaint) => complaint.id)
  const allNotifications = useAppStore((state) => state.notifications)
  const notifications = isDemoMode
    ? allNotifications.filter((item) => item.recipientEmail === session?.email || (!item.recipientEmail && item.complaintId && complaintIds.includes(item.complaintId)))
    : allNotifications
  const [filter, setFilter] = useState('All')
  const navigate = useNavigate()
  const complaintPath = session?.role === 'citizen' ? '/citizen/track' : session?.role === 'officer' ? '/officer/complaint' : '/admin/complaint'
  const markRead = async (id: string) => {
    try { await notificationService.markAsRead(id) } catch (error) { toast.error(getApiErrorMessage(error, 'Notification could not be updated.')) }
  }
  const markAllRead = async () => {
    try { await notificationService.markAllAsRead() } catch (error) { toast.error(getApiErrorMessage(error, 'Notifications could not be updated.')) }
  }

  return (
    <>
      <SectionHeader eyebrow="Notifications" title="Updates and alerts" description="Stay informed about changes, assignments and decisions related to your account." action={<div className="flex gap-2"><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option>All</option><option>Unread</option><option>Read</option></select><button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => void markAllRead()}>Mark all as read</button></div>} />
      <div className="space-y-4">
        {notifications.filter((item) => filter === 'All' || (filter === 'Unread' ? !item.read : item.read)).map((item) => (
          <div key={item.id} className={`rounded-2xl border p-4 shadow-sm ${item.read ? 'border-slate-200 bg-white' : 'border-blue-200 bg-blue-50'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.type}</div>
                <div className="mt-2 text-base font-semibold text-slate-800">{item.message}</div>
                <div className="mt-2 text-xs text-slate-500">{formatDate(item.createdAt)}</div>
                {item.complaintId ? (() => {
                  const complaint = allComplaints.find((candidate) => candidate.recordId === item.complaintId || candidate.id === item.complaintId)
                  return complaint ? <button onClick={() => navigate(`${complaintPath}?complaint=${encodeURIComponent(complaint.id)}`)} className="mt-3 text-xs font-semibold text-blue-600">View complaint</button> : null
                })() : null}
              </div>
              {!item.read ? (
                <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700" onClick={() => void markRead(item.id)}>Mark read</button>
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
  const defaults = {
    name: citizen?.name ?? session?.name ?? '',
    phone: citizen?.phone ?? officer?.phone ?? '',
    address: citizen?.address ?? officer?.jurisdiction ?? '',
    state: citizen?.state ?? officer?.state ?? '',
    district: citizen?.district ?? officer?.district ?? '',
    city: citizen?.city ?? officer?.city ?? '',
    pincode: citizen?.pincode ?? officer?.pincode ?? '',
  }
  const [profile, setProfile] = useState(defaults)
  const [editing, setEditing] = useState(false)
  const save = async () => {
    if (profile.name.trim().length < 2 || (session?.role === 'citizen' && (!/^\+?[0-9\s-]{8,16}$/.test(profile.phone) || profile.address.trim().length < 5 || !/^\d{6}$/.test(profile.pincode)))) {
      toast.error(session?.role === 'citizen' ? 'Enter a valid name, phone number, address and 6-digit pincode.' : 'Enter a valid name.')
      return
    }
    try {
      await authService.updateProfile(profile)
      setEditing(false)
      toast.success('Profile updated.')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Profile could not be updated.'))
    }
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
              <label className="text-sm font-medium text-slate-700">{session?.role === 'officer' ? 'Jurisdiction' : 'Address'}</label>
              <input disabled={!editing} value={profile.address} onChange={(event) => setProfile((current) => ({ ...current, address: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div>
            {session?.role === 'citizen' ? <div>
              <label className="text-sm font-medium text-slate-700">State</label>
              <input disabled={!editing} value={profile.state} onChange={(event) => setProfile((current) => ({ ...current, state: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div>
            : null}
            {session?.role === 'citizen' ? <div>
              <label className="text-sm font-medium text-slate-700">District</label>
              <input disabled={!editing} value={profile.district} onChange={(event) => setProfile((current) => ({ ...current, district: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div>
            : null}
            {session?.role === 'citizen' ? <div>
              <label className="text-sm font-medium text-slate-700">City</label>
              <input disabled={!editing} value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div>
            : null}
            {session?.role === 'citizen' ? <div>
              <label className="text-sm font-medium text-slate-700">Pincode</label>
              <input disabled={!editing} value={profile.pincode} onChange={(event) => setProfile((current) => ({ ...current, pincode: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 disabled:text-slate-500" />
            </div> : null}
          </div>
          <div className="mt-6 flex gap-2">
            {session?.role === 'admin' ? <p className="text-sm text-slate-500">Administrator profile details are managed by the service operator.</p> : !editing ? <button onClick={() => setEditing(true)} className="rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white">Edit profile</button> : <>
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
  const categories = useAppStore((state) => state.categories)
  const prioritySlaHours = useAppStore((state) => state.prioritySlaHours)
  const officerComplaints = complaints.filter((complaint) => complaint.assignedOfficer === session?.name)
  const overdueCount = officerComplaints.filter((complaint) => {
    if (complaint.status === 'Resolved' || complaint.status === 'Closed') return false
    const category = categories.find((item) => item.name === complaint.category)
    const targetHours = Math.min(category?.slaHours ?? 72, prioritySlaHours[complaint.priority])
    return Date.now() > new Date(complaint.createdAt).getTime() + targetHours * 60 * 60 * 1000
  }).length

  const stats = [
    { label: 'Assigned complaints', value: String(officerComplaints.length), note: 'Current load', icon: ClipboardCheck, tone: 'blue' },
    { label: 'Pending', value: String(officerComplaints.filter((item) => item.status === 'Pending').length), note: 'Awaiting review', icon: Gauge, tone: 'amber' },
    { label: 'In progress', value: String(officerComplaints.filter((item) => item.status === 'In Progress').length), note: 'Active cases', icon: TrendingUp, tone: 'violet' },
    { label: 'Resolved', value: String(officerComplaints.filter((item) => item.status === 'Resolved').length), note: 'Completed', icon: CheckCircle2, tone: 'green' },
    { label: 'Past target', value: String(overdueCount), note: 'Open beyond configured SLA', icon: AlertTriangle, tone: 'amber' },
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
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const assigned = isDemoMode
    ? complaints.filter((complaint) => complaint.assignedOfficer === session?.name)
    : complaints
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
          <select aria-label="Filter assignments by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{['All', 'Pending', 'AI Analysis', 'Assigned', 'In Progress', 'Under Review', 'Resolved', 'Closed', 'Escalated'].map((item) => <option key={item}>{item}</option>)}</select>
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
                    <button onClick={() => navigate(`/officer/complaint?complaint=${encodeURIComponent(complaint.id)}`)} className="mt-1 text-xs font-semibold text-blue-600">View details and evidence</button>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{complaint.category}</td>
                  <td className="py-3 pr-4 text-slate-700">{complaint.city}</td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.priority} /></td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.status} /></td>
                  <td className="py-3">
                    <select value={complaint.status} onChange={(event) => {
                      void complaintService.updateComplaintStatus(complaint.id, event.target.value as ComplaintStatus, session?.name).then(
                        () => toast.success(`Updated ${complaint.id}.`),
                        (error: unknown) => toast.error(getApiErrorMessage(error, 'Status could not be updated.')),
                      )
                    }} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                      {[complaint.status, ...getAvailableStatuses(complaint.status)].map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </td>
                  <td className="py-3">
                    <form className="flex min-w-56 gap-2" onSubmit={(event) => {
                      event.preventDefault()
                      const note = remarks[complaint.id]?.trim()
                      if (!note) { toast.error('Enter an investigation note first.'); return }
                      void complaintService.addRemark(complaint.id, note).then(() => {
                        setRemarks((current) => ({ ...current, [complaint.id]: '' }))
                        toast.success('Investigation note added.')
                      }, (error: unknown) => toast.error(getApiErrorMessage(error, 'Investigation note could not be saved.')))
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
                      void complaintService.addResolutionImage(complaint.id, file).then(
                        () => toast.success('Resolution evidence saved.'),
                        (error: unknown) => toast.error(getApiErrorMessage(error, 'Resolution evidence could not be saved.')),
                      )
                    }} />
                    <ResolutionEvidencePreview complaint={complaint} />
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

function ResolutionEvidencePreview({ complaint }: { complaint: Complaint }) {
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (isDemoMode || !complaint.recordId || !complaint.resolutionEvidenceIds?.length) {
      setImages(isDemoMode ? complaint.resolutionImages ?? [] : [])
      setLoading(false)
      return
    }
    let active = true
    let urls: string[] = []
    setImages([])
    setLoading(true)
    void Promise.all(complaint.resolutionEvidenceIds.map(async (id) => {
      try {
        return await complaintService.fetchComplaintImage(complaint.recordId!, id, true)
      } catch (error) {
        toast.error(getApiErrorMessage(error, `Resolution image ${id} could not be loaded.`))
        return null
      }
    })).then((results) => {
      urls = results.filter((url): url is string => Boolean(url))
      if (active) setImages(urls)
      else urls.forEach((url) => URL.revokeObjectURL(url))
    }).finally(() => { if (active) setLoading(false) })
    return () => {
      active = false
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [complaint.id, complaint.recordId, complaint.resolutionEvidenceIds, complaint.resolutionImages])

  if (!images.length) {
    return complaint.resolutionEvidenceIds?.length ? <div className="mt-2 text-xs text-slate-500">{loading ? 'Loading resolution images…' : 'Resolution images are unavailable.'}</div> : null
  }
  return <div className="mt-2 flex flex-wrap gap-1">{images.map((image, index) => <a key={`${complaint.id}-resolution-${index}`} href={image} target="_blank" rel="noreferrer"><img src={image} alt={`Resolution evidence ${index + 1} for ${complaint.id}`} className="h-12 w-12 rounded object-cover" /></a>)}</div>
}

function DuplicateReview() {
  const complaints = useAppStore((state) => state.complaints)
  const [searchParams, setSearchParams] = useSearchParams()
  const sourceId = searchParams.get('complaint') ?? ''
  const setSourceId = (id: string) => {
    const next = new URLSearchParams(searchParams)
    if (id) next.set('complaint', id)
    else next.delete('complaint')
    setSearchParams(next, { replace: true })
  }
  const [candidateId, setCandidateId] = useState('')
  const [decision, setDecision] = useState<'linked' | 'separate' | 'manual-review'>('manual-review')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [recentReviews, setRecentReviews] = useState<{ source: string; candidate: string; decision: string; notes?: string | null; reviewer?: string; createdAt?: string }[]>([])
  const candidates = complaints.filter((item) => item.id !== sourceId)

  useEffect(() => {
    let active = true
    setRecentReviews([])
    if (!sourceId || isDemoMode) return () => { active = false }
    void complaintService.getDuplicateReviews(sourceId).then((reviews) => {
      if (active) setRecentReviews(reviews.map((review) => ({
        source: review.complaint.trackingId,
        candidate: review.candidate.trackingId,
        decision: review.decision,
        notes: review.notes,
        reviewer: review.reviewer.email,
        createdAt: review.createdAt,
      })))
    }).catch((error: unknown) => toast.error(getApiErrorMessage(error, 'Duplicate review history could not be loaded.')))
    return () => { active = false }
  }, [sourceId])

  const submitReview = async () => {
    if (!sourceId || !candidateId) {
      toast.error('Choose both complaints before recording a review.')
      return
    }
    setBusy(true)
    try {
      await complaintService.reviewDuplicate(sourceId, decision, candidateId, notes.trim() || undefined)
      const source = complaints.find((item) => item.id === sourceId)
      const candidate = complaints.find((item) => item.id === candidateId)
      if (isDemoMode) {
        setRecentReviews((items) => [{ source: source?.id ?? sourceId, candidate: candidate?.id ?? candidateId, decision, notes: notes.trim() || undefined }, ...items])
      } else {
        const reviews = await complaintService.getDuplicateReviews(sourceId)
        setRecentReviews(reviews.map((review) => ({
          source: review.complaint.trackingId,
          candidate: review.candidate.trackingId,
          decision: review.decision,
          notes: review.notes,
          reviewer: review.reviewer.email,
          createdAt: review.createdAt,
        })))
      }
      setNotes('')
      toast.success('Manual duplicate review recorded.')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Duplicate review could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionHeader eyebrow="Duplicate review" title="Manual duplicate review" description="Automatic duplicate detection is unavailable. Select two existing complaints and record a manual decision; no similarity score or candidate is fabricated." />
      <div className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Complaint
            <select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setCandidateId('') }} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <option value="">Select complaint</option>
              {complaints.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Compare with
            <select value={candidateId} onChange={(event) => setCandidateId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <option value="">Select another complaint</option>
              {candidates.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Decision
            <select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <option value="manual-review">Needs further review</option>
              <option value="linked">Same incident</option>
              <option value="separate">Separate incidents</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Review notes
            <input maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
          </label>
        </div>
        <button disabled={busy || complaints.length < 2} onClick={() => void submitReview()} className="mt-5 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Record review'}</button>
        {complaints.length < 2 ? <p className="mt-3 text-sm text-slate-500">At least two complaints are required for manual comparison.</p> : null}
      </div>
      {recentReviews.length ? <div className="mt-5 max-w-3xl space-y-2">{recentReviews.map((review, index) => <div key={`${review.source}-${review.candidate}-${review.createdAt ?? index}`} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700"><div>{review.source} ↔ {review.candidate} · {review.decision.replace(/_/g, ' ').replace('-', ' ')}</div>{review.notes ? <div className="mt-1 text-slate-500">{review.notes}</div> : null}{review.reviewer && review.createdAt ? <div className="mt-1 text-xs text-slate-400">Reviewed by {review.reviewer} · {formatDate(review.createdAt)}</div> : null}</div>)}</div> : sourceId ? <p className="mt-4 max-w-3xl text-sm text-slate-500">No duplicate review history for this complaint.</p> : null}
    </>
  )
}

function OfficerReports() {
  const complaints = useAppStore((state) => state.complaints)
  const session = useAppStore((state) => state.session)
  const assigned = complaints.filter((item) => item.assignedOfficer === session?.name)
  const data = ['Pending', 'AI Analysis', 'Assigned', 'In Progress', 'Under Review', 'Resolved', 'Closed', 'Escalated'].map((status) => ({
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
  const dashboardStats = useAppStore((state) => state.dashboardStats)
  const statusCount = (status: string) => dashboardStats?.statuses[status] ?? complaints.filter((item) => item.status === mapStatus(status)).length
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
    { name: 'Submitted', value: statusCount('SUBMITTED'), color: '#3B82F6' },
    { name: 'Assigned', value: statusCount('ASSIGNED'), color: '#0EA5E9' },
    { name: 'In Progress', value: statusCount('IN_PROGRESS'), color: '#8B5CF6' },
    { name: 'Under review', value: statusCount('UNDER_INVESTIGATION'), color: '#F59E0B' },
    { name: 'Resolved', value: statusCount('RESOLVED'), color: '#10B981' },
    { name: 'Escalated', value: statusCount('ESCALATED'), color: '#EF4444' },
  ]

  const stats = [
    { label: 'Total complaints', value: String(dashboardStats?.complaints ?? complaints.length), note: 'Across all districts', icon: FileText, tone: 'blue' },
    { label: 'Citizens', value: String(dashboardStats?.citizens ?? citizens.length), note: 'Registered users', icon: Users, tone: 'violet' },
    { label: 'Officers', value: String(dashboardStats?.officers ?? officers.filter((item) => item.active).length), note: 'Active staff', icon: ShieldCheck, tone: 'green' },
    { label: 'Awaiting review', value: String(statusCount('SUBMITTED')), note: 'Submitted complaints', icon: Gauge, tone: 'amber' },
    { label: 'Resolved', value: String(statusCount('RESOLVED') + statusCount('CLOSED')), note: 'Resolved or closed cases', icon: CheckCircle2, tone: 'green' },
    { label: 'Under investigation', value: String(statusCount('UNDER_INVESTIGATION')), note: 'Current review status', icon: AlertTriangle, tone: 'amber' },
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
  const complaints = useAppStore((state) => state.complaints)
  const analysisStatuses = ['NOT_CONFIGURED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED']
  const statusCounts = analysisStatuses.map((status) => ({
    status,
    count: complaints.filter((complaint) => complaint.aiStatus === status).length,
  }))
  return (
    <>
      <SectionHeader eyebrow="AI monitoring" title="Analysis job status" description="Real job states returned for complaints. No model accuracy or risk scores are reported." />
      <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">The service reports NOT_CONFIGURED until an AI provider and worker are enabled. Complaint handling remains available without AI analysis.</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {statusCounts.map(({ status, count }) => <div key={status} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{status.replace('_', ' ')}</div>
          <div className="mt-3 text-3xl font-black tracking-[-0.05em] text-slate-900">{count}</div>
        </div>)}
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
  const [departmentDrafts, setDepartmentDrafts] = useState<Record<string, string>>({})
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
            {['All', 'Pending', 'AI Analysis', 'Assigned', 'In Progress', 'Under Review', 'Resolved', 'Closed', 'Escalated'].map((item) => <option key={item}>{item}</option>)}
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
                    <select aria-label={`Select department for ${complaint.id}`} value={departmentDrafts[complaint.id] ?? complaint.department} onChange={(event) => {
                      setDepartmentDrafts((current) => ({ ...current, [complaint.id]: event.target.value }))
                    }} className="max-w-40 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                      {departments.map((item) => <option key={item.id}>{item.name}</option>)}
                    </select>
                  </td>
                  <td className="py-3 pr-4">
                    <select aria-label={`Assign officer for ${complaint.id}`} value={officers.find((item) => item.name === complaint.assignedOfficer)?.id ?? ''} onChange={(event) => {
                      const officer = officers.find((item) => item.id === event.target.value)
                      if (!officer) return
                      const department = departmentDrafts[complaint.id] ?? complaint.department
                      void complaintService.assignComplaint(complaint.id, department, officer.name).then(
                        () => {
                          setDepartmentDrafts((current) => { const next = { ...current }; delete next[complaint.id]; return next })
                          toast.success('Complaint assignment updated.')
                        },
                        (error: unknown) => toast.error(getApiErrorMessage(error, 'Complaint could not be assigned.')),
                      )
                    }} className="max-w-40 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                      <option value="">Select officer</option>
                      {officers.filter((item) => item.active && item.department === (departmentDrafts[complaint.id] ?? complaint.department)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </td>
                  <td className="py-3 pr-4"><StatusBadge status={complaint.status} /></td>
                  <td className="py-3">
                    <select aria-label={`Update status for ${complaint.id}`} value={complaint.status} onChange={(event) => {
                      void complaintService.updateComplaintStatus(complaint.id, event.target.value as ComplaintStatus).then(
                        () => toast.success(`Updated ${complaint.id}.`),
                        (error: unknown) => toast.error(getApiErrorMessage(error, 'Status could not be updated.')),
                      )
                    }} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
                      {[complaint.status, ...getAvailableStatuses(complaint.status)].map((item) => <option key={item}>{item}</option>)}
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

function CitizenManagement() {
  const citizens = useAppStore((state) => state.citizens)
  const complaints = useAppStore((state) => state.complaints)
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
                <td className="py-3 pr-4"><div className="flex gap-2"><button onClick={() => setSelectedId(selectedId === citizen.id ? '' : citizen.id)} className="text-xs font-semibold text-blue-600">Details</button><button onClick={() => { void adminService.setCitizenActive(citizen.id, !citizen.active).then(() => toast.success(`Citizen account ${citizen.active ? 'deactivated' : 'activated'}.`), (error: unknown) => toast.error(getApiErrorMessage(error, 'Citizen status could not be updated.'))) }} className="text-xs font-semibold text-slate-600">{citizen.active ? 'Deactivate' : 'Activate'}</button></div></td>
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
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState({ name: '', email: '', department: departments[0]?.name ?? '', jurisdiction: '', workload: 0, password: '' })
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) || !form.jurisdiction.trim()) {
      toast.error('Enter a name, valid email and jurisdiction.')
      return
    }
    if (!editingId && !isDemoMode && form.password.length < 12) {
      toast.error('Set an initial password of at least 12 characters.')
      return
    }
    try {
      await officerService.saveOfficer({ ...form, active: officers.find((item) => item.id === editingId)?.active ?? true, id: editingId || undefined })
      setForm({ name: '', email: '', department: departments[0]?.name ?? '', jurisdiction: '', workload: 0, password: '' })
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
        <form onSubmit={(event) => void submit(event)} className="mb-6 grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-5">
          <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Officer name" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          <input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          <select value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{departments.map((item) => <option key={item.id}>{item.name}</option>)}</select>
          <input required value={form.jurisdiction} onChange={(event) => setForm((current) => ({ ...current, jurisdiction: event.target.value }))} placeholder="Jurisdiction" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          {!editingId ? <input required={!isDemoMode} minLength={isDemoMode ? 8 : 12} type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Initial password" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /> : null}
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
                <td className="py-3"><div className="flex gap-3"><button onClick={() => { setEditingId(officer.id); setForm({ name: officer.name, email: officer.email, department: officer.department, jurisdiction: officer.jurisdiction, workload: officer.workload, password: '' }) }} className="text-xs font-semibold text-blue-600">Edit</button><button onClick={() => { void officerService.setOfficerActive(officer.id, !officer.active).then(() => toast.success(`Officer ${officer.active ? 'deactivated' : 'activated'}.`), (error: unknown) => toast.error(getApiErrorMessage(error, 'Officer status could not be updated.'))) }} className="text-xs font-semibold text-slate-600">{officer.active ? 'Deactivate' : 'Activate'}</button></div></td>
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
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
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
      if (current) await departmentService.updateDepartment({ ...department, id: current.id })
      else await departmentService.createDepartment(department)
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
      <form onSubmit={(event) => void submit(event)} className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Department name" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        <input required value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Department code" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        <input required value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="Jurisdiction" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white">{editingId ? 'Save department' : 'Create department'}</button>
      </form>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {departments.map((department) => {
          const departmentComplaints = complaints.filter((complaint) => complaint.department === department.name)
          const resolutionRate = departmentComplaints.length
            ? Math.round(departmentComplaints.filter((complaint) => complaint.status === 'Resolved' || complaint.status === 'Closed').length / departmentComplaints.length * 100)
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
              <button onClick={() => { void departmentService.updateDepartment({ ...department, active: !department.active }).then(() => toast.success(`Department ${department.active ? 'deactivated' : 'activated'}.`), (error: unknown) => toast.error(getApiErrorMessage(error, 'Department status could not be updated.'))) }} className="text-slate-600">{department.active ? 'Deactivate' : 'Activate'}</button>
              <button onClick={() => {
                if (!window.confirm(`Delete ${department.name}?`)) return
                void departmentService.deleteDepartment(department.id).then(() => toast.success('Department deleted.'), (error: unknown) => toast.error(getApiErrorMessage(error, 'Department could not be deleted.')))
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
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || !form.department || !Number.isFinite(form.slaHours) || form.slaHours < 1) {
      toast.error('Enter a category, department and positive SLA target.')
      return
    }
    try {
      await categoryService.saveCategory({ ...form, active: true, id: editingId || undefined })
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
      <form onSubmit={(event) => void submit(event)} className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-5">
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
                void categoryService.deleteCategory(category.id).then(() => toast.success('Category deleted.'), (error: unknown) => toast.error(getApiErrorMessage(error, 'Category could not be deleted.')))
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
  const [priorityDraft, setPriorityDraft] = useState(prioritySlaHours)
  useEffect(() => setPriorityDraft(prioritySlaHours), [prioritySlaHours])
  const [departmentFilter, setDepartmentFilter] = useState('All')
  const openComplaints = complaints.filter((complaint) => complaint.status !== 'Resolved' && complaint.status !== 'Closed')
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
              if (hours !== category.slaHours) { void categoryService.saveCategory({ ...category, slaHours: hours }).then(() => toast.success('SLA target updated.'), (error: unknown) => toast.error(getApiErrorMessage(error, 'SLA target could not be saved.'))) }
            }} className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </label>
          <div className="mt-2 text-xs text-slate-500">Routed to {category.department}</div>
        </div>)}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(['Critical', 'High', 'Medium', 'Low'] as const).map((priority) => <label key={priority} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800">
          {priority} priority target
          <div className="mt-2 flex items-center gap-2 font-normal text-slate-500">
            <input type="number" min={1} value={priorityDraft[priority]} onChange={(event) => {
              const hours = Number(event.target.value)
              setPriorityDraft((current) => ({ ...current, [priority]: hours }))
            }} onBlur={() => {
              const hours = priorityDraft[priority]
              if (!Number.isFinite(hours) || hours < 1) { setPriorityDraft(prioritySlaHours); toast.error('SLA must be at least one hour.'); return }
              if (hours !== prioritySlaHours[priority]) void adminService.setPrioritySla(priority, hours).then(
                () => toast.success(`${priority} SLA target updated.`),
                (error: unknown) => toast.error(getApiErrorMessage(error, 'SLA could not be saved.')),
              )
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
      resolved: items.filter((complaint) => complaint.status === 'Resolved' || complaint.status === 'Closed').length,
      resolutionRate: items.length ? Math.round(items.filter((complaint) => complaint.status === 'Resolved' || complaint.status === 'Closed').length / items.length * 100) : 0,
    }
  })
  const exportReport = async () => {
    try {
      const blob = await adminService.exportReport(from || undefined, to || undefined)
      downloadBlob(blob, 'grievance-report.csv')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Report could not be exported.'))
    }
  }
  return (
    <>
      <SectionHeader eyebrow="Analytics" title="Analytics and reports" description="Derived from service complaint records for the selected date range." action={<button onClick={() => void exportReport()} className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">Export CSV</button>} />
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
      <SectionHeader eyebrow="Audit trail" title="Audit logs" description="Review recorded actions from the grievance service." />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Search size={16} className="text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user, role, action or complaint ID" className="w-full bg-transparent text-sm outline-none" />
        </label>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400"><th className="pb-3 pr-4">User</th><th className="pb-3 pr-4">Role</th><th className="pb-3 pr-4">Action</th><th className="pb-3 pr-4">Related complaint</th>            <th className="pb-3 pr-4">Request IP</th><th className="pb-3">Timestamp</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((event) => <tr key={event.id}>
                <td className="py-3 pr-4 font-medium text-slate-800">{event.actor}</td>
                <td className="py-3 pr-4 capitalize text-slate-600">{event.role}</td>
                <td className="py-3 pr-4 text-slate-600">{event.action}</td>
                <td className="py-3 pr-4 text-slate-600">{event.relatedComplaintId ?? '—'}</td>
                <td className="py-3 pr-4 text-slate-600">{event.ipAddress}</td>
                <td className="py-3 text-slate-600">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.createdAt))}</td>
              </tr>)}
              {!filtered.length ? <tr><td colSpan={6} className="py-8 text-center text-slate-500">No audit activity found.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-400">Audit records are returned by the service. An IP address is shown only when the service recorded one.</p>
      </div>
    </>
  )
}

function HelpSupport() {
  return (
    <>
      <SectionHeader eyebrow="Support" title="Help & support" description="Guidance for using the grievance portal." />
      <div className="max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm leading-7 text-slate-600">
        <p>Submit a complaint with its location and supporting details. Your reference ID can be used on the Track Complaint page to review status updates.</p>
        <p>Complaint records and account data are managed by the connected grievance service. Automated analysis is unavailable unless a provider is configured; decisions remain with authorized staff.</p>
        <p>Support contact details have not been configured for this service.</p>
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
