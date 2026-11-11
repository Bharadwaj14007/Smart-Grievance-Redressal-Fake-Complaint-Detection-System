import { create } from 'zustand'

export type Role = 'citizen' | 'officer' | 'admin'

export type ComplaintStatus =
  | 'Pending'
  | 'AI Analysis'
  | 'Assigned'
  | 'In Progress'
  | 'Under Review'
  | 'Resolved'
  | 'Escalated'
  | 'Closed'

export type Complaint = {
  id: string
  recordId?: string
  title: string
  description: string
  category: string
  subcategory: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  incidentDate: string
  address: string
  state: string
  district: string
  city: string
  pincode: string
  latitude: number
  longitude: number
  remarks: string[]
  consent: boolean
  status: ComplaintStatus
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
  department: string
  assignedOfficer: string
  citizenName: string
  citizenEmail: string
  images: string[]
  imageIds?: string[]
  resolutionEvidenceIds?: string[]
  feedback?: { rating: number; comment?: string | null; createdAt: string }
  aiStatus?: string
  createdAt: string
  lastUpdated: string
  statusHistory?: { status: ComplaintStatus; message: string; createdAt: string }[]
  resolutionImages?: string[]
  duplicateGroupId?: string
  duplicateDecision?: 'linked' | 'separate' | 'manual-review'
}

export type NotificationItem = {
  id: string
  type: 'success' | 'info' | 'warning'
  message: string
  read: boolean
  createdAt: string
  complaintId?: string
  recipientEmail?: string
}

export type Department = {
  id: string
  name: string
  code: string
  location: string
  resolutionRate: number
  totalComplaints: number
  pendingComplaints: number
  resolvedComplaints: number
  active: boolean
}

export type Officer = {
  id: string
  name: string
  email: string
  department: string
  jurisdiction: string
  active: boolean
  workload: number
  phone?: string
  state?: string
  district?: string
  city?: string
  address?: string
  pincode?: string
}

export type ComplaintCategory = {
  id: string
  name: string
  department: string
  defaultPriority: 'Low' | 'Medium' | 'High' | 'Critical'
  slaHours: number
  active: boolean
}

export type CitizenProfile = {
  id: string
  name: string
  email: string
  phone: string
  state: string
  district: string
  city: string
  joinedAt: string
  active: boolean
  address?: string
  pincode?: string
}

export type SessionUser = {
  email: string
  name: string
  role: Role
}

export type AuditEvent = {
  id: string
  actor: string
  role: Role
  action: string
  relatedComplaintId?: string
  createdAt: string
  ipAddress: string
}

type DemoAccount = { email: string; password: string; name: string; role: Role }

type AppState = {
  session: SessionUser | null
  complaints: Complaint[]
  notifications: NotificationItem[]
  departments: Department[]
  categories: ComplaintCategory[]
  prioritySlaHours: Record<Complaint['priority'], number>
  officers: Officer[]
  citizens: CitizenProfile[]
  auditLogs: AuditEvent[]
  demoAccounts: DemoAccount[]
  dashboardStats?: {
    complaints: number
    citizens: number
    officers: number
    statuses: Record<string, number>
  }
  login: (email: string, password: string) => SessionUser | null
  registerCitizen: (name: string, email: string, password: string) => { user: SessionUser | null; error?: string }
  logout: () => void
  createComplaint: (complaint: Omit<Complaint, 'id' | 'createdAt' | 'lastUpdated'>) => Complaint
  updateProfile: (profile: Partial<CitizenProfile>) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: (recipientEmail?: string) => void
  updateComplaintStatus: (id: string, status: ComplaintStatus, officer?: string) => void
  assignComplaint: (id: string, department: string, officer?: string) => void
  addComplaintRemark: (id: string, remark: string) => void
  addResolutionImage: (id: string, image: string) => void
  reviewDuplicate: (id: string, decision: 'linked' | 'separate' | 'manual-review', matchId?: string) => void
  setCitizenActive: (id: string, active: boolean) => void
  saveOfficer: (officer: Omit<Officer, 'id'> & { id?: string }) => void
  setOfficerActive: (id: string, active: boolean) => void
  saveDepartment: (department: Omit<Department, 'id'> & { id?: string }) => void
  deleteDepartment: (id: string) => void
  saveCategory: (category: Omit<ComplaintCategory, 'id'> & { id?: string }) => void
  deleteCategory: (id: string) => void
  setPrioritySla: (priority: Complaint['priority'], hours: number) => void
  addAuditEvent: (action: string, relatedComplaintId?: string) => void
  resetDemoData: () => void
}

