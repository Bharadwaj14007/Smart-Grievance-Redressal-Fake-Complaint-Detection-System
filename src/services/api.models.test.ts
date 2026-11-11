import { describe, expect, it } from 'vitest'
import { mapComplaint, toApiStatus } from './api.models'

describe('complaint API mapping', () => {
  it('maps detail timeline, evidence, and persisted feedback', () => {
    const complaint = mapComplaint({
      id: 'record-1',
      trackingId: 'GRV-2026-000001',
      title: 'Broken streetlight',
      description: 'The streetlight has been out for several days.',
      severity: 'HIGH',
      priority: 'HIGH',
      status: 'RESOLVED',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-03T10:00:00.000Z',
      consent: true,
      history: [
        { toStatus: 'SUBMITTED', note: 'Complaint submitted.', createdAt: '2026-01-01T10:00:00.000Z' },
        { toStatus: 'RESOLVED', note: 'Work completed.', createdAt: '2026-01-03T10:00:00.000Z' },
      ],
      notes: [{ body: 'Crew dispatched.', createdAt: '2026-01-02T10:00:00.000Z' }],
      images: [{ id: 'image-1' }],
      resolutionEvidence: [{ id: 'evidence-1' }],
      feedback: { rating: 4, comment: 'Resolved promptly.', createdAt: '2026-01-04T10:00:00.000Z' },
    })

    expect(complaint.id).toBe('GRV-2026-000001')
    expect(complaint.recordId).toBe('record-1')
    expect(complaint.imageIds).toEqual(['image-1'])
    expect(complaint.resolutionEvidenceIds).toEqual(['evidence-1'])
    expect(complaint.feedback).toMatchObject({ rating: 4, comment: 'Resolved promptly.' })
    expect(complaint.statusHistory?.map((item) => item.message)).toEqual([
      'Complaint submitted.',
      'Crew dispatched.',
      'Work completed.',
    ])
  })

  it('maps the UI investigation status to the API enum', () => {
    expect(toApiStatus('Under Review')).toBe('UNDER_INVESTIGATION')
  })
})
