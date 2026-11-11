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
})