const seedDepartments: Department[] = [
  {
    id: 'dept-1',
    name: 'Municipal Corporation',
    code: 'MCD-01',
    location: 'Gurugram District',
    resolutionRate: 78,
    totalComplaints: 142,
    pendingComplaints: 32,
    resolvedComplaints: 110,
    active: true,
  },
  {
    id: 'dept-2',
    name: 'Roads & Transport',
    code: 'RTH-04',
    location: 'Gurugram District',
    resolutionRate: 71,
    totalComplaints: 86,
    pendingComplaints: 18,
    resolvedComplaints: 68,
    active: true,
  },
  {
    id: 'dept-3',
    name: 'Electrical Services',
    code: 'ELC-07',
    location: 'Gurugram District',
    resolutionRate: 68,
    totalComplaints: 64,
    pendingComplaints: 21,
    resolvedComplaints: 43,
    active: true,
  },
  {
    id: 'dept-4',
    name: 'Water & Sanitation',
    code: 'WTR-02',
    location: 'Gurugram District',
    resolutionRate: 62,
    totalComplaints: 53,
    pendingComplaints: 16,
    resolvedComplaints: 37,
    active: true,
  },
]

const seedOfficers: Officer[] = [
  { id: 'officer-1', name: 'Priya Sharma', email: 'officer@example.com', department: 'Municipal Corporation', jurisdiction: 'Gurugram East', active: true, workload: 14 },
  { id: 'officer-2', name: 'Amit Verma', email: 'amit@example.com', department: 'Roads & Transport', jurisdiction: 'Gurugram West', active: true, workload: 11 },
  { id: 'officer-3', name: 'Rhea Nair', email: 'rhea@example.com', department: 'Electrical Services', jurisdiction: 'Central Zone', active: true, workload: 9 },
]

const seedCategories: ComplaintCategory[] = [
  { id: 'category-sanitation', name: 'Sanitation', department: 'Municipal Corporation', defaultPriority: 'Medium', slaHours: 72, active: true },
  { id: 'category-street-lighting', name: 'Street Lighting', department: 'Electrical Services', defaultPriority: 'Medium', slaHours: 48, active: true },
  { id: 'category-roads', name: 'Roads & Transport', department: 'Roads & Transport', defaultPriority: 'High', slaHours: 48, active: true },
  { id: 'category-water', name: 'Water Supply', department: 'Water & Sanitation', defaultPriority: 'High', slaHours: 24, active: true },
  { id: 'category-waste', name: 'Waste Management', department: 'Municipal Corporation', defaultPriority: 'Medium', slaHours: 72, active: true },
]

const seedCitizens: CitizenProfile[] = [
  { id: 'citizen-1', name: 'Aarav Mehta', email: 'citizen@example.com', phone: '+91 9876543210', state: 'Haryana', district: 'Gurugram', city: 'Gurugram', joinedAt: '2024-02-12', active: true },
  { id: 'citizen-2', name: 'Neha Singh', email: 'neha@example.com', phone: '+91 9876540001', state: 'Haryana', district: 'Gurugram', city: 'Sushant Lok', joinedAt: '2024-04-21', active: true },
  { id: 'citizen-3', name: 'Rohit Kumar', email: 'rohit@example.com', phone: '+91 9845123012', state: 'Haryana', district: 'Gurugram', city: 'DLF Phase 2', joinedAt: '2024-05-18', active: true },
]

