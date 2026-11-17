import { jest } from '@jest/globals';

process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-api-key';
process.env.CLOUDINARY_API_SECRET = 'test-api-secret';
process.env.STORAGE_ENDPOINT = 'http://legacy-storage.test';
process.env.STORAGE_REGION = 'us-east-1';
process.env.STORAGE_BUCKET = 'legacy-bucket';
process.env.STORAGE_ACCESS_KEY = 'test-storage-user';
process.env.STORAGE_SECRET_KEY = 'test-storage-secret';

const uploadStream = jest.fn();
const destroy = jest.fn();
const config = jest.fn();
const privateDownloadUrl = jest.fn();
const send = jest.fn();
const S3Client = jest.fn(() => ({ send }));
const GetObjectCommand = jest.fn((input) => ({ input }));
jest.unstable_mockModule('cloudinary', () => ({
    v2: {
        config,
        uploader: { upload_stream: uploadStream, destroy },
        utils: { private_download_url: privateDownloadUrl },
    },
}));
jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
    GetObjectCommand,
    S3Client,
}));

const { deletePrivateImage, getPrivateImage, validateImage, storePrivateImage } = await import('../src/services/storage.service.js');
const pngSignature = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
    'base64',
);

describe('Cloudinary image storage', () => {
    it('rejects empty, oversized, and unsupported image content', async () => {
        await expect(validateImage(Buffer.alloc(0))).rejects.toThrow('non-empty');
        await expect(validateImage(Buffer.alloc(512 * 1024 + 1))).rejects.toThrow('no larger than 512 KB');
        await expect(validateImage(Buffer.from('not an image'))).rejects.toThrow('Only valid JPEG, PNG, or WEBP');
    });

    it('checks detected image type against the multipart declaration before storage', async () => {
        await expect(storePrivateImage(pngSignature, 'image/jpeg')).rejects.toThrow('does not match');
        expect(uploadStream).not.toHaveBeenCalled();
    });

    it('stores evidence as an authenticated asset and returns its secure metadata', async () => {
        uploadStream.mockImplementationOnce((options, callback) => ({
            end(buffer) {
                callback(null, {
                    public_id: options.public_id,
                    secure_url: 'https://res.cloudinary.com/test-cloud/image/authenticated/upload/sample.png',
                    bytes: buffer.length,
                });
            },
        }));

        const stored = await storePrivateImage(pngSignature, 'image/png');
        expect(config).toHaveBeenCalledWith(expect.objectContaining({
            cloud_name: 'test-cloud',
            api_key: 'test-api-key',
            api_secret: 'test-api-secret',
            secure: true,
        }));
        expect(uploadStream.mock.calls[0][0]).toMatchObject({
            resource_type: 'image',
            type: 'authenticated',
            format: 'png',
        });
        expect(stored).toMatchObject({
            publicId: expect.stringMatching(/^nagrik-setu\/complaints\//),
            key: expect.stringMatching(/^nagrik-setu\/complaints\//),
            secureUrl: expect.stringContaining('https://'),
            contentType: 'image/png',
            sizeBytes: pngSignature.length,
        });
        expect(JSON.stringify(stored)).not.toContain('test-api-secret');
    });

    it('does not report successful storage when Cloudinary rejects the upload', async () => {
        uploadStream.mockImplementationOnce((_options, callback) => ({
            end() {
                callback(new Error('provider error'));
            },
        }));
        await expect(storePrivateImage(pngSignature, 'image/png')).rejects.toThrow('Cloudinary could not store');
    });

    it('retrieves evidence using a short-lived authenticated Cloudinary download URL', async () => {
        privateDownloadUrl.mockReturnValueOnce('https://cloudinary.test/private-download');
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            arrayBuffer: async () => pngSignature.buffer.slice(
                pngSignature.byteOffset,
                pngSignature.byteOffset + pngSignature.byteLength,
            ),
        });
        try {
            const downloaded = await getPrivateImage('nagrik-setu/complaints/test', 'image/png');
            expect(downloaded).toEqual(pngSignature);
            expect(privateDownloadUrl).toHaveBeenCalledWith('nagrik-setu/complaints/test', 'png', expect.objectContaining({
                resource_type: 'image',
                type: 'authenticated',
                expires_at: expect.any(Number),
            }));
            expect(fetchSpy).toHaveBeenCalledWith('https://cloudinary.test/private-download', {
                signal: expect.any(AbortSignal),
            });
        }
        finally {
            fetchSpy.mockRestore();
        }
    });

    it('retrieves pre-migration images from the configured S3-compatible store', async () => {
        send.mockResolvedValueOnce({
            Body: { transformToByteArray: async () => pngSignature },
        });
        const downloaded = await getPrivateImage('complaints/2025-01-01/legacy-image', 'image/png');
        expect(downloaded).toEqual(pngSignature);
        expect(S3Client).toHaveBeenCalledWith({
            endpoint: 'http://legacy-storage.test',
            region: 'us-east-1',
            forcePathStyle: true,
            credentials: {
                accessKeyId: 'test-storage-user',
                secretAccessKey: 'test-storage-secret',
            },
        });
        expect(GetObjectCommand).toHaveBeenCalledWith({
            Bucket: 'legacy-bucket',
            Key: 'complaints/2025-01-01/legacy-image',
        });
    });

    it('deletes Cloudinary evidence as an authenticated asset', async () => {
        destroy.mockResolvedValueOnce({ result: 'ok' });
        await expect(deletePrivateImage('nagrik-setu/complaints/test')).resolves.toBeUndefined();
        expect(destroy).toHaveBeenCalledWith('nagrik-setu/complaints/test', {
            resource_type: 'image',
            type: 'authenticated',
            invalidate: true,
            timeout: 20_000,
        });
    });
});
