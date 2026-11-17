import { jest } from '@jest/globals';
import { analyzeComplaintWithGemini } from '../src/services/gemini.service.js';

const complaint = {
    title: 'Pothole on Main Street',
    description: 'A deep pothole is blocking the road near the market.',
    severity: 'HIGH',
    incidentAt: '2026-11-17T10:00:00.000Z',
    location: { city: 'Pune', district: 'Pune', state: 'Maharashtra' },
};
const categories = [{ name: 'Road Damage', department: 'Public Works' }];
const candidates = [{
    id: 'existing-id',
    trackingId: 'GRV-2026-000001',
    title: 'Road surface damage',
    description: 'A pothole near the market.',
    category: { name: 'Road Damage' },
    location: { city: 'Pune', district: 'Pune', state: 'Maharashtra' },
    createdAt: '2026-11-16T10:00:00.000Z',
}];
const validAnalysis = {
    category: 'Road Damage',
    department: 'Public Works',
    priority: 'HIGH',
    summary: 'A pothole is obstructing the road near the market.',
    keywords: ['pothole', 'road'],
    locationMentions: ['Main Street', 'market'],
    confidence: 0.81,
    duplicateCandidates: [{ ref: 'C1', reason: 'The reports mention a pothole near the market.', confidence: 0.7 }],
};
const jsonResponse = (value) => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }),
});

describe('Gemini complaint analysis', () => {
    it('sends the API key only in the header and maps only supplied duplicate records', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(validAnalysis));
        const result = await analyzeComplaintWithGemini({ complaint, categories, candidates }, {
            apiKey: 'test-gemini-key',
            model: 'gemini-flash-latest',
            fetchImpl,
        });

        const [url, options] = fetchImpl.mock.calls[0];
        expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
        expect(options.headers['X-goog-api-key']).toBe('test-gemini-key');
        expect(String(url)).not.toContain('test-gemini-key');
        expect(JSON.parse(options.body).generationConfig.responseMimeType).toBe('application/json');
        expect(result).toMatchObject({
            category: 'Road Damage',
            department: 'Public Works',
            priority: 'HIGH',
            confidence: 0.81,
            duplicateCandidates: [{ complaintId: 'existing-id', trackingId: 'GRV-2026-000001' }],
        });
    });

    it('rejects duplicate references that were not in the supplied database records', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
            ...validAnalysis,
            duplicateCandidates: [{ ...validAnalysis.duplicateCandidates[0], ref: 'C99' }],
        }));
        await expect(analyzeComplaintWithGemini({ complaint, categories, candidates }, {
            apiKey: 'test-gemini-key',
            fetchImpl,
        })).rejects.toThrow('not provided for review');
    });

    it('rejects categories outside the configured category list', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ ...validAnalysis, category: 'Fabricated category' }));
        await expect(analyzeComplaintWithGemini({ complaint, categories, candidates }, {
            apiKey: 'test-gemini-key',
            fetchImpl,
        })).rejects.toThrow('outside the configured options');
    });

    it('surfaces provider status codes without exposing the response body', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 429 });
        await expect(analyzeComplaintWithGemini({ complaint, categories, candidates }, {
            apiKey: 'test-gemini-key',
            fetchImpl,
        })).rejects.toThrow('HTTP 429');
    });

    it('reports invalid provider credentials without returning a success-shaped response', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401 });
        await expect(analyzeComplaintWithGemini({ complaint, categories, candidates }, {
            apiKey: 'invalid-test-key',
            fetchImpl,
        })).rejects.toThrow('HTTP 401');
    });

    it('handles request timeouts without exposing provider or key details', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error('network timeout'));
        await expect(analyzeComplaintWithGemini({ complaint, categories, candidates }, {
            apiKey: 'test-gemini-key',
            fetchImpl,
        })).rejects.toThrow('timed out or could not reach Google');
        expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });
});
