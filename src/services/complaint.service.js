import { apiClient } from './api';
import { mapComplaint, toApiStatus } from './api.models';
import { invalidatePortalData, queryClient } from './queryClient';
import { isDemoMode, useAppStore } from '../store/useAppStore';
export class ComplaintImageUploadError extends Error {
    complaint;
    constructor(complaint) {
        super('The complaint was created, but one or more images could not be uploaded.');
        this.complaint = complaint;
        this.name = 'ComplaintImageUploadError';
    }
}
async function findComplaint(id) {
    const cached = useAppStore.getState().complaints.find((item) => item.id === id || item.recordId === id);
    if (cached?.recordId)
        return cached;
    const response = await apiClient.get('/complaints', {
        params: { q: id, page: 1, pageSize: 100 },
    });
    const record = response.data.data.items.find((item) => item.trackingId === id || item.id === id);
    return record ? mapComplaint(record) : undefined;
}
async function getDetail(id) {
    const complaint = await findComplaint(id);
    if (!complaint?.recordId)
        return undefined;
    const response = await apiClient.get(`/complaints/${complaint.recordId}`);
    return mapComplaint(response.data.data);
}
export const complaintService = {
    createComplaint: async (submission, files = []) => {
        if (isDemoMode) {
            const state = useAppStore.getState();
            const category = state.categories.find((item) => item.id === submission.categoryId);
            const complaint = state.createComplaint({
                ...submission.location,
                title: submission.title,
                description: submission.description,
                category: category?.name ?? 'Uncategorized',
                subcategory: '',
                severity: submission.severity[0] + submission.severity.slice(1).toLowerCase(),
                incidentDate: submission.incidentAt ?? new Date().toISOString(),
                remarks: ['Complaint filed and awaiting review.'],
                consent: true,
                status: 'Pending',
                priority: submission.severity[0] + submission.severity.slice(1).toLowerCase(),
                department: category?.department ?? '',
                assignedOfficer: 'Unassigned',
                citizenName: state.session?.name ?? '',
                citizenEmail: state.session?.email ?? '',
                images: files.map((file) => URL.createObjectURL(file)),
            });
            return complaint;
        }
        const response = await apiClient.post('/complaints', submission);
        const complaint = mapComplaint(response.data.data);
        if (files.length && complaint.recordId) {
            try {
                await complaintService.uploadImages(complaint.recordId, files);
            }
            catch (error) {
                await invalidatePortalData();
                throw new ComplaintImageUploadError(complaint);
            }
        }
        await invalidatePortalData();
        return complaint;
    },
    uploadImages: async (id, files) => {
        if (isDemoMode)
            return;
        const complaint = await findComplaint(id);
        const recordId = complaint?.recordId ?? id;
        const detail = await apiClient.get(`/complaints/${recordId}`);
        const uploadedCount = detail.data.data.images?.length ?? 0;
        const pendingFiles = files.slice(uploadedCount);
        if (!pendingFiles.length) {
            await invalidatePortalData();
            return;
        }
        const formData = new FormData();
        pendingFiles.forEach((file) => formData.append('images', file));
        await apiClient.post(`/complaints/${recordId}/images`, formData);
        await invalidatePortalData();
    },
    getComplaints: () => useAppStore.getState().complaints,
    getComplaintById: async (id) => isDemoMode
        ? useAppStore.getState().complaints.find((complaint) => complaint.id === id)
        : getDetail(id),
    updateComplaintStatus: async (id, status, _officer, note) => {
        if (isDemoMode)
            return useAppStore.getState().updateComplaintStatus(id, status, _officer);
        const complaint = await findComplaint(id);
        if (!complaint?.recordId)
            throw new Error('Complaint not found. Refresh the list and try again.');
        await apiClient.patch(`/complaints/${complaint.recordId}/status`, { status: toApiStatus(status), note });
        await invalidatePortalData();
    },
    assignComplaint: async (id, departmentName, officerName) => {
        if (isDemoMode)
            return useAppStore.getState().assignComplaint(id, departmentName, officerName);
        if (!officerName || officerName === 'Unassigned')
            throw new Error('Select an officer before assigning this complaint.');
        const complaint = await findComplaint(id);
        const department = useAppStore.getState().departments.find((item) => item.name === departmentName);
        const officer = useAppStore.getState().officers.find((item) => item.name === officerName);
        if (!complaint?.recordId || !officer)
            throw new Error('The selected complaint or officer is no longer available.');
        await apiClient.post(`/admin/complaints/${complaint.recordId}/assign`, {
            officerId: officer.id,
            ...(department ? { departmentId: department.id } : {}),
        });
        await invalidatePortalData();
    },
    addRemark: async (id, remark) => {
        if (isDemoMode)
            return useAppStore.getState().addComplaintRemark(id, remark);
        const complaint = await findComplaint(id);
        if (!complaint?.recordId)
            throw new Error('Complaint not found. Refresh the list and try again.');
        await apiClient.post(`/complaints/${complaint.recordId}/notes`, { body: remark, isPublic: true });
        await invalidatePortalData();
    },
    addResolutionImage: async (id, file) => {
        if (isDemoMode) {
            const url = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read image.'));
                reader.onerror = () => reject(new Error('Unable to read image.'));
                reader.readAsDataURL(file);
            });
            return useAppStore.getState().addResolutionImage(id, url);
        }
        const complaint = await findComplaint(id);
        if (!complaint?.recordId)
            throw new Error('Complaint not found. Refresh the list and try again.');
        const formData = new FormData();
        formData.append('image', file);
        await apiClient.post(`/complaints/${complaint.recordId}/resolution-evidence`, formData);
        await invalidatePortalData();
    },
    reviewDuplicate: async (id, decision, matchId, notes) => {
        if (isDemoMode)
            return useAppStore.getState().reviewDuplicate(id, decision, matchId);
        if (!matchId)
            throw new Error('Select another complaint to compare.');
        const complaint = await findComplaint(id);
        const candidate = await findComplaint(matchId);
        if (!complaint?.recordId || !candidate?.recordId)
            throw new Error('The selected complaints are no longer available.');
        const apiDecision = decision === 'linked' ? 'LINKED' : decision === 'separate' ? 'SEPARATE' : 'MANUAL_REVIEW';
        await apiClient.post(`/admin/complaints/${complaint.recordId}/duplicate-reviews`, {
            candidateId: candidate.recordId,
            decision: apiDecision,
            notes,
        });
        await invalidatePortalData();
        await queryClient.invalidateQueries({ queryKey: ['duplicate-review', id] });
    },
    getDuplicateReviews: async (id) => {
        if (isDemoMode)
            return { complaintId: id, analysisStatus: 'NOT_CONFIGURED', candidates: [], reviews: [] };
        const complaint = await findComplaint(id);
        if (!complaint?.recordId)
            throw new Error('Complaint not found. Refresh the list and try again.');
        const response = await apiClient.get(`/admin/complaints/${complaint.recordId}/duplicates`);
        return response.data.data;
    },
    getAIAnalysis: async (id) => {
        if (isDemoMode)
            return { latest: { id: '', status: 'NOT_CONFIGURED', createdAt: '', updatedAt: '' }, history: [] };
        const complaint = await findComplaint(id);
        if (!complaint?.recordId)
            throw new Error('Complaint not found. Refresh the list and try again.');
        const response = await apiClient.get(`/complaints/${complaint.recordId}/ai-analysis`);
        return response.data.data;
    },
    getComplaintTimeline: (id) => {
        const complaint = useAppStore.getState().complaints.find((item) => item.id === id);
        return complaint?.statusHistory ?? [];
    },
    getComplaintByTrackingId: (trackingId) => getDetail(trackingId),
    fetchComplaintImage: async (complaintId, imageId, resolution = false) => {
        const response = await apiClient.get(`/complaints/${complaintId}/${resolution ? 'resolution-evidence' : 'images'}/${imageId}`, { responseType: 'blob' });
        return URL.createObjectURL(response.data);
    },
    submitFeedback: async (id, rating, comment) => {
        if (isDemoMode)
            throw new Error('Feedback is not available in demonstration mode.');
        const complaint = await findComplaint(id);
        if (!complaint?.recordId)
            throw new Error('Complaint not found. Refresh the list and try again.');
        await apiClient.post(`/complaints/${complaint.recordId}/feedback`, { rating, comment });
        await invalidatePortalData();
        await queryClient.invalidateQueries({ queryKey: ['complaint-detail', id] });
    },
};
