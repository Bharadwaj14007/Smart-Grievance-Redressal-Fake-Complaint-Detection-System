import { useAppStore, type Department } from '../store/useAppStore'

export const departmentService = {
  getDepartments: () => useAppStore.getState().departments,
  createDepartment: (department: Omit<Department, 'id'>) => useAppStore.getState().saveDepartment(department),
  updateDepartment: (department: Department) => useAppStore.getState().saveDepartment(department),
  deleteDepartment: (id: string) => useAppStore.getState().deleteDepartment(id),
}
