import { useAppStore, type Officer } from '../store/useAppStore'

export const officerService = {
  getOfficers: () => useAppStore.getState().officers,
  saveOfficer: (officer: Omit<Officer, 'id'> & { id?: string }) => useAppStore.getState().saveOfficer(officer),
  deactivateOfficer: (id: string) => useAppStore.getState().setOfficerActive(id, false),
}
