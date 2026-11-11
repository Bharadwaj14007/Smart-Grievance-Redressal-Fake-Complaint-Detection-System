import 'dotenv/config'
import { z } from 'zod'

const optionalNonEmpty = z.preprocess(
  (value) => typeof value === 'string' && !value.trim() ? undefined : value,
  z.string().trim().min(1).optional(),
)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  REDIS_URL: z.string().url().optional(),
  AI_SERVICE_URL: z.string().url().optional(),
  DUPLICATE_SEARCH_RADIUS_KM: z.coerce.number().positive().max(10000).default(100),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  SMTP_HOST: optionalNonEmpty,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalNonEmpty,
  SMTP_PASSWORD: optionalNonEmpty,
  SMTP_FROM: optionalNonEmpty,
  SMS_PROVIDER: z.enum(['twilio']).default('twilio'),
  SMS_ACCOUNT_SID: optionalNonEmpty,
  SMS_AUTH_TOKEN: optionalNonEmpty,
  SMS_FROM: optionalNonEmpty,
}).refine(
  (value) => Boolean(value.SMTP_HOST) === Boolean(value.SMTP_FROM) && Boolean(value.SMTP_USER) === Boolean(value.SMTP_PASSWORD),
  { message: 'Configure SMTP_HOST and SMTP_FROM together, and configure SMTP_USER and SMTP_PASSWORD together.' },
).refine(
  (value) => {
    const smsValues = [value.SMS_ACCOUNT_SID, value.SMS_AUTH_TOKEN, value.SMS_FROM]
    return smsValues.every(Boolean) || smsValues.every((item) => !item)
  },
  { message: 'Configure SMS_ACCOUNT_SID, SMS_AUTH_TOKEN, and SMS_FROM together.' },
)

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  throw new Error(`Invalid backend environment: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
}

export const env = {
  ...parsed.data,
  cookieSecure: parsed.data.COOKIE_SECURE === 'true' || (parsed.data.COOKIE_SECURE === undefined && parsed.data.NODE_ENV === 'production'),
  storageConfigured: Boolean(parsed.data.STORAGE_ENDPOINT && parsed.data.STORAGE_BUCKET && parsed.data.STORAGE_ACCESS_KEY && parsed.data.STORAGE_SECRET_KEY),
  emailDeliveryConfigured: Boolean(parsed.data.SMTP_HOST && parsed.data.SMTP_FROM),
  smsDeliveryConfigured: Boolean(parsed.data.SMS_ACCOUNT_SID && parsed.data.SMS_AUTH_TOKEN && parsed.data.SMS_FROM),
}
