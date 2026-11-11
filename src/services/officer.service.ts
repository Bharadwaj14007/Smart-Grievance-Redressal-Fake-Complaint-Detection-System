import { apiClient } from './api'
import { invalidatePortalData } from './queryClient'
import { isDemoMode, useAppStore, type Officer } from '../store/useAppStore'

function toApiOfficer(officer: Partial<Officer> & { password?: string }) {
  const department = useAppStore.getState().departments.find((item) => item.name === officer.department)
  return {
    ...(officer.email !== undefined ? { email: officer.email } : {}),
    ...(officer.name !== undefined ? { fullName: officer.name } : {}),
    ...(officer.jurisdiction !== undefined ? { jurisdiction: officer.jurisdiction } : {}),
    ...(officer.phone !== undefined ? { phone: officer.phone } : {}),
    ...(officer.password ? { password: officer.password } : {}),
    ...(department ? { departmentId: department.id } : {}),
  }
}

export const officerService = {
  getOfficers: () => useAppStore.getState().officers,
  saveOfficer: async (officer: Omit<Officer, 'id'> & { id?: string; password?: string }) => {
    if (isDemoMode) return useAppStore.getState().saveOfficer(officer)
    const body = toApiOfficer(officer)
    if (officer.id) await apiClient.patch(`/admin/officers/${officer.id}`, body)
    else await apiClient.post('/admin/officers', body)
    await invalidatePortalData()
  },
  setOfficerActive: async (id: string, active: boolean) => {
    if (isDemoMode) return useAppStore.getState().setOfficerActive(id, active)
    await apiClient.patch(`/admin/officers/${id}/status`, { status: active ? 'ACTIVE' : 'INACTIVE' })
    await invalidatePortalData()
  },
  deactivateOfficer: (id: string) => officerService.setOfficerActive(id, false),
}
