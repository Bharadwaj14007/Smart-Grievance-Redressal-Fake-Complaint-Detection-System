import { useAppStore, type Complaint, type ComplaintStatus } from '../store/useAppStore'

export const complaintService = {
  createComplaint: (complaint: Omit<Complaint, 'id' | 'createdAt' | 'lastUpdated'>) =>
    useAppStore.getState().createComplaint(complaint),
  getComplaints: () => useAppStore.getState().complaints,
  getComplaintById: (id: string) => useAppStore.getState().complaints.find((complaint) => complaint.id === id),
  updateComplaintStatus: (id: string, status: ComplaintStatus, officer?: string) =>
    useAppStore.getState().updateComplaintStatus(id, status, officer),
  assignComplaint: (id: string, department: string, officer?: string) =>
    useAppStore.getState().assignComplaint(id, department, officer),
  addRemark: (id: string, remark: string) => useAppStore.getState().addComplaintRemark(id, remark),
  addResolutionImage: (id: string, image: string) => useAppStore.getState().addResolutionImage(id, image),
  reviewDuplicate: (id: string, decision: 'linked' | 'separate' | 'manual-review', matchId?: string) =>
    useAppStore.getState().reviewDuplicate(id, decision, matchId),
  getComplaintTimeline: (id: string) => {
    const complaint = useAppStore.getState().complaints.find((item) => item.id === id)
    return complaint?.statusHistory ?? []
  },
  getDuplicateMatches: (id: string) => {
    const complaints = useAppStore.getState().complaints
    const source = complaints.find((complaint) => complaint.id === id)
    if (!source) return []
    return complaints.filter((complaint) =>
      complaint.id !== id && (
        complaint.ai.duplicateWarning.toLowerCase().includes('similar') ||
        (complaint.category === source.category && complaint.city === source.city)
      ),
    )
  },
}
