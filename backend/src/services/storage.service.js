import { randomUUID } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { v2 as cloudinary } from 'cloudinary';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../config/env.js';
import { HttpError } from '../utils/errors.js';

const allowedTypes = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
]);
const maximumImageSize = 512 * 1024;
let configured = false;
let legacyStorageClient;

function getLegacyStorageClient() {
    if (!env.storageConfigured) {
        throw new HttpError(503, 'Legacy image storage is not configured.');
    }
    legacyStorageClient ??= new S3Client({
        endpoint: env.STORAGE_ENDPOINT,
        region: env.STORAGE_REGION,
        forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === 'true',
        credentials: {
            accessKeyId: env.STORAGE_ACCESS_KEY,
            secretAccessKey: env.STORAGE_SECRET_KEY,
        },
    });
    return legacyStorageClient;
}

function getCloudinary() {
    if (!env.cloudinaryConfigured) {
        throw new HttpError(503, 'Cloudinary image storage is not configured.');
    }
    if (!configured) {
        cloudinary.config({
            cloud_name: env.CLOUDINARY_CLOUD_NAME,
            api_key: env.CLOUDINARY_API_KEY,
            api_secret: env.CLOUDINARY_API_SECRET,
            secure: true,
        });
        configured = true;
    }
    return cloudinary;
}

export async function validateImage(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0 || buffer.byteLength > maximumImageSize) {
        throw new HttpError(400, 'Images must be non-empty and no larger than 512 KB.');
    }
    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !allowedTypes.has(detected.mime)) {
        throw new HttpError(400, 'Only valid JPEG, PNG, or WEBP images are accepted.');
    }
    return detected.mime;
}

export async function storePrivateImage(buffer, declaredType) {
    const contentType = await validateImage(buffer);
    if (declaredType !== contentType) {
        throw new HttpError(400, 'Image content does not match the declared content type.');
    }
    const format = allowedTypes.get(contentType);
    const publicId = `nagrik-setu/complaints/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
    const result = await new Promise((resolve, reject) => {
        const stream = getCloudinary().uploader.upload_stream({
            resource_type: 'image',
            type: 'authenticated',
            format,
            public_id: publicId,
            overwrite: false,
            unique_filename: false,
            use_filename: false,
            timeout: 20_000,
        }, (error, uploaded) => {
            if (error) {
                reject(new HttpError(502, 'Cloudinary could not store the image.'));
                return;
            }
            if (!uploaded?.public_id || !uploaded.secure_url || uploaded.bytes > maximumImageSize) {
                reject(new HttpError(502, 'Cloudinary returned incomplete image metadata.'));
                return;
            }
            resolve(uploaded);
        });
        stream.end(buffer);
    });
    return {
        key: result.public_id,
        publicId: result.public_id,
        secureUrl: result.secure_url,
        contentType,
        sizeBytes: result.bytes,
    };
}

export async function deletePrivateImage(publicId) {
    const result = await getCloudinary().uploader.destroy(publicId, {
        resource_type: 'image',
        type: 'authenticated',
        invalidate: true,
        timeout: 20_000,
    });
    if (result.result !== 'ok' && result.result !== 'not found') {
        throw new HttpError(502, 'Cloudinary could not delete the image.');
    }
}

export async function getPrivateImage(publicId, contentType) {
    if (publicId.startsWith('complaints/')) {
        try {
            const result = await getLegacyStorageClient().send(new GetObjectCommand({
                Bucket: env.STORAGE_BUCKET,
                Key: publicId,
            }));
            if (!result.Body) {
                throw new HttpError(502, 'Legacy image storage returned an empty image.');
            }
            return Buffer.from(await result.Body.transformToByteArray());
        }
        catch (error) {
            if (error instanceof HttpError) {
                throw error;
            }
            throw new HttpError(502, 'Legacy storage could not retrieve the image.');
        }
    }
    if (!publicId.startsWith('nagrik-setu/complaints/')) {
        throw new HttpError(502, 'The image uses an unsupported storage key.');
    }
    const format = allowedTypes.get(contentType);
    if (!format) {
        throw new HttpError(502, 'Cloudinary returned an unsupported image format.');
    }
    const downloadUrl = getCloudinary().utils.private_download_url(publicId, format, {
        resource_type: 'image',
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
        throw new HttpError(502, 'Cloudinary could not retrieve the image.');
    }
    return Buffer.from(await response.arrayBuffer());
}