const seedComplaints: Complaint[] = [
  {
    id: 'GRV-2026-00482',
    title: 'Open drain near Sector 14 market',
    description: 'The drainage cover is missing and wastewater is spilling over onto the pedestrian path.',
    category: 'Sanitation',
    subcategory: 'Drainage',
    severity: 'High',
    incidentDate: '2026-10-28T09:30:00',
    address: 'Sector 14 Market Road',
    state: 'Haryana',
    district: 'Gurugram',
    city: 'Gurugram',
    pincode: '122002',
    latitude: 28.4595,
    longitude: 77.0266,
    remarks: ['Inspection scheduled for 11:00 AM.', 'Citizen provided additional image evidence.'],
    consent: true,
    status: 'In Progress',
    priority: 'High',
    department: 'Municipal Corporation',
    assignedOfficer: 'Priya Sharma',
    citizenName: 'Aarav Mehta',
    citizenEmail: 'citizen@example.com',
    images: [],
    createdAt: '2026-10-29T08:15:00',
    lastUpdated: '2026-10-30T11:10:00',
  },
  {
    id: 'GRV-2026-00471',
    title: 'Streetlights not working on Park Avenue',
    description: 'Several streetlights are out near the residential blocks, creating safety concerns after dusk.',
    category: 'Street Lighting',
    subcategory: 'Public lighting',
    severity: 'Medium',
    incidentDate: '2026-10-24T18:15:00',
    address: 'Park Avenue Road',
    state: 'Haryana',
    district: 'Gurugram',
    city: 'Gurugram',
    pincode: '122001',
    latitude: 28.4658,
    longitude: 77.0381,
    remarks: ['Awaiting electrical team confirmation.'],
    consent: true,
    status: 'Assigned',
    priority: 'Medium',
    department: 'Electrical Services',
    assignedOfficer: 'Rhea Nair',
    citizenName: 'Neha Singh',
    citizenEmail: 'neha@example.com',
    images: [],
    createdAt: '2026-10-25T11:45:00',
    lastUpdated: '2026-10-28T16:30:00',
  },
  {
    id: 'GRV-2026-00438',
    title: 'Irregular garbage collection',
    description: 'Garbage pickup has been irregular in the neighborhood for more than two weeks.',
    category: 'Waste Management',
    subcategory: 'Garbage pickup',
    severity: 'Medium',
    incidentDate: '2026-10-18T07:00:00',
    address: 'DLF Phase 2',
    state: 'Haryana',
    district: 'Gurugram',
    city: 'Gurugram',
    pincode: '122002',
    latitude: 28.4763,
    longitude: 77.0921,
    remarks: ['Resolved by municipal workers after cleaning round.'],
    consent: true,
    status: 'Resolved',
    priority: 'Medium',
    department: 'Municipal Corporation',
    assignedOfficer: 'Priya Sharma',
    citizenName: 'Rohit Kumar',
    citizenEmail: 'rohit@example.com',
    images: [],
    createdAt: '2026-10-18T09:10:00',
    lastUpdated: '2026-10-21T14:20:00',
  },
]

const seedNotifications: NotificationItem[] = [
  {
    id: 'notice-1',
    type: 'success',
    message: 'Your complaint GRV-2026-00438 was marked resolved.',
    read: false,
    createdAt: '2026-10-21T14:30:00',
    complaintId: 'GRV-2026-00438',
  },
  {
    id: 'notice-2',
    type: 'info',
    message: 'Officer Priya Sharma has accepted GRV-2026-00482 for review.',
    read: true,
    createdAt: '2026-10-29T09:45:00',
    complaintId: 'GRV-2026-00482',
  },
  {
    id: 'notice-3',
    type: 'warning',
    message: 'Additional evidence is requested for streetlight complaint GRV-2026-00471.',
    read: false,
    createdAt: '2026-10-30T10:20:00',
    complaintId: 'GRV-2026-00471',
  },
]

const seedState = {
  session: null,
  complaints: seedComplaints,
  notifications: seedNotifications,
  departments: seedDepartments,
  categories: seedCategories,
  prioritySlaHours: { Critical: 12, High: 24, Medium: 72, Low: 120 },
  officers: seedOfficers,
  citizens: seedCitizens,
  auditLogs: [] as AuditEvent[],
  demoAccounts: [] as DemoAccount[],
}

export const isDemoMode = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true'

