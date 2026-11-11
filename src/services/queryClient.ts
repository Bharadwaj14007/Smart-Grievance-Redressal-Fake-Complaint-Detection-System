import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

export function invalidatePortalData() {
  return queryClient.invalidateQueries({ queryKey: ['portal-data'] })
}
