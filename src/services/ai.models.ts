export type AIModelInfo = {
  name: string
  revision: string
  task?: string
  configured?: boolean
  loaded?: boolean
}

export type AIDuplicateSignal = {
  name: string
  value: number
  normalizedValue?: number
  weight?: number
  contribution?: number
}

export type AIDuplicateCandidate = {
  complaintId: string
  trackingId: string
  similarity: number
  method: string
  signals: AIDuplicateSignal[]
}

export type AIImageAnalysis = {
  id: string
  width: number
  height: number
  format: string
  capturedAt?: string | null
  classification: { label: string; score: number }[]
  forensicIndicators: string[]
  elaMeanDifference: number
  opencv?: { width: number; height: number; laplacianVariance: number; meanLuminance: number }
}

export type AIAnalysisResult = {
  model?: { text?: AIModelInfo; image?: AIModelInfo }
  processedAt?: string
  processingSeconds?: number
  predictedCategory?: { categoryId: string; name: string; departmentId?: string | null; department?: string | null; similarity: number } | null
  categoryCandidates?: { categoryId: string; name: string; similarity: number }[]
  recommendedDepartment?: string | null
  recommendedPriority?: { value: string; method: string; reasons: string[]; model?: AIModelInfo | null }
  duplicateDetection?: { threshold: number; method: string; notes: string }
  duplicateCandidates?: AIDuplicateCandidate[]
  images?: AIImageAnalysis[]
  humanReviewRequired?: boolean
  disclaimer?: string
}

export type AIAnalysisRecord = {
  id: string
  status: string
  createdAt: string
  updatedAt: string
  error?: string | null
  result?: AIAnalysisResult | null
}

export type AIAnalysisHistory = {
  latest: AIAnalysisRecord
  history: AIAnalysisRecord[]
}

export type AdminAIAnalysis = {
  id: string
  status: string
  createdAt: string
  complaint: { id: string; trackingId: string; title: string }
  model: AIAnalysisResult['model']
  predictedCategory: AIAnalysisResult['predictedCategory']
  recommendedPriority: AIAnalysisResult['recommendedPriority']
  duplicateCandidates: AIDuplicateCandidate[]
  imageIndicators: { imageId: string; indicator: string }[]
}

export type AdminAIMonitoring = {
  counts: Record<string, number>
  modelAvailability: {
    status: 'available' | 'not_configured' | 'unreachable' | 'unhealthy'
    models?: Record<string, AIModelInfo>
    reason?: string
  }
  recentAnalyses: AdminAIAnalysis[]
}

export type AIDuplicateReview = {
  id: string
  decision: string
  notes?: string | null
  createdAt: string
  complaint: { trackingId: string }
  candidate: { trackingId: string }
  reviewer: { email: string }
}

export type AIDuplicateReviewCandidate = {
  id: string
  trackingId: string
  title: string
  description: string
  incidentAt?: string | null
  createdAt: string
  category: { name: string }
  location?: { address: string; city: string; district: string; state: string; latitude: number; longitude: number } | null
  images: { id: string; contentType: string; sizeBytes: number }[]
  similarity: number
  method: string
  signals: AIDuplicateSignal[]
}

export type AIDuplicateReviewData = {
  complaintId: string
  analysisStatus: string
  candidates: AIDuplicateReviewCandidate[]
  reviews: AIDuplicateReview[]
}
