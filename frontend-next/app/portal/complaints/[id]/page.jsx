'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PortalShell } from '../../../../src/components/PortalShell';
import { useAuth } from '../../../../src/components/AuthProvider';
import { apiBlob, apiRequest } from '../../../../src/lib/api';
const nextStatuses = ['UNDER_INVESTIGATION', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED', 'CLOSED'];
function PrivateImage({ complaintId, imageId, resolution = false }) {
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        let objectUrl = '';
        apiBlob(`/complaints/${complaintId}/${resolution ? 'resolution-evidence' : 'images'}/${imageId}`)
            .then((blob) => {
            objectUrl = URL.createObjectURL(blob);
            if (active)
                setUrl(objectUrl);
        })
            .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load evidence.'));
        return () => {
            active = false;
            if (objectUrl)
                URL.revokeObjectURL(objectUrl);
        };
    }, [complaintId, imageId, resolution]);
    if (error)
        return <div className="image-error">{error}</div>;
    return url ? <img className="evidence-image" src={url} alt={resolution ? 'Resolution evidence' : 'Citizen-submitted evidence'}/> : <div className="image-placeholder"><span className="spinner"/>Loading private evidence…</div>;
}
export default function ComplaintDetailPage() {
    const { id } = useParams();
    const { user } = useAuth();
    const [complaint, setComplaint] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [duplicates, setDuplicates] = useState(null);
    const [officers, setOfficers] = useState([]);
    const [selectedOfficer, setSelectedOfficer] = useState('');
    const [note, setNote] = useState('');
    const [reviewNotes, setReviewNotes] = useState('');
    const [investigationFiles, setInvestigationFiles] = useState(null);
    const [resolutionFile, setResolutionFile] = useState(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [working, setWorking] = useState(false);
    const refresh = async () => {
        const record = await apiRequest(`/complaints/${id}`);
        setComplaint(record);
        const aiHistory = await apiRequest(`/complaints/${id}/ai-analysis`);
        setAnalysis(aiHistory);
        if (user?.role === 'ADMIN') {
            const reviewData = await apiRequest(`/admin/complaints/${id}/duplicates`);
            setDuplicates(reviewData);
            const staff = await apiRequest('/admin/officers');
            setOfficers(staff.filter((person) => person.status === 'ACTIVE'));
        }
    };
    useEffect(() => {
        if (!user || !id)
            return;
        refresh().catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load the grievance.'));
    }, [user, id]);
    useEffect(() => {
        if (!user || !id || !['QUEUED', 'PROCESSING'].includes(analysis?.latest?.status ?? ''))
            return;
        let active = true;
        const timer = setInterval(() => {
            apiRequest(`/complaints/${id}/ai-analysis`)
                .then((result) => { if (active)
                    setAnalysis(result); })
                .catch((reason) => { if (active)
                    setError(reason instanceof Error ? reason.message : 'Unable to refresh AI analysis.'); });
        }, 3000);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [user, id, analysis?.latest?.status]);
    const assignedOfficer = useMemo(() => complaint?.assignments?.[0]?.officer?.officerProfile?.fullName ?? complaint?.assignments?.[0]?.officer?.email ?? 'Unassigned', [complaint]);
    async function act(action, success) {
        setWorking(true);
        setError('');
        setMessage('');
        try {
            await action();
            await refresh();
            setMessage(success);
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : 'The action could not be completed.');
        }
        finally {
            setWorking(false);
        }
    }
    async function addNote(event) {
        event.preventDefault();
        if (!note.trim())
            return;
        await act(async () => {
            await apiRequest(`/complaints/${id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: note.trim(), isPublic: true }) });
            setNote('');
        }, 'Investigation note added.');
    }
    async function updateStatus(status) {
        await act(() => apiRequest(`/complaints/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }), 'Grievance status updated.');
    }
    async function assign(event) {
        event.preventDefault();
        if (!selectedOfficer)
            return;
        await act(() => apiRequest(`/admin/complaints/${id}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ officerId: selectedOfficer }) }), 'Officer assigned.');
    }
    async function uploadResolution(event) {
        event.preventDefault();
        if (!resolutionFile)
            return;
        const body = new FormData();
        body.append('image', resolutionFile);
        await act(() => apiRequest(`/complaints/${id}/resolution-evidence`, { method: 'POST', body }), 'Resolution evidence uploaded.');
        setResolutionFile(null);
    }
    async function uploadInvestigation(event) {
        event.preventDefault();
        if (!investigationFiles?.length)
            return;
        const files = Array.from(investigationFiles);
        if (files.length > 4 || files.some((file) => file.size > 512 * 1024)) {
            setError('Choose no more than four images, each 512 KB or smaller.');
            return;
        }
        const body = new FormData();
        files.forEach((file) => body.append('images', file));
        await act(() => apiRequest(`/complaints/${id}/images`, { method: 'POST', body }), 'Investigation evidence uploaded.');
        setInvestigationFiles(null);
    }
    async function review(candidateId, decision) {
        await act(() => apiRequest(`/admin/complaints/${id}/duplicate-reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidateId, decision, notes: reviewNotes || undefined }),
        }), 'Duplicate review decision saved.');
        setReviewNotes('');
    }
    if (!complaint)
        return <PortalShell><div className="loading-block"><span className="spinner"/>Loading grievance details…</div>{error && <p className="form-error" role="alert">{error}</p>}</PortalShell>;
    const result = analysis?.latest?.result ?? null;
    const officerCanUpdate = user?.role === 'OFFICER' || user?.role === 'ADMIN';
    return (<PortalShell>
      <div className="breadcrumb"><Link href="/portal/complaints">Grievances</Link><span>/</span><span>{complaint.trackingId}</span></div>
      <section className="page-heading heading-with-action">
        <div><span className="eyebrow">{complaint.trackingId}</span><h1>{complaint.title}</h1><p>Submitted {new Date(complaint.createdAt).toLocaleString()} · {complaint.category?.name ?? 'Uncategorized'}</p></div>
        <span className={`status-pill status-${complaint.status.toLowerCase()}`}>{complaint.status.replaceAll('_', ' ')}</span>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
      <div className="detail-grid">
        <div className="detail-main">
          <section className="content-card">
            <div className="section-heading"><div><h2>Issue details</h2><p>Submitted by {complaint.citizen?.citizenProfile?.fullName ?? complaint.citizen?.email ?? 'Citizen'}</p></div><span className={`priority priority-${complaint.priority.toLowerCase()}`}>{complaint.priority} priority</span></div>
            <p className="description-copy">{complaint.description}</p>
            {complaint.location && <div className="location-panel"><span className="location-icon">⌖</span><div><strong>Reported location</strong><p>{complaint.location.address}, {complaint.location.city}, {complaint.location.district}, {complaint.location.state} {complaint.location.pincode}</p><small>{complaint.location.latitude}, {complaint.location.longitude}</small></div></div>}
          </section>
          <section className="content-card">
            <div className="section-heading"><div><h2>Submitted evidence</h2><p>Private images attached to this grievance</p></div><span className="count-pill">{complaint.images?.length ?? 0}</span></div>
            {complaint.images?.length ? <div className="evidence-grid">{complaint.images.map((image) => <PrivateImage key={image.id} complaintId={id} imageId={image.id}/>)}</div> : <p className="muted">No images were attached to this report.</p>}
          </section>
          <section className="content-card">
            <div className="section-heading"><div><h2>Case history</h2><p>Status changes and investigation notes</p></div></div>
            <div className="timeline">
              {complaint.history?.map((item, index) => <div className="timeline-item" key={`${item.createdAt}-${index}`}><span className="timeline-dot"/><div><strong>{item.toStatus.replaceAll('_', ' ')}</strong><p>{item.note || 'Status updated.'}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div></div>)}
              {complaint.notes?.map((item, index) => <div className="timeline-item" key={`${item.createdAt}-note-${index}`}><span className="timeline-dot note-dot"/><div><strong>Investigation note</strong><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div></div>)}
              {!complaint.history?.length && !complaint.notes?.length && <p className="muted">No updates have been recorded.</p>}
            </div>
          </section>
          {officerCanUpdate && <section className="content-card">
            <div className="section-heading"><div><h2>Investigation actions</h2><p>Keep the citizen informed as the case progresses.</p></div></div>
            <form className="inline-form" onSubmit={addNote}><label className="grow">Add a public note<textarea required maxLength={4000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Share a progress update with the citizen."/></label><button className="button button-primary" disabled={working}>Add note</button></form>
            <div className="form-actions"><label>Update status<select value="" onChange={(event) => event.target.value && void updateStatus(event.target.value)} disabled={working}><option value="">Choose a status</option>{nextStatuses.filter((status) => status !== complaint.status).map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label></div>
            <form className="inline-form" onSubmit={uploadInvestigation}><label>Investigation evidence<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setInvestigationFiles(event.target.files)}/><small>Up to four images, 512 KB each.</small></label><button className="button button-quiet" disabled={!investigationFiles?.length || working}>Upload evidence</button></form>
            <form className="inline-form" onSubmit={uploadResolution}><label>Resolution evidence<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setResolutionFile(event.target.files?.[0] ?? null)}/></label><button className="button button-quiet" disabled={!resolutionFile || working}>Upload evidence</button></form>
            {!!complaint.resolutionEvidence?.length && <div className="evidence-grid compact">{complaint.resolutionEvidence.map((item) => <PrivateImage key={item.id} complaintId={id} imageId={item.id} resolution/>)}</div>}
          </section>}
          {user?.role === 'ADMIN' && <section className="content-card">
            <div className="section-heading"><div><h2>Assignment</h2><p>Current officer: {assignedOfficer}</p></div></div>
            <form className="inline-form" onSubmit={assign}><label>Assign to<select required value={selectedOfficer} onChange={(event) => setSelectedOfficer(event.target.value)}><option value="">Select an officer</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.officerProfile?.fullName ?? officer.email}</option>)}</select></label><button className="button button-primary" disabled={!selectedOfficer || working}>Assign</button></form>
          </section>}
          {user?.role === 'ADMIN' && <section className="content-card">
            <div className="section-heading"><div><h2>Duplicate review</h2><p>AI suggestions are advisory; the score is a signal, not a probability.</p></div><span className={`status-pill status-${(duplicates?.analysisStatus ?? 'queued').toLowerCase()}`}>{duplicates?.analysisStatus ?? 'Loading'}</span></div>
            {duplicates?.analysisStatus === 'NOT_CONFIGURED' && <p className="muted">Automatic duplicate detection is not configured. No candidates were generated.</p>}
            {duplicates && !['NOT_CONFIGURED', 'COMPLETED'].includes(duplicates.analysisStatus) && <p className="muted">Analysis status: {duplicates.analysisStatus}. Candidates will appear when processing completes.</p>}
            {duplicates?.analysisStatus === 'COMPLETED' && !duplicates.candidates.length && <p className="muted">No AI-generated candidates were returned for this complaint.</p>}
            {duplicates?.candidates.map((candidate) => <div className="candidate-card" key={candidate.id}><div><strong>{candidate.title}</strong><p>{candidate.trackingId} · {Math.round(candidate.similarity * 100)}% weighted signal score</p><small>{candidate.description}</small><div className="signal-list">{candidate.signals.map((signal) => <span key={signal.name}>{signal.name.replaceAll('_', ' ')}: {signal.value.toFixed(2)}</span>)}</div></div><div className="button-row compact-actions"><button className="button button-quiet" disabled={working} onClick={() => void review(candidate.id, 'LINKED')}>Link</button><button className="button button-quiet" disabled={working} onClick={() => void review(candidate.id, 'SEPARATE')}>Not duplicate</button><button className="button button-quiet" disabled={working} onClick={() => void review(candidate.id, 'MANUAL_REVIEW')}>Review later</button></div></div>)}
            {duplicates?.geminiCandidates?.map((candidate) => <div className="candidate-card" key={`gemini-${candidate.id}`}><div><strong>{candidate.title}</strong><p>{candidate.trackingId} · Gemini advisory; model-reported confidence {Math.round(candidate.confidence * 100)}% (not calibrated)</p><small>{candidate.reason}</small></div><div className="button-row compact-actions"><button className="button button-quiet" disabled={working} onClick={() => void review(candidate.id, 'LINKED')}>Link</button><button className="button button-quiet" disabled={working} onClick={() => void review(candidate.id, 'SEPARATE')}>Not duplicate</button><button className="button button-quiet" disabled={working} onClick={() => void review(candidate.id, 'MANUAL_REVIEW')}>Review later</button></div></div>)}
            <label>Review note<input maxLength={4000} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Optional context for your decision"/></label>
            {!!duplicates?.reviews.length && <div className="review-history"><h3>Decision history</h3>{duplicates.reviews.map((reviewItem) => <p key={reviewItem.id}><strong>{reviewItem.decision.replaceAll('_', ' ')}</strong> · {reviewItem.reviewer?.email ?? 'Administrator'} · {new Date(reviewItem.createdAt).toLocaleString()}{reviewItem.notes && <small>{reviewItem.notes}</small>}</p>)}</div>}
          </section>}
        </div>
        <aside className="detail-sidebar">
          <section className="content-card"><h2>Case summary</h2><dl className="summary-list"><div><dt>Category</dt><dd>{complaint.category?.name ?? '—'}</dd></div><div><dt>Department</dt><dd>{complaint.department?.name ?? 'Unassigned'}</dd></div><div><dt>Severity</dt><dd>{complaint.severity}</dd></div><div><dt>Assigned officer</dt><dd>{assignedOfficer}</dd></div><div><dt>Reported</dt><dd>{new Date(complaint.createdAt).toLocaleDateString()}</dd></div></dl></section>
          <section className="content-card ai-card"><span className="eyebrow">Decision support</span><h2>AI analysis</h2><span className={`status-pill status-${(analysis?.latest?.status ?? 'queued').toLowerCase()}`}>{analysis?.latest?.status ?? 'Loading'}</span>
            {analysis?.latest?.error && <p className="form-error" role="status">{analysis.latest.error}</p>}
            {result?.geminiAnalysis?.status === 'FAILED' && <p className="form-error" role="status">{result.geminiAnalysis.error ?? 'Gemini analysis could not be completed.'}</p>}
            {result?.geminiAnalysis?.status === 'COMPLETED' && <div className="summary-list">
              <div><dt>Suggested category</dt><dd>{result.geminiAnalysis.category}</dd></div>
              <div><dt>Suggested department</dt><dd>{result.geminiAnalysis.department ?? 'Not assigned'}</dd></div>
              <div><dt>Suggested priority</dt><dd>{result.geminiAnalysis.priority}</dd></div>
              <div><dt>Model-reported confidence</dt><dd>{Math.round(result.geminiAnalysis.confidence * 100)}% · not calibrated</dd></div>
              <div className="span-two"><dt>Summary</dt><dd>{result.geminiAnalysis.summary}</dd></div>
              {!!result.geminiAnalysis.keywords?.length && <div className="span-two"><dt>Keywords</dt><dd>{result.geminiAnalysis.keywords.join(', ')}</dd></div>}
              {!!result.geminiAnalysis.locationMentions?.length && <div className="span-two"><dt>Location mentions</dt><dd>{result.geminiAnalysis.locationMentions.join(', ')}</dd></div>}
            </div>}
            {result && <><div className="summary-list"><div><dt>Existing analysis category</dt><dd>{String(result.predictedCategory?.name ?? 'Not available')}</dd></div><div><dt>Existing priority recommendation</dt><dd>{String(result.recommendedPriority?.value ?? 'Not available')}</dd></div><div><dt>Human review</dt><dd>Required</dd></div></div><p className="security-note">AI output is advisory and does not replace human review or determine fraud.</p></>}
            {!result && !analysis?.latest?.error && <p className="muted">Analysis results will appear here when available.</p>}
          </section>
        </aside>
      </div>
    </PortalShell>);
}
