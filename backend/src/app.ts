import cors from 'cors'
import cookieParser from 'cookie-parser'
import express, { type RequestHandler } from 'express'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env.js'
import { adminRouter } from './routes/admin.routes.js'
import { authRouter } from './routes/auth.routes.js'
import { complaintRouter } from './routes/complaint.routes.js'
import { notificationRouter } from './routes/notification.routes.js'
import { metadataRouter } from './routes/metadata.routes.js'
import { errorHandler } from './middleware/errorHandler.js'
import { HttpError } from './utils/errors.js'
import { prisma } from './config/prisma.js'

export const app = express()
app.disable('x-powered-by')
app.set('trust proxy', env.TRUST_PROXY === 'true' ? 1 : false)
app.use(helmet())
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))
app.use(cookieParser())

app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }))
app.get('/readyz', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.status(200).json({ status: 'ready' })
  } catch (error) {
    console.error('Readiness check failed.', error)
    res.status(503).json({ status: 'not_ready' })
  }
})

const openApiSpec = {
  openapi: '3.0.3',
  info: { title: 'Nagrik Setu API', version: '1.0.0', description: 'Grievance portal API. All routes except authentication and health require an access cookie.' },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: { accessCookie: { type: 'apiKey', in: 'cookie', name: 'access_token' } },
    schemas: {
      Error: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: { type: 'string' } } },
      ComplaintStatus: { type: 'string', enum: ['SUBMITTED', 'AI_ANALYSIS', 'ASSIGNED', 'UNDER_INVESTIGATION', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED'] },
    },
  },
  paths: {
    '/auth/register': { post: { summary: 'Register a citizen account', responses: { '201': { description: 'Account created' }, '400': { description: 'Invalid input' } } } },
    '/auth/login': { post: { summary: 'Sign in', responses: { '200': { description: 'Session cookies set' }, '401': { description: 'Invalid credentials' } } } },
    '/auth/refresh': { post: { summary: 'Rotate refresh session', responses: { '200': { description: 'Session refreshed' }, '401': { description: 'Invalid refresh session' } } } },
    '/auth/logout': { post: { summary: 'Sign out', responses: { '200': { description: 'Session revoked' } } } },
    '/auth/me': { get: { security: [{ accessCookie: [] }], summary: 'Get current user', responses: { '200': { description: 'Current user' }, '401': { description: 'Authentication required' } } } },
    '/complaints': {
      get: { security: [{ accessCookie: [] }], summary: 'List visible complaints', responses: { '200': { description: 'Complaint page' } } },
      post: { security: [{ accessCookie: [] }], summary: 'Create a complaint', responses: { '201': { description: 'Complaint created' }, '400': { description: 'Invalid input' } } },
    },
    '/complaints/{id}': { get: { security: [{ accessCookie: [] }], summary: 'Get complaint details', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Complaint details' }, '404': { description: 'Not found' } } } },
    '/notifications': { get: { security: [{ accessCookie: [] }], summary: 'List current user notifications', responses: { '200': { description: 'Notifications' } } } },
    '/admin/dashboard': { get: { security: [{ accessCookie: [] }], summary: 'Get administration dashboard metrics', responses: { '200': { description: 'Dashboard metrics' }, '403': { description: 'Administrator role required' } } } },
  },
}
const disableDocsCsp: RequestHandler = (_req, res, next) => {
  res.removeHeader('Content-Security-Policy')
  next()
}
app.use('/docs', disableDocsCsp, swaggerUi.serve, swaggerUi.setup(openApiSpec))
app.get('/api/openapi.json', (_req, res) => res.json(openApiSpec))

app.use('/api/v1/auth', authRouter)
app.use('/api/v1/metadata', metadataRouter)
app.use('/api/v1/complaints', complaintRouter)
app.use('/api/v1/notifications', notificationRouter)
app.use('/api/v1/admin', adminRouter)

app.use((_req, _res, next) => next(new HttpError(404, 'Route not found.')))
app.use(errorHandler)
