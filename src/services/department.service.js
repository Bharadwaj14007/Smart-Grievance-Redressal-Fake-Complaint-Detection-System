import { apiClient } from './api';
import { invalidatePortalData } from './queryClient';
import { isDemoMode, useAppStore } from '../store/useAppStore';
function toApiDepartment(department) {
    return {
        ...(department.name !== undefined ? { name: department.name } : {}),
        ...(department.code !== undefined ? { code: department.code } : {}),
        ...(department.location !== undefined ? { jurisdiction: department.location } : {}),
        ...(department.active !== undefined ? { active: department.active } : {}),
    };
}
export const departmentService = {
    getDepartments: () => useAppStore.getState().departments,
    createDepartment: async (department) => {
        if (isDemoMode)
            return useAppStore.getState().saveDepartment(department);
        await apiClient.post('/admin/departments', toApiDepartment(department));
        await invalidatePortalData();
    },
    updateDepartment: async (department) => {
        if (isDemoMode)
            return useAppStore.getState().saveDepartment(department);
        await apiClient.patch(`/admin/departments/${department.id}`, toApiDepartment(department));
        await invalidatePortalData();
    },
    deleteDepartment: async (id) => {
        if (isDemoMode)
            return useAppStore.getState().deleteDepartment(id);
        await apiClient.delete(`/admin/departments/${id}`);
        await invalidatePortalData();
    },
};
