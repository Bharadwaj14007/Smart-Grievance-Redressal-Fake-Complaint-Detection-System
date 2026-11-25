import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { getPrivateImage } from './services/storage.service.js';
import { analyzeComplaintWithGemini } from './services/gemini.service.js';
import { createNotification, deliverPendingNotifications } from './services/notification-delivery.service.js';
import { distanceKm } from './utils/geo.js';
const analysisResponse = z.object({
    status: z.literal('COMPLETED'),
    result: z.record(z.string(), z.unknown()).nullable(),
});

async function analyzeComplaint(job) {
    if (!env.aiConfigured)
        throw new Error('No AI provider is configured.');
    const complaint = await prisma.complaint.findUnique({
        where: { id: job.data.complaintId },
        select: {
            id: true,
            trackingId: true,
            title: true,
            description: true,
            severity: true,
            createdAt: true,
            incidentAt: true,
            category: { select: { id: true, name: true } },
            location: { select: { state: true, district: true, city: true, latitude: true, longitude: true } },
            images: { select: { id: true, contentType: true, objectKey: true } },
        },
    });
    if (!complaint)
        throw new Error('Complaint no longer exists.');
    const analysisId = job.data.analysisId ?? (await prisma.aIAnalysis.findFirst({
        where: { complaintId: complaint.id, status: 'QUEUED' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
    }))?.id;
    if (!analysisId)
        throw new Error('AI analysis record no longer exists.');
    const started = await prisma.aIAnalysis.updateMany({
        where: { id: analysisId, complaintId: complaint.id, status: { in: ['QUEUED', 'PROCESSING'] } },
        data: { status: 'PROCESSING', error: null },
    });
    if (!started.count)
        return;
    const radiusKm = env.DUPLICATE_SEARCH_RADIUS_KM;
    const referenceDate = complaint.incidentAt ?? complaint.createdAt;
    const startDate = new Date(referenceDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endDate = new Date(referenceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const latitude = Number(complaint.location?.latitude);
    const longitude = Number(complaint.location?.longitude);
    const latitudeDelta = radiusKm / 110.574;
    const longitudeDelta = Math.min(180, radiusKm / (111.32 * Math.max(Math.abs(Math.cos(latitude * Math.PI / 180)), 0.00001)));
    const west = longitude - longitudeDelta;
    const east = longitude + longitudeDelta;
    const longitudeFilter = longitudeDelta >= 180
        ? {}
        : west < -180
          ? { OR: [{ longitude: { gte: west + 360 } }, { longitude: { lte: east } }] }
          : east > 180
            ? { OR: [{ longitude: { gte: west } }, { longitude: { lte: east - 360 } }] }
            : { longitude: { gte: west, lte: east } };
    const [categories, nearbyCandidates, images] = await Promise.all([
        prisma.complaintCategory.findMany({
            where: { active: true },
            select: { id: true, name: true, department: { select: { id: true, name: true } } },
        }),
        complaint.location
            ? prisma.complaint.findMany({
                where: {
                  id: { not: complaint.id },
                  OR: [
                    { incidentAt: { gte: startDate, lte: endDate } },
                    { incidentAt: null, createdAt: { gte: startDate, lte: endDate } },
                  ],
                  location: {
                    is: {
                      latitude: { gte: latitude - latitudeDelta, lte: latitude + latitudeDelta },
                      ...longitudeFilter,
                    },
                  },
                },
                orderBy: { createdAt: 'desc' },
                take: 1000,
                select: {
                  id: true,
                  trackingId: true,
                  title: true,
                  description: true,
                  categoryId: true,
                  category: { select: { name: true } },
                  createdAt: true,
                  incidentAt: true,
                  location: { select: { state: true, district: true, city: true, latitude: true, longitude: true } },
                  aiAnalyses: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { result: true } },
                },
              })
            : Promise.resolve([]),
        env.AI_SERVICE_URL
            ? Promise.all(complaint.images.map(async (image) => {
                const bytes = await getPrivateImage(image.objectKey, image.contentType);
                return { id: image.id, contentType: image.contentType, data: bytes.toString('base64') };
            })).catch(() => null)
            : Promise.resolve([]),
    ]);
    const candidateRows = nearbyCandidates
        .filter((candidate) => candidate.location && distanceKm(complaint.location, candidate.location) <= radiusKm)
        .sort((left, right) =>
            distanceKm(complaint.location, left.location) - distanceKm(complaint.location, right.location)
            || right.createdAt.getTime() - left.createdAt.getTime(),
        )
        .slice(0, 100);
    const candidates = candidateRows.map((candidate) => {
        const storedResult = candidate.aiAnalyses[0]?.result;
        const result = storedResult && typeof storedResult === 'object' && !Array.isArray(storedResult) ? storedResult : {};
        const storedImages = Array.isArray(result.images) ? result.images : [];
        const imageRecords = storedImages.filter((image) => image !== null && typeof image === 'object' && !Array.isArray(image));
        const textEmbedding = Array.isArray(result.textEmbedding) && result.textEmbedding.every((value) => typeof value === 'number')
            ? result.textEmbedding
            : undefined;
        const imageEmbeddings = imageRecords
            .map((image) => image.embedding)
            .filter((embedding) => Array.isArray(embedding) && embedding.every((value) => typeof value === 'number'));
        const perceptualHashes = imageRecords
            .map((image) => image.perceptualHash)
            .filter((hash) => typeof hash === 'string');
        return {
            id: candidate.id,
            trackingId: candidate.trackingId,
            title: candidate.title,
            description: candidate.description,
            categoryId: candidate.categoryId,
            category: candidate.category,
            createdAt: candidate.createdAt.toISOString(),
            incidentAt: candidate.incidentAt?.toISOString() ?? null,
            location: candidate.location,
            textEmbedding,
            imageEmbeddings,
            perceptualHashes,
        };
    });
    const pythonPayload = {
        ...complaint,
        createdAt: complaint.createdAt.toISOString(),
        incidentAt: complaint.incidentAt?.toISOString() ?? null,
        categories: categories.map((category) => ({
            id: category.id,
            name: category.name,
            departmentId: category.department?.id ?? null,
            department: category.department?.name ?? null,
        })),
        candidates,
        images,
    };
    const [pythonResult, geminiResult] = await Promise.allSettled([
        env.AI_SERVICE_URL && images !== null
            ? (async () => {
                const response = await fetch(new URL('/v1/analyze', env.AI_SERVICE_URL), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(pythonPayload),
                    signal: AbortSignal.timeout(300_000),
                });
                if (!response.ok)
                    throw new Error(`AI service returned HTTP ${response.status}.`);
                return analysisResponse.parse(await response.json());
            })()
            : env.AI_SERVICE_URL
                ? Promise.reject(new Error('Complaint evidence could not be retrieved for the Python analysis service.'))
                : Promise.resolve(null),
        env.GEMINI_API_KEY
            ? analyzeComplaintWithGemini({
                complaint,
                categories: categories.map((category) => ({
                    name: category.name,
                    department: category.department?.name ?? null,
                })),
                candidates: candidateRows,
            })
            : Promise.resolve(null),
    ]);
    const pythonAnalysis = pythonResult.status === 'fulfilled' ? pythonResult.value?.result ?? null : null;
    const geminiAnalysis = geminiResult.status === 'fulfilled' && geminiResult.value
        ? { status: 'COMPLETED', ...geminiResult.value }
        : env.GEMINI_API_KEY
            ? { status: 'FAILED', error: 'Gemini analysis could not be completed.' }
            : { status: 'NOT_CONFIGURED' };
    if (env.GEMINI_API_KEY && geminiResult.status === 'rejected') {
        if (pythonAnalysis) {
            await prisma.aIAnalysis.updateMany({
                where: { id: analysisId, status: 'PROCESSING' },
                data: {
                    result: JSON.parse(JSON.stringify({
                        ...pythonAnalysis,
                        geminiAnalysis,
                        humanReviewRequired: true,
                        disclaimer: 'AI results are advisory, require human review, and do not determine fraud or complaint authenticity.',
                    })),
                },
            });
        }
        throw new Error('Configured Gemini analysis could not be completed.');
    }
    if (!pythonAnalysis && !geminiAnalysis.model) {
        throw new Error('No configured AI provider completed the analysis.');
    }
    const result = {
        ...(pythonAnalysis ?? {
            model: {
                text: { name: geminiAnalysis.model, task: 'complaint_analysis' },
                image: null,
            },
            processedAt: geminiAnalysis.processedAt,
            processingSeconds: null,
            predictedCategory: null,
            recommendedDepartment: null,
            recommendedPriority: null,
            duplicateCandidates: [],
        }),
        geminiAnalysis,
        humanReviewRequired: true,
        disclaimer: 'AI results are advisory, require human review, and do not determine fraud or complaint authenticity.',
    };
    await prisma.aIAnalysis.updateMany({
        where: { id: analysisId, status: 'PROCESSING' },
        data: {
            status: 'COMPLETED',
            result: JSON.parse(JSON.stringify(result)),
            error: null,
        },
    });
}
if (!env.REDIS_URL)
    throw new Error('REDIS_URL is required to start the AI worker.');
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const worker = new Worker('complaint-ai-analysis', analyzeComplaint, { connection, concurrency: 1 });
const slaQueue = new Queue('complaint-sla-check', { connection });
const notificationQueue = new Queue('notification-delivery', { connection });
const notificationWorker = new Worker('notification-delivery', deliverPendingNotifications, { connection, concurrency: 1 });
const slaWorker = new Worker('complaint-sla-check', async () => {
    const [complaints, configurations] = await Promise.all([
        prisma.complaint.findMany({
            where: { status: { notIn: ['CLOSED', 'RESOLVED', 'ESCALATED'] }, createdAt: { lte: new Date(Date.now() - 60 * 60 * 1000) } },
            include: { category: { select: { slaHours: true } } },
            orderBy: { createdAt: 'asc' },
            take: 1000,
        }),
        prisma.sLAConfiguration.findMany({ where: { active: true } }),
    ]);
    for (const complaint of complaints) {
        const matching = configurations
            .filter((item) => (!item.categoryId || item.categoryId === complaint.categoryId) && (!item.priority || item.priority === complaint.priority))
            .sort((a, b) => Number(Boolean(b.categoryId)) * 2 + Number(Boolean(b.priority))
            - Number(Boolean(a.categoryId)) * 2 - Number(Boolean(a.priority)));
        const config = matching[0];
        const responsePending = complaint.status === 'SUBMITTED' || complaint.status === 'AI_ANALYSIS';
        const targetHours = responsePending ? config?.responseHours ?? complaint.category.slaHours : config?.resolutionHours ?? complaint.category.slaHours;
        if (complaint.createdAt.getTime() + targetHours * 60 * 60 * 1000 > Date.now())
            continue;
        await prisma.$transaction(async (tx) => {
            const changed = await tx.complaint.updateMany({ where: { id: complaint.id, status: complaint.status }, data: { status: 'ESCALATED' } });
            if (!changed.count)
                return;
            await tx.complaintStatusHistory.create({
                data: {
                    complaintId: complaint.id,
                    fromStatus: complaint.status,
                    toStatus: 'ESCALATED',
                    note: `Automatically escalated because the ${responsePending ? 'response' : 'resolution'} SLA elapsed.`,
                },
            });
            await createNotification(tx, {
                userId: complaint.citizenId,
                complaintId: complaint.id,
                type: 'SLA_ESCALATED',
                message: `Complaint ${complaint.trackingId} was escalated after its ${responsePending ? 'response' : 'resolution'} target elapsed.`,
            });
            await tx.auditLog.create({
                data: { action: 'SLA_ESCALATION', entityType: 'Complaint', entityId: complaint.id, metadata: { targetHours, responsePending } },
            });
        });
    }
}, { connection, concurrency: 1 });
await slaQueue.add('periodic-check', {}, { repeat: { every: 15 * 60 * 1000 }, jobId: 'sla-periodic-check' });
await notificationQueue.add('periodic-delivery', {}, { repeat: { every: 15_000 }, jobId: 'notification-periodic-delivery' });
worker.on('failed', (job, error) => {
    console.error('Complaint AI job failed.', { jobId: job?.id, error });
    if (job && job.attemptsMade >= Number(job.opts.attempts ?? 1)) {
        void (async () => {
            const analysisId = job.data.analysisId ?? (await prisma.aIAnalysis.findFirst({
                where: { complaintId: job.data.complaintId, status: { in: ['QUEUED', 'PROCESSING'] } },
                orderBy: { updatedAt: 'desc' },
                select: { id: true },
            }))?.id;
            if (!analysisId)
                throw new Error('No active analysis record was found for the failed AI job.');
            await prisma.aIAnalysis.updateMany({
                where: { id: analysisId, status: { in: ['QUEUED', 'PROCESSING'] } },
                data: { status: 'FAILED', error: 'AI analysis could not be completed.' },
            });
        })().catch((updateError) => console.error('Could not persist AI failure state.', updateError));
    }
});
slaWorker.on('failed', (job, error) => {
    console.error('SLA check failed.', { jobId: job?.id, error });
});
notificationWorker.on('failed', (job, error) => {
    console.error('Notification delivery batch failed.', { jobId: job?.id, error });
});
let closing = false;
async function shutdown(signal) {
    if (closing)
        return;
    closing = true;
    console.info(`AI worker received ${signal}; shutting down.`);
    await slaWorker.close();
    await slaQueue.close();
    await notificationWorker.close();
    await notificationQueue.close();
    await worker.close();
    await connection.quit();
    await prisma.$disconnect();
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
