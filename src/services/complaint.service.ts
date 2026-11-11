import { apiClient } from './api'
import { mapComplaint, toApiStatus, type ApiComplaint, type ApiEnvelope } from './api.models'
import type { AIAnalysisHistory, AIDuplicateReviewData } from './ai.models'
import { invalidatePortalData, queryClient } from './queryClient'
import { isDemoMode, useAppStore, type Complaint, type ComplaintStatus } from '../store/useAppStore'

export type ComplaintSubmission = {
  title: string
  description: string
  categoryId: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  incidentAt?: string
  consent: true
  location: {
    address: string
    state: string
    district: string
    city: string
    pincode: string
    latitude: number
    longitude: number
  }
}

export class ComplaintImageUploadError extends Error {
  constructor(readonly complaint: Complaint) {
    super('The complaint was created, but one or more images could not be uploaded.')
    this.name = 'ComplaintImageUploadError'
  }
}

async function findComplaint(id: string) {
  const cached = useAppStore.getState().complaints.find((item) => item.id === id || item.recordId === id)
  if (cached?.recordId) return cached
  const response = await apiClient.get<ApiEnvelope<{ items: ApiComplaint[] }>>('/complaints', {
    params: { q: id, page: 1, pageSize: 100 },
  })
  const record = response.data.data.items.find((item) => item.trackingId === id || item.id === id)
  return record ? mapComplaint(record) : undefined
}

async function getDetail(id: string) {
  const complaint = await findComplaint(id)
  if (!complaint?.recordId) return undefined
  const response = await apiClient.get<ApiEnvelope<ApiComplaint>>(`/complaints/${complaint.recordId}`)
  return mapComplaint(response.data.data)
}

