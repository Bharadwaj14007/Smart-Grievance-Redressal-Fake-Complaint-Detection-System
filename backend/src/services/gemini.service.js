import { z } from 'zod';
import { env } from '../config/env.js';
import { HttpError } from '../utils/errors.js';

const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const analysisSchema = z.object({
    category: z.string().trim().min(1).max(120),
    department: z.string().trim().min(1).max(160).nullable(),
    priority: prioritySchema,
    summary: z.string().trim().min(1).max(500),
    keywords: z.array(z.string().trim().min(1).max(80)).max(20),
    locationMentions: z.array(z.string().trim().min(1).max(160)).max(10),
    confidence: z.number().min(0).max(1),
    duplicateCandidates: z.array(z.object({
        ref: z.string().min(1).max(12),
        reason: z.string().trim().min(1).max(500),
        confidence: z.number().min(0).max(1),
    }).strict()).max(20),
}).strict();

const responseSchema = {
    type: 'OBJECT',
    properties: {
        category: { type: 'STRING' },
        department: { type: 'STRING', nullable: true },
        priority: { type: 'STRING', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        summary: { type: 'STRING' },
        keywords: { type: 'ARRAY', items: { type: 'STRING' } },
        locationMentions: { type: 'ARRAY', items: { type: 'STRING' } },
        confidence: { type: 'NUMBER' },
        duplicateCandidates: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    ref: { type: 'STRING' },
                    reason: { type: 'STRING' },
                    confidence: { type: 'NUMBER' },
                },
                required: ['ref', 'reason', 'confidence'],
            },
        },
    },
    required: ['category', 'department', 'priority', 'summary', 'keywords', 'locationMentions', 'confidence', 'duplicateCandidates'],
};

function extractModelText(payload) {
    const text = payload?.candidates?.[0]?.content?.parts
        ?.filter((part) => typeof part.text === 'string')
        .map((part) => part.text)
        .join('')
        .trim();
    if (!text) {
        throw new Error('Gemini returned no structured analysis.');
    }
    return text;
}

export async function analyzeComplaintWithGemini({ complaint, categories, candidates }, {
    apiKey = env.GEMINI_API_KEY,
    model = env.GEMINI_MODEL,
    fetchImpl = fetch,
} = {}) {
    if (!apiKey) {
        throw new HttpError(503, 'Gemini analysis is not configured.');
    }
    if (!categories.length) {
        throw new Error('No active complaint categories are available for Gemini analysis.');
    }
    const candidateRefs = new Map(candidates.slice(0, 100).map((candidate, index) => [`C${index + 1}`, candidate]));
    const prompt = {
        complaint: {
            title: complaint.title,
            description: complaint.description,
            reportedSeverity: complaint.severity,
            incidentAt: complaint.incidentAt?.toISOString?.() ?? complaint.incidentAt ?? null,
            reportedLocation: {
                city: complaint.location?.city ?? null,
                district: complaint.location?.district ?? null,
                state: complaint.location?.state ?? null,
            },
        },
        allowedCategories: categories.map(({ name, department }) => ({ name, department: department ?? null })),
        nearbyExistingComplaints: [...candidateRefs.entries()].map(([ref, candidate]) => ({
            ref,
            title: candidate.title,
            description: candidate.description.slice(0, 2000),
            category: candidate.category?.name ?? null,
            city: candidate.location?.city ?? null,
            district: candidate.location?.district ?? null,
            state: candidate.location?.state ?? null,
            createdAt: candidate.createdAt,
        })),
    };
    const requestBody = {
        systemInstruction: {
            parts: [{
                text: 'Analyze civic grievance text as decision support. Select only an exact category from allowedCategories and its associated department, or null if none is associated. Recommend priority from the report, never a fraud determination. Summarize and extract only supported keywords and location mentions. Compare nearbyExistingComplaints only with the supplied records; return duplicate refs only when supported by the text and location. Never invent a complaint, fact, candidate, or certainty. Confidence is your own estimate, not a calibrated probability. Return JSON matching the response schema.',
            }],
        },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(prompt) }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema,
            temperature: 0.1,
        },
    };
    const endpoint = new URL(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    );
    let response;
    try {
        response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(30_000),
        });
    }
    catch {
        throw new Error('Gemini request timed out or could not reach Google.');
    }
    if (!response.ok) {
        throw new Error(`Gemini API request failed with HTTP ${response.status}.`);
    }
    let payload;
    try {
        payload = await response.json();
    }
    catch {
        throw new Error('Gemini returned an invalid response.');
    }
    let parsed;
    try {
        parsed = analysisSchema.parse(JSON.parse(extractModelText(payload)));
    }
    catch {
        throw new Error('Gemini returned analysis that did not match the required response format.');
    }
    const category = categories.find((item) => item.name === parsed.category);
    if (!category || parsed.department !== (category.department ?? null)) {
        throw new Error('Gemini selected a category or department outside the configured options.');
    }
    const duplicateCandidates = parsed.duplicateCandidates.map(({ ref, reason, confidence }) => {
        const candidate = candidateRefs.get(ref);
        if (!candidate) {
            throw new Error('Gemini referenced a complaint that was not provided for review.');
        }
        return {
            complaintId: candidate.id,
            trackingId: candidate.trackingId,
            reason,
            confidence,
        };
    });
    return {
        category: parsed.category,
        department: parsed.department,
        priority: parsed.priority,
        summary: parsed.summary,
        keywords: parsed.keywords,
        locationMentions: parsed.locationMentions,
        confidence: parsed.confidence,
        duplicateCandidates,
        model,
        processedAt: new Date().toISOString(),
    };
}
