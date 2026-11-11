import { useAppStore } from '../store/useAppStore'

export const authService = {
  login: (email: string, password: string) => useAppStore.getState().login(email, password),
  registerCitizen: (name: string, email: string, password: string) =>
    useAppStore.getState().registerCitizen(name, email, password),
  logout: () => useAppStore.getState().logout(),
}
