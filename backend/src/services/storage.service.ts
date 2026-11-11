import { randomUUID } from 'node:crypto'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { fileTypeFromBuffer } from 'file-type'
import { env } from '../config/env.js'
import { HttpError } from '../utils/errors.js'

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
let client: S3Client | undefined

function getClient() {
  if (!env.storageConfigured || !env.STORAGE_ENDPOINT || !env.STORAGE_BUCKET || !env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY) {
    throw new HttpError(503, 'Private image storage is not configured.')
  }
  client ??= new S3Client({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY },
  })
  return client
}

export async function validateImage(buffer: Buffer) {
  const detected = await fileTypeFromBuffer(buffer)
  if (!detected || !allowedTypes.has(detected.mime)) throw new HttpError(400, 'Only valid JPEG, PNG, or WEBP images are accepted.')
  return detected.mime
}

export async function storePrivateImage(buffer: Buffer, declaredType: string) {
  const contentType = await validateImage(buffer)
  if (declaredType !== contentType) throw new HttpError(400, 'Image content does not match the declared content type.')
  const key = `complaints/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`
  await getClient().send(new PutObjectCommand({
    Bucket: env.STORAGE_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  }))
  return { key, contentType, sizeBytes: buffer.byteLength }
}

export async function getPrivateImage(key: string) {
  return getClient().send(new GetObjectCommand({ Bucket: env.STORAGE_BUCKET!, Key: key }))
}
