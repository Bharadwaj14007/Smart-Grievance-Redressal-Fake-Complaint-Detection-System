import { useAppStore, type ComplaintCategory } from '../store/useAppStore'

export const categoryService = {
  getCategories: () => useAppStore.getState().categories,
  saveCategory: (category: Omit<ComplaintCategory, 'id'> & { id?: string }) => useAppStore.getState().saveCategory(category),
  deleteCategory: (id: string) => useAppStore.getState().deleteCategory(id),
}
