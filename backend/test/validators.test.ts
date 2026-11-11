import { registerSchema } from '../src/validators/auth.schema.js'
import { complaintQuerySchema, createComplaintSchema } from '../src/validators/complaint.schema.js'

describe('registration validation', () => {
  it('normalizes email and enforces a strong password', () => {
    expect(registerSchema.parse({
      email: ' CITIZEN@EXAMPLE.COM ',
      password: 'valid-password-123',
      fullName: 'A Citizen',
    })).toMatchObject({ email: 'citizen@example.com' })

    expect(registerSchema.safeParse({
      email: 'citizen@example.com',
      password: 'short',
      fullName: 'A Citizen',
    }).success).toBe(false)
  })
})

describe('complaint validation', () => {
  const validComplaint = {
    title: 'Unsafe street lighting in my block',
    description: 'The street lights have not worked for several nights, leaving the public road unsafe.',
    categoryId: '4a77b669-642a-4f20-bc71-3c45d934f052',
    severity: 'HIGH',
    consent: true,
    location: {
      address: '21 Example Road',
      state: 'Haryana',
      district: 'Gurugram',
      city: 'Gurugram',
      pincode: '122001',
      latitude: 28.4595,
      longitude: 77.0266,
    },
  }

  it('requires explicit consent and a valid India postal code', () => {
    expect(createComplaintSchema.safeParse(validComplaint).success).toBe(true)
    expect(createComplaintSchema.safeParse({ ...validComplaint, consent: false }).success).toBe(false)
    expect(createComplaintSchema.safeParse({
      ...validComplaint,
      location: { ...validComplaint.location, pincode: '12A001' },
    }).success).toBe(false)
  })

  it('rejects unknown status filters and bounds pagination', () => {
    expect(complaintQuerySchema.parse({ page: '2', pageSize: '10' })).toMatchObject({ page: 2, pageSize: 10 })
    expect(complaintQuerySchema.safeParse({ status: 'invented-status' }).success).toBe(false)
    expect(complaintQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false)
  })
})
