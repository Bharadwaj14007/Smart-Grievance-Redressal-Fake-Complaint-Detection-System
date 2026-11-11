export type ApiEnvelope<T> = { success: boolean; data: T; message?: string }

export type ApiUser = {
  id: string
  email: string
  role: 'CITIZEN' | 'OFFICER' | 'ADMIN'
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  createdAt?: string
  citizenProfile?: {
    fullName: string
    phone?: string | null
    state?: string | null
    district?: string | null
    city?: string | null
    address?: string | null
    pincode?: string | null
  } | null
  officerProfile?: {
    fullName: string
    departmentId?: string | null
    department?: { id: string; name: string } | null
    jurisdiction?: string | null
    phone?: string | null
  } | null
  assignments?: { id: string }[]
  _count?: { complaints: number }
}

export type ApiComplaint = {
  id: string
  trackingId: string
  title: string
  description: string
  severity: string
  priority: string
  status: string
  createdAt: string
  updatedAt?: string
  incidentAt?: string | null
  consent: boolean
  category?: { id: string; name: string; slaHours?: number } | null
  department?: { id: string; name: string } | null
  citizen?: { email: string; citizenProfile?: { fullName: string } | null } | null
  location?: {
    address: string
    state: string
    district: string
    city: string
    pincode: string
    latitude: number
    longitude: number
  } | null
  assignments?: { officer?: { email: string; officerProfile?: { fullName: string } | null } }[]
  images?: { id: string; contentType?: string; sizeBytes?: number; createdAt?: string }[]
  resolutionEvidence?: { id: string; contentType?: string; sizeBytes?: number; createdAt?: string }[]
  history?: { toStatus: string; note?: string | null; createdAt: string }[]
  notes?: { body: string; createdAt: string; isPublic?: boolean }[]
  aiAnalyses?: { status: string }[]
  feedback?: { rating: number; comment?: string | null; createdAt: string } | null
}

export type ApiNotification = {
  id: string
  type: string
  message: string
  readAt?: string | null
  createdAt: string
  complaintId?: string | null
}
