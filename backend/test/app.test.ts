import request from 'supertest'
import { app } from '../src/app.js'

describe('HTTP application', () => {
  it('serves liveness without a database connection', async () => {
    await request(app).get('/healthz').expect(200, { status: 'ok' })
  })

  it('returns a consistent not-found response', async () => {
    await request(app).get('/not-a-route').expect(404, { success: false, message: 'Route not found.' })
  })

  it('rejects malformed JSON as a client error', async () => {
    await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{').expect(400)
  })

  it('protects AI monitoring and complaint analysis APIs with session authentication', async () => {
    await request(app).get('/api/v1/admin/ai/monitoring').expect(401)
    await request(app).get('/api/v1/complaints/4a77b669-642a-4f20-bc71-3c45d934f052/ai-analysis').expect(401)
    await request(app).get('/api/v1/complaints/4a77b669-642a-4f20-bc71-3c45d934f052/images/4a77b669-642a-4f20-bc71-3c45d934f052').expect(401)
  })

  it('protects notification delivery records with administrator authorization', async () => {
    await request(app).get('/api/v1/admin/notification-deliveries').expect(401)
    await request(app).patch('/api/v1/notifications/4a77b669-642a-4f20-bc71-3c45d934f052/read').expect(401)
  })
})
