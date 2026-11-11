import { useAppStore } from '../store/useAppStore'

export const adminService = {
  getDashboardStatistics: () => {
    const { complaints, citizens, officers } = useAppStore.getState()
    return {
      complaints: complaints.length,
      citizens: citizens.length,
      officers: officers.filter((officer) => officer.active).length,
      pending: complaints.filter((complaint) => complaint.status === 'Pending').length,
      resolved: complaints.filter((complaint) => complaint.status === 'Resolved').length,
      suspicious: complaints.filter((complaint) => complaint.riskScore > 20).length,
    }
  },
  getAuditLogs: () => useAppStore.getState().auditLogs,
  getReports: () => useAppStore.getState().complaints,
  resetDemoData: () => useAppStore.getState().resetDemoData(),
}
