import { apiClient } from './api'
import {
  mapAuditEvent,
  mapCategory,
  mapCitizen,
  mapComplaint,
  mapDepartment,
  mapNotification,
  mapOfficer,
  type ApiAuditEvent,
  type ApiCategory,
  type ApiComplaint,
  type ApiDepartment,
  type ApiEnvelope,
  type ApiNotification,
  type ApiUser,
} from './api.models'
import type { Complaint, ComplaintCategory, Department, NotificationItem, Officer, Role, CitizenProfile, AuditEvent } from '../store/useAppStore'

type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number }
type ApiDashboard = {
  complaints: number
  citizens: number
  officers: number
  departments: number
  statuses: { status: string; _count: { _all: number } }[]
}
type ApiSla = { id: string; priority?: string | null; resolutionHours: number }

async function getData<T>(url: string) {
  const response = await apiClient.get<ApiEnvelope<T>>(url)
  return response.data.data
}

async function getAllPages<T>(url: string, pageSize = 100): Promise<T[]> {
  const first = await getData<Paginated<T>>(`${url}?page=1&pageSize=${pageSize}`)
  const pages = Math.ceil(first.total / pageSize)
  if (pages <= 1) return first.items
  const remaining = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      getData<Paginated<T>>(`${url}?page=${index + 2}&pageSize=${pageSize}`),
    ),
  )
  return first.items.concat(...remaining.map((page) => page.items))
}

export type PortalData = {
  complaints: Complaint[]
  notifications: NotificationItem[]
  departments: Department[]
  categories: ComplaintCategory[]
  officers: Officer[]
  citizens: CitizenProfile[]
  auditLogs: AuditEvent[]
  prioritySlaHours: Record<Complaint['priority'], number>
  dashboardStats?: {
    complaints: number
    citizens: number
    officers: number
    statuses: Record<string, number>
  }
}

export async function fetchPortalData(role: Role): Promise<PortalData> {
  const [complaintRecords, notificationPage, metadataDepartments, metadataCategories] = await Promise.all([
    getAllPages<ApiComplaint>('/complaints'),
    getData<{ items: ApiNotification[]; unreadCount: number }>('/notifications?page=1&pageSize=100'),
    getData<ApiDepartment[]>('/metadata/departments'),
    getData<ApiCategory[]>('/metadata/categories'),
  ])
  let departments = metadataDepartments.map(mapDepartment)
  let categories = metadataCategories.map(mapCategory)
  let officers: Officer[] = []
  let citizens: CitizenProfile[] = []
  let auditLogs: AuditEvent[] = []
  let prioritySlaHours: PortalData['prioritySlaHours'] = { Critical: 12, High: 24, Medium: 72, Low: 120 }
  let dashboardStats: PortalData['dashboardStats']

  if (role === 'admin') {
    const [adminDepartments, adminCategories, users, dashboard, auditPage, slaConfigs] = await Promise.all([
      getData<ApiDepartment[]>('/admin/departments'),
      getData<ApiCategory[]>('/admin/categories'),
      Promise.all([
        getData<ApiUser[]>('/admin/officers'),
        getData<ApiUser[]>('/admin/citizens'),
      ]),
      getData<ApiDashboard>('/admin/dashboard'),
      getAllPages<ApiAuditEvent>('/admin/audit-logs'),
      getData<ApiSla[]>('/admin/sla'),
    ])
    departments = adminDepartments.map(mapDepartment)
    categories = adminCategories.map(mapCategory)
    officers = users[0].map(mapOfficer)
    citizens = users[1].map(mapCitizen)
    auditLogs = auditPage.map(mapAuditEvent)
    for (const config of slaConfigs) {
      if (!config.priority) continue
      const priority = config.priority.toLowerCase()
      if (priority === 'critical' || priority === 'high' || priority === 'medium' || priority === 'low') {
        prioritySlaHours[priority[0].toUpperCase() + priority.slice(1) as keyof typeof prioritySlaHours] = config.resolutionHours
      }
    }
    dashboardStats = {
      complaints: dashboard.complaints,
      citizens: dashboard.citizens,
      officers: dashboard.officers,
      statuses: Object.fromEntries(dashboard.statuses.map((item) => [item.status, item._count._all])),
    }
  }

  return {
    complaints: complaintRecords.map(mapComplaint),
    notifications: notificationPage.items.map(mapNotification),
    departments,
    categories,
    officers,
    citizens,
    auditLogs,
    prioritySlaHours,
    dashboardStats,
  }
}