export const complaintService = {
  createComplaint: async (submission: ComplaintSubmission, files: File[] = []) => {
    if (isDemoMode) {
      const state = useAppStore.getState()
      const category = state.categories.find((item) => item.id === submission.categoryId)
      const complaint = state.createComplaint({
        ...submission.location,
        title: submission.title,
        description: submission.description,
        category: category?.name ?? 'Uncategorized',
        subcategory: '',
        severity: submission.severity[0] + submission.severity.slice(1).toLowerCase() as Complaint['severity'],
        incidentDate: submission.incidentAt ?? new Date().toISOString(),
        remarks: ['Complaint filed and awaiting review.'],
        consent: true,
        status: 'Pending',
        priority: submission.severity[0] + submission.severity.slice(1).toLowerCase() as Complaint['priority'],
        department: category?.department ?? '',
        assignedOfficer: 'Unassigned',
        citizenName: state.session?.name ?? '',
        citizenEmail: state.session?.email ?? '',
        images: files.map((file) => URL.createObjectURL(file)),
      })
      return complaint
    }

    const response = await apiClient.post<ApiEnvelope<ApiComplaint>>('/complaints', submission)
    const complaint = mapComplaint(response.data.data)
    if (files.length && complaint.recordId) {
      try {
        await complaintService.uploadImages(complaint.recordId, files)
      } catch (error) {
        await invalidatePortalData()
        throw new ComplaintImageUploadError(complaint)
      }
    }
    await invalidatePortalData()
    return complaint
  },
  uploadImages: async (id: string, files: File[]) => {
    if (isDemoMode) return
    const complaint = await findComplaint(id)
    const recordId = complaint?.recordId ?? id
    const detail = await apiClient.get<ApiEnvelope<ApiComplaint>>(`/complaints/${recordId}`)
    const uploadedCount = detail.data.data.images?.length ?? 0
    const pendingFiles = files.slice(uploadedCount)
    if (!pendingFiles.length) {
      await invalidatePortalData()
      return
    }
    const formData = new FormData()
    pendingFiles.forEach((file) => formData.append('images', file))
    await apiClient.post(`/complaints/${recordId}/images`, formData)
    await invalidatePortalData()
  },
  getComplaints: () => useAppStore.getState().complaints,
  getComplaintById: async (id: string) => isDemoMode
    ? useAppStore.getState().complaints.find((complaint) => complaint.id === id)
    : getDetail(id),
  updateComplaintStatus: async (id: string, status: ComplaintStatus, _officer?: string, note?: string) => {
    if (isDemoMode) return useAppStore.getState().updateComplaintStatus(id, status, _officer)
    const complaint = await findComplaint(id)
    if (!complaint?.recordId) throw new Error('Complaint not found. Refresh the list and try again.')
    await apiClient.patch(`/complaints/${complaint.recordId}/status`, { status: toApiStatus(status), note })
    await invalidatePortalData()
  },
  assignComplaint: async (id: string, departmentName: string, officerName?: string) => {
    if (isDemoMode) return useAppStore.getState().assignComplaint(id, departmentName, officerName)
    if (!officerName || officerName === 'Unassigned') throw new Error('Select an officer before assigning this complaint.')
    const complaint = await findComplaint(id)
    const department = useAppStore.getState().departments.find((item) => item.name === departmentName)
    const officer = useAppStore.getState().officers.find((item) => item.name === officerName)
    if (!complaint?.recordId || !officer) throw new Error('The selected complaint or officer is no longer available.')
    await apiClient.post(`/admin/complaints/${complaint.recordId}/assign`, {
      officerId: officer.id,
      ...(department ? { departmentId: department.id } : {}),
    })
    await invalidatePortalData()
  },
  addRemark: async (id: string, remark: string) => {
    if (isDemoMode) return useAppStore.getState().addComplaintRemark(id, remark)
    const complaint = await findComplaint(id)
    if (!complaint?.recordId) throw new Error('Complaint not found. Refresh the list and try again.')
    await apiClient.post(`/complaints/${complaint.recordId}/notes`, { body: remark, isPublic: true })
    await invalidatePortalData()
  },
  addResolutionImage: async (id: string, file: File) => {
    if (isDemoMode) {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read image.'))
        reader.onerror = () => reject(new Error('Unable to read image.'))
        reader.readAsDataURL(file)
      })
      return useAppStore.getState().addResolutionImage(id, url)
    }
    const complaint = await findComplaint(id)
    if (!complaint?.recordId) throw new Error('Complaint not found. Refresh the list and try again.')
    const formData = new FormData()
    formData.append('image', file)
    await apiClient.post(`/complaints/${complaint.recordId}/resolution-evidence`, formData)
    await invalidatePortalData()
  },
  reviewDuplicate: async (id: string, decision: 'linked' | 'separate' | 'manual-review', matchId?: string, notes?: string) => {
    if (isDemoMode) return useAppStore.getState().reviewDuplicate(id, decision, matchId)
    if (!matchId) throw new Error('Select another complaint to compare.')
    const complaint = await findComplaint(id)
    const candidate = await findComplaint(matchId)
    if (!complaint?.recordId || !candidate?.recordId) throw new Error('The selected complaints are no longer available.')
    const apiDecision = decision === 'linked' ? 'LINKED' : decision === 'separate' ? 'SEPARATE' : 'MANUAL_REVIEW'
    await apiClient.post(`/admin/complaints/${complaint.recordId}/duplicate-reviews`, {
      candidateId: candidate.recordId,
      decision: apiDecision,
      notes,
    })
    await invalidatePortalData()
    await queryClient.invalidateQueries({ queryKey: ['duplicate-review', id] })
  },
  getDuplicateReviews: async (id: string): Promise<AIDuplicateReviewData> => {
    if (isDemoMode) return { complaintId: id, analysisStatus: 'NOT_CONFIGURED', candidates: [], reviews: [] }
    const complaint = await findComplaint(id)
    if (!complaint?.recordId) throw new Error('Complaint not found. Refresh the list and try again.')
    const response = await apiClient.get<ApiEnvelope<AIDuplicateReviewData>>(
      `/admin/complaints/${complaint.recordId}/duplicates`,
    )
    return response.data.data
  },
  getAIAnalysis: async (id: string): Promise<AIAnalysisHistory> => {
    if (isDemoMode) return { latest: { id: '', status: 'NOT_CONFIGURED', createdAt: '', updatedAt: '' }, history: [] }
    const complaint = await findComplaint(id)
    if (!complaint?.recordId) throw new Error('Complaint not found. Refresh the list and try again.')
    const response = await apiClient.get<ApiEnvelope<AIAnalysisHistory>>(`/complaints/${complaint.recordId}/ai-analysis`)
    return response.data.data
  },
  getComplaintTimeline: (id: string) => {
    const complaint = useAppStore.getState().complaints.find((item) => item.id === id)
    return complaint?.statusHistory ?? []
  },
  getComplaintByTrackingId: (trackingId: string) => getDetail(trackingId),
  fetchComplaintImage: async (complaintId: string, imageId: string, resolution = false) => {
    const response = await apiClient.get<Blob>(
      `/complaints/${complaintId}/${resolution ? 'resolution-evidence' : 'images'}/${imageId}`,
      { responseType: 'blob' },
    )
    return URL.createObjectURL(response.data)
  },
  submitFeedback: async (id: string, rating: number, comment?: string) => {
    if (isDemoMode) throw new Error('Feedback is not available in demonstration mode.')
    const complaint = await findComplaint(id)
    if (!complaint?.recordId) throw new Error('Complaint not found. Refresh the list and try again.')
    await apiClient.post(`/complaints/${complaint.recordId}/feedback`, { rating, comment })
    await invalidatePortalData()
    await queryClient.invalidateQueries({ queryKey: ['complaint-detail', id] })
  },
}