const emptyState = {
  session: null,
  complaints: [] as Complaint[],
  notifications: [] as NotificationItem[],
  departments: [] as Department[],
  categories: [] as ComplaintCategory[],
  prioritySlaHours: { Critical: 12, High: 24, Medium: 72, Low: 120 },
  officers: [] as Officer[],
  citizens: [] as CitizenProfile[],
  auditLogs: [] as AuditEvent[],
  demoAccounts: [] as DemoAccount[],
}

const initialState = isDemoMode ? seedState : emptyState

export const useAppStore = create<AppState>()(
    (set, get) => ({
      ...initialState,
      login: (email: string, password: string) => {
        const normalizedEmail = email.trim().toLowerCase()
        const roleMap: Record<string, Role> = {
          'citizen@example.com': 'citizen',
          'officer@example.com': 'officer',
          'admin@example.com': 'admin',
        }

        const nameMap: Record<Role, string> = {
          citizen: 'Aarav Mehta',
          officer: 'Priya Sharma',
          admin: 'Rohan Kapoor',
        }
        const role = roleMap[normalizedEmail]
        const account = get().demoAccounts.find((item) => item.email === normalizedEmail)
        let session: SessionUser
        if (account && account.password === password) {
          session = { email: account.email, name: account.name, role: account.role }
        } else if (role && password === 'Demo@123') {
          session = { email: normalizedEmail, name: nameMap[role], role }
        } else {
          return null
        }
        if (
          (session.role === 'citizen' && get().citizens.some((citizen) => citizen.email === session.email && !citizen.active)) ||
          (session.role === 'officer' && get().officers.some((officer) => officer.email === session.email && !officer.active))
        ) return null
        set({ session })
        return session
      },
      registerCitizen: (name, email, password) => {
        const normalizedEmail = email.trim().toLowerCase()
        if (get().citizens.some((citizen) => citizen.email === normalizedEmail) || get().demoAccounts.some((account) => account.email === normalizedEmail)) {
          return { user: null, error: 'An account with this email already exists.' }
        }
        if (name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || password.length < 8) {
          return { user: null, error: 'Provide a valid name, email and password of at least 8 characters.' }
        }
        const user: SessionUser = { email: normalizedEmail, name: name.trim(), role: 'citizen' }
        set((state) => ({
          session: user,
          demoAccounts: [...state.demoAccounts, { ...user, password }],
          citizens: [...state.citizens, {
            id: crypto.randomUUID(),
            name: user.name,
            email: user.email,
            phone: '',
            state: '',
            district: '',
            city: '',
            joinedAt: new Date().toISOString(),
            active: true,
          }],
        }))
        return { user }
      },
      logout: () => set({ session: null }),
      createComplaint: (complaintInput) => {
        const now = new Date().toISOString()
        const year = new Date(now).getFullYear()
        const prefix = `GRV-${year}-`
        const latestSequence = get().complaints.reduce((max, existing) => {
          if (!existing.id.startsWith(prefix)) return max
          const sequence = Number(existing.id.slice(prefix.length))
          return Number.isFinite(sequence) ? Math.max(max, sequence) : max
        }, 0)
        const complaint: Complaint = {
          ...complaintInput,
          id: `${prefix}${String(latestSequence + 1).padStart(6, '0')}`,
          createdAt: now,
          lastUpdated: now,
          remarks: complaintInput.remarks.length ? complaintInput.remarks : ['Complaint filed and awaiting routing.'],
          statusHistory: [{ status: 'Pending', message: 'Complaint submitted.', createdAt: now }],
        }

        set((state) => ({
          complaints: [complaint, ...state.complaints],
          notifications: [
            {
              id: crypto.randomUUID(),
              type: 'info',
              message: `Your complaint ${complaint.id} was submitted successfully.`,
              read: false,
              createdAt: now,
              complaintId: complaint.id,
              recipientEmail: complaint.citizenEmail,
            },
            ...state.notifications,
          ],
        }))
        get().addAuditEvent('Submitted complaint', complaint.id)

        return complaint
      },
      updateProfile: (profile) => {
        const session = get().session
        if (!session) return
        const currentCitizen = get().citizens.find((citizen) => citizen.email === session.email)
        const currentOfficer = get().officers.find((officer) => officer.email === session.email)
        const updatedCitizen = currentCitizen ? {
          ...currentCitizen,
          name: profile.name?.trim() || currentCitizen.name,
          phone: profile.phone ?? currentCitizen.phone,
          address: profile.address ?? currentCitizen.address,
          state: profile.state ?? currentCitizen.state,
          district: profile.district ?? currentCitizen.district,
          city: profile.city ?? currentCitizen.city,
          pincode: profile.pincode ?? currentCitizen.pincode,
        } : undefined
        const updatedOfficer = currentOfficer ? {
          ...currentOfficer,
          name: profile.name?.trim() || currentOfficer.name,
          phone: profile.phone ?? currentOfficer.phone,
          address: profile.address ?? currentOfficer.address,
          state: profile.state ?? currentOfficer.state,
          district: profile.district ?? currentOfficer.district,
          city: profile.city ?? currentOfficer.city,
          pincode: profile.pincode ?? currentOfficer.pincode,
        } : undefined
        const updatedName = profile.name?.trim() || session.name
        set((state) => ({
          session: { ...session, name: updatedName },
          citizens: updatedCitizen ? state.citizens.map((citizen) => citizen.id === updatedCitizen.id ? updatedCitizen : citizen) : state.citizens,
          officers: updatedOfficer ? state.officers.map((officer) => officer.id === updatedOfficer.id ? updatedOfficer : officer) : state.officers,
          complaints: currentOfficer && currentOfficer.name !== updatedName
            ? state.complaints.map((complaint) => complaint.assignedOfficer === currentOfficer.name ? { ...complaint, assignedOfficer: updatedName } : complaint)
            : state.complaints,
        }))
        get().addAuditEvent('Updated profile')
      },
      markNotificationRead: (id: string) => {
        set((state) => ({
          notifications: state.notifications.map((item) =>
            item.id === id ? { ...item, read: true } : item,
          ),
        }))
      },
      markAllNotificationsRead: (recipientEmail) => {
        set((state) => ({
          notifications: state.notifications.map((item) => {
            if (!recipientEmail) return { ...item, read: true }
            const belongsToRecipient = item.recipientEmail === recipientEmail ||
              (!item.recipientEmail && item.complaintId && state.complaints.some((complaint) => complaint.id === item.complaintId && complaint.citizenEmail === recipientEmail))
            return belongsToRecipient ? { ...item, read: true } : item
          }),
        }))
      },
      updateComplaintStatus: (id: string, status: ComplaintStatus, officer?: string) => {
        if (!get().complaints.some((complaint) => complaint.id === id)) return
        const now = new Date().toISOString()
        const actor = get().session
        set((state) => ({
          complaints: state.complaints.map((complaint) =>
            complaint.id === id
              ? {
                  ...complaint,
                  status,
                  assignedOfficer: officer ?? complaint.assignedOfficer,
                  lastUpdated: now,
                  remarks: [...complaint.remarks, `Status updated to ${status}.`],
                  statusHistory: [...(complaint.statusHistory ?? []), { status, message: `Status updated to ${status}.`, createdAt: now }],
                }
              : complaint,
          ),
          notifications: actor?.role === 'citizen' ? state.notifications : [
            {
              id: crypto.randomUUID(),
              type: status === 'Resolved' ? 'success' : 'info',
              message: `Complaint ${id} status changed to ${status}.`,
              read: false,
              createdAt: now,
              complaintId: id,
              recipientEmail: state.complaints.find((complaint) => complaint.id === id)?.citizenEmail,
            },
            ...state.notifications,
          ],
        }))
        const complaint = get().complaints.find((item) => item.id === id)
        if (complaint) get().addAuditEvent(`Changed complaint status to ${status}`, id)
      },
      assignComplaint: (id, department, officer) => {
        const existing = get().complaints.find((complaint) => complaint.id === id)
        if (!existing) return
        const selectedOfficer = officer ?? (
          department === existing.department
            ? existing.assignedOfficer
            : get().officers.find((item) => item.active && item.department === department)?.name ?? 'Unassigned'
        )
        const now = new Date().toISOString()
        const message = `Assigned to ${department}${selectedOfficer === 'Unassigned' ? '' : ` · ${selectedOfficer}`}.`
        set((state) => ({
          complaints: state.complaints.map((complaint) => complaint.id === id ? {
            ...complaint,
            department,
            assignedOfficer: selectedOfficer,
            status: selectedOfficer === 'Unassigned' ? complaint.status : 'Assigned',
            lastUpdated: now,
            remarks: [...complaint.remarks, message],
            statusHistory: [...(complaint.statusHistory ?? []), {
              status: selectedOfficer === 'Unassigned' ? complaint.status : 'Assigned',
              message,
              createdAt: now,
            }],
          } : complaint),
          notifications: [{
            id: crypto.randomUUID(),
            type: 'info',
            message: `Complaint ${id} was routed to ${department}.`,
            read: false,
            createdAt: now,
            complaintId: id,
            recipientEmail: existing.citizenEmail,
          }, ...state.notifications],
        }))
        get().addAuditEvent(`Assigned complaint to ${department}`, id)
      },
      addComplaintRemark: (id, remark) => {
        if (!get().complaints.some((complaint) => complaint.id === id)) return
        const now = new Date().toISOString()
        set((state) => ({
          complaints: state.complaints.map((complaint) => complaint.id === id
            ? {
                ...complaint,
                remarks: [...complaint.remarks, remark],
                lastUpdated: now,
                statusHistory: [...(complaint.statusHistory ?? []), { status: complaint.status, message: remark, createdAt: now }],
              }
            : complaint),
        }))
        get().addAuditEvent('Added investigation remark', id)
      },
      addResolutionImage: (id, image) => {
        const now = new Date().toISOString()
        if (!get().complaints.some((complaint) => complaint.id === id)) return
        set((state) => ({
          complaints: state.complaints.map((complaint) => complaint.id === id
            ? {
                ...complaint,
                resolutionImages: [...(complaint.resolutionImages ?? []), image],
                lastUpdated: now,
                remarks: [...complaint.remarks, 'Resolution evidence uploaded.'],
                statusHistory: [...(complaint.statusHistory ?? []), { status: complaint.status, message: 'Resolution evidence uploaded.', createdAt: now }],
              }
            : complaint),
        }))
        get().addAuditEvent('Uploaded resolution evidence', id)
      },
      reviewDuplicate: (id, decision, matchId) => {
        const complaint = get().complaints.find((item) => item.id === id)
        if (!complaint) return
        let groupId = complaint.duplicateGroupId
        if (decision === 'linked') {
          const match = matchId ? get().complaints.find((item) => item.id === matchId) : undefined
          if (!match || match.id === id) throw new Error('Choose a different complaint to link.')
          groupId = groupId ?? match.duplicateGroupId ?? crypto.randomUUID()
        }
        const now = new Date().toISOString()
        const message = decision === 'linked'
          ? `Duplicate review: linked to ${matchId} as the same incident.`
          : decision === 'separate'
            ? 'Duplicate review: marked as a separate issue after manual review.'
            : 'Duplicate review: forwarded for manual assessment.'
        set((state) => ({
          complaints: state.complaints.map((item) => {
            if (item.id === id || (decision === 'linked' && item.id === matchId)) {
              return {
                ...item,
                duplicateDecision: decision,
                ...(decision === 'linked' ? { duplicateGroupId: groupId } : {}),
                remarks: [...item.remarks, message],
                lastUpdated: now,
                statusHistory: [...(item.statusHistory ?? []), { status: item.status, message, createdAt: now }],
              }
            }
            return item
          }),
        }))
        get().addAuditEvent(`Recorded duplicate review: ${decision}`, id)
      },
      setCitizenActive: (id, active) => {
        set((state) => ({ citizens: state.citizens.map((citizen) => citizen.id === id ? { ...citizen, active } : citizen) }))
        get().addAuditEvent(`${active ? 'Activated' : 'Deactivated'} citizen account`)
      },
      saveOfficer: (officer) => {
        const id = officer.id ?? crypto.randomUUID()
        if (get().officers.some((item) => item.id !== id && item.email.toLowerCase() === officer.email.trim().toLowerCase())) {
          throw new Error('An officer with this email already exists.')
        }
        set((state) => ({
          officers: officer.id
            ? state.officers.map((item) => item.id === id ? { ...officer, id } : item)
            : [...state.officers, { ...officer, id }],
        }))
        get().addAuditEvent(`${officer.id ? 'Updated' : 'Created'} officer`)
      },
      setOfficerActive: (id, active) => {
        set((state) => ({ officers: state.officers.map((officer) => officer.id === id ? { ...officer, active } : officer) }))
        get().addAuditEvent(`${active ? 'Activated' : 'Deactivated'} officer`)
      },
      saveDepartment: (department) => {
        const id = department.id ?? crypto.randomUUID()
        const existing = department.id ? get().departments.find((item) => item.id === department.id) : undefined
        if (get().departments.some((item) => item.id !== id && (item.name.toLowerCase() === department.name.trim().toLowerCase() || item.code.toLowerCase() === department.code.trim().toLowerCase()))) {
          throw new Error('Department name and code must be unique.')
        }
        set((state) => ({
          departments: department.id
            ? state.departments.map((item) => item.id === id ? { ...department, id } : item)
            : [...state.departments, { ...department, id }],
          ...(existing && existing.name !== department.name ? {
            officers: state.officers.map((item) => item.department === existing.name ? { ...item, department: department.name } : item),
            categories: state.categories.map((item) => item.department === existing.name ? { ...item, department: department.name } : item),
            complaints: state.complaints.map((item) => item.department === existing.name ? { ...item, department: department.name } : item),
          } : {}),
        }))
        get().addAuditEvent(`${department.id ? 'Updated' : 'Created'} department`)
      },
      deleteDepartment: (id) => {
        const department = get().departments.find((item) => item.id === id)
        if (!department) return
        if (
          get().complaints.some((complaint) => complaint.department === department.name) ||
          get().officers.some((officer) => officer.department === department.name) ||
          get().categories.some((category) => category.department === department.name)
        ) {
          throw new Error('Cannot delete a department assigned to complaints, officers, or categories.')
        }
        set((state) => ({ departments: state.departments.filter((item) => item.id !== id) }))
        get().addAuditEvent('Deleted department')
      },
      saveCategory: (category) => {
        const id = category.id ?? crypto.randomUUID()
        const existing = category.id ? get().categories.find((item) => item.id === category.id) : undefined
        if (get().categories.some((item) => item.id !== id && item.name.toLowerCase() === category.name.trim().toLowerCase())) {
          throw new Error('Category name must be unique.')
        }
        set((state) => ({
          categories: category.id
            ? state.categories.map((item) => item.id === id ? { ...category, id } : item)
            : [...state.categories, { ...category, id }],
          ...(existing && existing.name !== category.name ? {
            complaints: state.complaints.map((item) => item.category === existing.name
              ? { ...item, category: category.name }
              : item),
          } : {}),
        }))
        get().addAuditEvent(`${category.id ? 'Updated' : 'Created'} complaint category`)
      },
      deleteCategory: (id) => {
        const category = get().categories.find((item) => item.id === id)
        if (!category) return
        if (get().complaints.some((complaint) => complaint.category === category.name)) {
          throw new Error('Cannot delete a category used by complaint records.')
        }
        set((state) => ({ categories: state.categories.filter((item) => item.id !== id) }))
        get().addAuditEvent('Deleted complaint category')
      },
      setPrioritySla: (priority, hours) => {
        if (!Number.isFinite(hours) || hours < 1) throw new Error('SLA must be at least one hour.')
        set((state) => ({ prioritySlaHours: { ...state.prioritySlaHours, [priority]: hours } }))
        get().addAuditEvent(`Updated ${priority} priority SLA to ${hours} hours`)
      },
      addAuditEvent: (action, relatedComplaintId) => {
        const actor = get().session
        if (!actor) return
        set((state) => ({
          auditLogs: [{
            id: crypto.randomUUID(),
            actor: actor.name,
            role: actor.role,
            action,
            relatedComplaintId,
            createdAt: new Date().toISOString(),
            ipAddress: '192.0.2.10',
          }, ...state.auditLogs],
        }))
      },
      resetDemoData: () => set({ ...initialState }),
    }),
)
