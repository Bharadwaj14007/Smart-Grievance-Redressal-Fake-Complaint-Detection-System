import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Role = 'citizen' | 'officer' | 'admin'

export type ComplaintStatus =
  | 'Pending'
  | 'Assigned'
  | 'In Progress'
  | 'Under Review'
  | 'Resolved'
  | 'Escalated'

export type Complaint = {
  id: string
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
  riskScore: number
  ai: {
    predictedCategory: string
    suggestedDepartment: string
    duplicateWarning: string
    confidence: number
    imageRisk: number
  }
  createdAt: string
  lastUpdated: string
}

export type NotificationItem = {
  id: string
  type: 'success' | 'info' | 'warning'
  message: string
  read: boolean
  createdAt: string
  complaintId?: string
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
}

export type SessionUser = {
  email: string
  name: string
  role: Role
}

type AppState = {
  session: SessionUser | null
  complaints: Complaint[]
  notifications: NotificationItem[]
  departments: Department[]
  officers: Officer[]
  citizens: CitizenProfile[]
  login: (email: string, password: string) => SessionUser | null
  logout: () => void
  createComplaint: (complaint: Omit<Complaint, 'id' | 'createdAt' | 'lastUpdated'>) => Complaint
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  updateComplaintStatus: (id: string, status: ComplaintStatus, officer?: string) => void
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
    riskScore: 24,
    ai: {
      predictedCategory: 'Sanitation',
      suggestedDepartment: 'Municipal Corporation',
      duplicateWarning: 'Similar complaint found in same vicinity.',
      confidence: 92,
      imageRisk: 18,
    },
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
    riskScore: 12,
    ai: {
      predictedCategory: 'Street Lighting',
      suggestedDepartment: 'Electrical Services',
      duplicateWarning: 'No duplicate signal detected.',
      confidence: 89,
      imageRisk: 9,
    },
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
    riskScore: 8,
    ai: {
      predictedCategory: 'Waste Management',
      suggestedDepartment: 'Municipal Corporation',
      duplicateWarning: 'No duplicate signal detected.',
      confidence: 94,
      imageRisk: 5,
    },
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
  session: { email: 'citizen@example.com', name: 'Aarav Mehta', role: 'citizen' as Role },
  complaints: seedComplaints,
  notifications: seedNotifications,
  departments: seedDepartments,
  officers: seedOfficers,
  citizens: seedCitizens,
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...seedState,
      login: (email: string, password: string) => {
        if (password !== 'Demo@123') {
          return null
        }

        const normalizedEmail = email.trim().toLowerCase()
        const roleMap: Record<string, Role> = {
          'citizen@example.com': 'citizen',
          'officer@example.com': 'officer',
          'admin@example.com': 'admin',
        }

        const role = roleMap[normalizedEmail]
        if (!role) return null

        const nameMap: Record<Role, string> = {
          citizen: 'Aarav Mehta',
          officer: 'Priya Sharma',
          admin: 'Rohan Kapoor',
        }

        const session = { email: normalizedEmail, name: nameMap[role], role }
        set({ session })
        return session
      },
      logout: () => set({ session: null }),
      createComplaint: (complaintInput) => {
        const complaint: Complaint = {
          ...complaintInput,
          id: `GRV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          remarks: complaintInput.remarks.length ? complaintInput.remarks : ['Complaint filed and awaiting routing.'],
        }

        set((state) => ({
          complaints: [complaint, ...state.complaints],
          notifications: [
            {
              id: crypto.randomUUID(),
              type: 'info',
              message: `Your complaint ${complaint.id} was submitted successfully.`,
              read: false,
              createdAt: new Date().toISOString(),
              complaintId: complaint.id,
            },
            ...state.notifications,
          ],
        }))

        return complaint
      },
      markNotificationRead: (id: string) => {
        set((state) => ({
          notifications: state.notifications.map((item) =>
            item.id === id ? { ...item, read: true } : item,
          ),
        }))
      },
      markAllNotificationsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((item) => ({ ...item, read: true })),
        }))
      },
      updateComplaintStatus: (id: string, status: ComplaintStatus, officer?: string) => {
        set((state) => ({
          complaints: state.complaints.map((complaint) =>
            complaint.id === id
              ? {
                  ...complaint,
                  status,
                  assignedOfficer: officer ?? complaint.assignedOfficer,
                  lastUpdated: new Date().toISOString(),
                  remarks: [...complaint.remarks, `Status updated to ${status}.`],
                }
              : complaint,
          ),
        }))
      },
      resetDemoData: () => set({ ...seedState }),
    }),
    {
      name: 'nagrik-setu-demo-state',
      partialize: (state) => ({
        session: state.session,
        complaints: state.complaints,
        notifications: state.notifications,
        departments: state.departments,
        officers: state.officers,
        citizens: state.citizens,
      }),
    },
  ),
)
