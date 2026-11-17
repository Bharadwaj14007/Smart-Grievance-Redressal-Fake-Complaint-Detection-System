import { apiClient } from './api';
import { invalidatePortalData } from './queryClient';
import { isDemoMode, useAppStore } from '../store/useAppStore';
function toApiCategory(category) {
    const department = useAppStore.getState().departments.find((item) => item.name === category.department);
    return {
        ...(category.name !== undefined ? { name: category.name } : {}),
        ...(category.defaultPriority !== undefined ? { defaultPriority: category.defaultPriority.toUpperCase() } : {}),
        ...(category.slaHours !== undefined ? { slaHours: category.slaHours } : {}),
        ...(category.active !== undefined ? { active: category.active } : {}),
        ...(department ? { departmentId: department.id } : {}),
    };
}
export const categoryService = {
    getCategories: () => useAppStore.getState().categories,
    saveCategory: async (category) => {
        if (isDemoMode)
            return useAppStore.getState().saveCategory(category);
        const body = toApiCategory(category);
        if (category.id)
            await apiClient.patch(`/admin/categories/${category.id}`, body);
        else
            await apiClient.post('/admin/categories', body);
        await invalidatePortalData();
    },
    deleteCategory: async (id) => {
        if (isDemoMode)
            return useAppStore.getState().deleteCategory(id);
        await apiClient.delete(`/admin/categories/${id}`);
        await invalidatePortalData();
    },
};
