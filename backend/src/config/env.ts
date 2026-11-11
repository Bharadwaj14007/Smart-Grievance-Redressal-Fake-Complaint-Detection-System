import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  REDIS_URL: z.string().url().optional(),
  AI_SERVICE_URL: z.string().url().optional(),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  throw new Error(`Invalid backend environment: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
}

export const env = {
  ...parsed.data,
  cookieSecure: parsed.data.COOKIE_SECURE === 'true' || (parsed.data.COOKIE_SECURE === undefined && parsed.data.NODE_ENV === 'production'),
  storageConfigured: Boolean(parsed.data.STORAGE_ENDPOINT && parsed.data.STORAGE_BUCKET && parsed.data.STORAGE_ACCESS_KEY && parsed.data.STORAGE_SECRET_KEY),
}
