import { apiClient } from './api'
import { invalidatePortalData } from './queryClient'
import { isDemoMode, useAppStore, type Department } from '../store/useAppStore'

function toApiDepartment(department: Partial<Department>) {
  return {
    ...(department.name !== undefined ? { name: department.name } : {}),
    ...(department.code !== undefined ? { code: department.code } : {}),
    ...(department.location !== undefined ? { jurisdiction: department.location } : {}),
    ...(department.active !== undefined ? { active: department.active } : {}),
  }
}

export const departmentService = {
  getDepartments: () => useAppStore.getState().departments,
  createDepartment: async (department: Omit<Department, 'id'>) => {
    if (isDemoMode) return useAppStore.getState().saveDepartment(department)
    await apiClient.post('/admin/departments', toApiDepartment(department))
    await invalidatePortalData()
  },
  updateDepartment: async (department: Department) => {
    if (isDemoMode) return useAppStore.getState().saveDepartment(department)
    await apiClient.patch(`/admin/departments/${department.id}`, toApiDepartment(department))
    await invalidatePortalData()
  },
  deleteDepartment: async (id: string) => {
    if (isDemoMode) return useAppStore.getState().deleteDepartment(id)
    await apiClient.delete(`/admin/departments/${id}`)
    await invalidatePortalData()
  },
}
