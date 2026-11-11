import type {
  AuditEvent,
  CitizenProfile,
  Complaint,
  ComplaintCategory,
  ComplaintStatus,
  Department,
  NotificationItem,
  Officer,
  Role,
  SessionUser,
} from '../store/useAppStore'
import type { ApiComplaint, ApiEnvelope, ApiNotification, ApiUser } from '../../shared/api-contracts'
export type { ApiComplaint, ApiEnvelope, ApiNotification, ApiUser } from '../../shared/api-contracts'

export type ApiDepartment = {
  id: string
  name: string
  code: string
  state?: string | null
  district?: string | null
  jurisdiction?: string | null
  active?: boolean
  _count?: { complaints: number }
  complaints?: { status: string }[]
}

export type ApiCategory = {
  id: string
  name: string
  active?: boolean
  defaultPriority: string
  slaHours: number
  department?: { id: string; name: string } | null
  departmentId?: string | null
}

export type ApiAuditEvent = {
  id: string
  action: string
  entityId?: string | null
  createdAt: string
  ipAddress?: string | null
  actor?: { email: string; role: string }
}

export function mapRole(role: ApiUser['role']): Role {
  return role === 'CITIZEN' ? 'citizen' : role === 'OFFICER' ? 'officer' : 'admin'
}

export function mapSession(user: ApiUser): SessionUser {
  return {
    email: user.email,
    name: user.citizenProfile?.fullName ?? user.officerProfile?.fullName ?? user.email,
    role: mapRole(user.role),
  }
}

export function mapStatus(status: string): ComplaintStatus {
  switch (status) {
    case 'AI_ANALYSIS': return 'AI Analysis'
    case 'ASSIGNED': return 'Assigned'
    case 'UNDER_INVESTIGATION': return 'Under Review'
    case 'IN_PROGRESS': return 'In Progress'
    case 'RESOLVED': return 'Resolved'
    case 'CLOSED': return 'Closed'
    case 'ESCALATED': return 'Escalated'
    default: return 'Pending'
  }
}

export function toApiStatus(status: ComplaintStatus) {
  switch (status) {
    case 'AI Analysis': return 'AI_ANALYSIS'
    case 'Assigned': return 'ASSIGNED'
    case 'Under Review': return 'UNDER_INVESTIGATION'
    case 'In Progress': return 'IN_PROGRESS'
    case 'Resolved': return 'RESOLVED'
    case 'Closed': return 'CLOSED'
    case 'Escalated': return 'ESCALATED'
    default: return 'SUBMITTED'
  }
}

function mapPriority(priority: string): Complaint['priority'] {
  const normalized = priority.toLowerCase()
  return normalized === 'critical' ? 'Critical' : normalized === 'high' ? 'High' : normalized === 'low' ? 'Low' : 'Medium'
}

export function mapComplaint(item: ApiComplaint): Complaint {
  const location = item.location
  const history = (item.history ?? []).map((entry) => ({
    status: mapStatus(entry.toStatus),
    message: entry.note ?? `Status changed to ${mapStatus(entry.toStatus)}.`,
    createdAt: entry.createdAt,
  }))
  const notes = (item.notes ?? []).map((note) => note.body)
  const timeline = [
    ...history,
    ...(item.notes ?? []).map((note) => ({
      status: mapStatus(item.status),
      message: note.body,
      createdAt: note.createdAt,
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const assignedOfficer = item.assignments?.[0]?.officer
  return {
    id: item.trackingId,
    recordId: item.id,
    title: item.title,
    description: item.description,
    category: item.category?.name ?? 'Uncategorized',
    subcategory: '',
    severity: mapPriority(item.severity),
    incidentDate: item.incidentAt ?? item.createdAt,
    address: location?.address ?? '',
    state: location?.state ?? '',
    district: location?.district ?? '',
    city: location?.city ?? '',
    pincode: location?.pincode ?? '',
    latitude: location?.latitude ?? 0,
    longitude: location?.longitude ?? 0,
    remarks: [...history.map((entry) => entry.message), ...notes],
    consent: item.consent,
    status: mapStatus(item.status),
    priority: mapPriority(item.priority),
    department: item.department?.name ?? '',
    assignedOfficer: assignedOfficer?.officerProfile?.fullName ?? assignedOfficer?.email ?? 'Unassigned',
    citizenName: item.citizen?.citizenProfile?.fullName ?? item.citizen?.email ?? '',
    citizenEmail: item.citizen?.email ?? '',
    images: [],
    imageIds: item.images?.map((image) => image.id) ?? [],
    resolutionEvidenceIds: item.resolutionEvidence?.map((image) => image.id) ?? [],
    aiStatus: item.aiAnalyses?.[0]?.status,
    createdAt: item.createdAt,
    lastUpdated: item.updatedAt ?? item.createdAt,
    statusHistory: timeline,
    feedback: item.feedback ?? undefined,
  }
}

export function mapDepartment(item: ApiDepartment): Department {
  const total = item._count?.complaints ?? item.complaints?.length ?? 0
  const resolved = item.complaints?.filter((complaint) => complaint.status === 'RESOLVED' || complaint.status === 'CLOSED').length ?? 0
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    location: item.jurisdiction || [item.district, item.state].filter(Boolean).join(', '),
    resolutionRate: total ? Math.round((resolved / total) * 100) : 0,
    totalComplaints: total,
    pendingComplaints: Math.max(0, total - resolved),
    resolvedComplaints: resolved,
    active: item.active ?? true,
  }
}

export function mapCategory(item: ApiCategory): ComplaintCategory {
  return {
    id: item.id,
    name: item.name,
    department: item.department?.name ?? '',
    defaultPriority: mapPriority(item.defaultPriority),
    slaHours: item.slaHours,
    active: item.active ?? true,
  }
}

export function mapOfficer(item: ApiUser): Officer {
  const profile = item.officerProfile
  return {
    id: item.id,
    name: profile?.fullName ?? item.email,
    email: item.email,
    department: profile?.department?.name ?? '',
    jurisdiction: profile?.jurisdiction ?? '',
    active: item.status === 'ACTIVE',
    workload: item.assignments?.length ?? 0,
    phone: profile?.phone ?? undefined,
  }
}

export function mapCitizen(item: ApiUser): CitizenProfile {
  const profile = item.citizenProfile
  return {
    id: item.id,
    name: profile?.fullName ?? item.email,
    email: item.email,
    phone: profile?.phone ?? '',
    state: profile?.state ?? '',
    district: profile?.district ?? '',
    city: profile?.city ?? '',
    address: profile?.address ?? '',
    pincode: profile?.pincode ?? '',
    joinedAt: item.createdAt ?? '',
    active: item.status === 'ACTIVE',
  }
}

export function mapNotification(item: ApiNotification): NotificationItem {
  const type = item.type.toLowerCase()
  return {
    id: item.id,
    type: type.includes('resolved') ? 'success' : type.includes('escalated') ? 'warning' : 'info',
    message: item.message,
    read: Boolean(item.readAt),
    createdAt: item.createdAt,
    complaintId: item.complaintId ?? undefined,
  }
}

export function mapAuditEvent(item: ApiAuditEvent): AuditEvent {
  const role = item.actor?.role?.toLowerCase()
  return {
    id: item.id,
    actor: item.actor?.email ?? 'System',
    role: role === 'citizen' || role === 'officer' ? role : 'admin',
    action: item.action,
    relatedComplaintId: item.entityId ?? undefined,
    createdAt: item.createdAt,
    ipAddress: item.ipAddress ?? 'Not recorded',
  }
}
