import { useState } from 'react';
import { getSubmission, deleteSubmission } from '../../api/submissions.js';
import { useToast } from '../common/Toast.jsx';
import Modal from '../common/Modal.jsx';
import Loading from '../common/Loading.jsx';

function formatDate(d) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function SubmissionHistory({ listId, listType, submissions, onClose, onDeleted }) {
  const toast = useToast();
  const [viewed, setViewed] = useState(null);
  const [loadingView, setLoadingView] = useState(false);

  async function openSubmission(id) {
    setLoadingView(true);
    try {
      const data = await getSubmission(id);
      setViewed(data);
    } catch {
      toast('Failed to load submission', 'error');
    } finally {
      setLoadingView(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this submission?')) return;
    try {
      await deleteSubmission(id);
      toast('Deleted');
      onDeleted();
      if (viewed?.id === id) setViewed(null);
    } catch {
      toast('Failed to delete', 'error');
    }
  }

  return (
    <Modal title="Submission history" onClose={onClose}>
      {loadingView && <Loading text="Loading submission…" />}

      {viewed ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button className="btn btn-ghost" onClick={() => setViewed(null)}>← Back</button>
            <span style={{ color: 'var(--text2)', fontSize: 13 }}>{formatDate(viewed.submittedAt)}</span>
            <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={() => handleDelete(viewed.id)}>Delete</button>
          </div>
          {viewed.notes && (
            <div style={{ background: 'var(--bg3)', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 14, color: 'var(--text2)' }}>
              {viewed.notes}
            </div>
          )}
          {viewed.items.map(si => (
            <div key={si.id} className="submission-item-row">
              <div style={{ fontWeight: 500 }}>{si.item?.title}</div>
              <div className="submission-item-meta">
                {listType === 'CHECKLIST' && (
                  <span style={{ color: si.checked ? 'var(--green)' : 'var(--text3)' }}>
                    {si.checked ? '✓ Checked' : '○ Unchecked'}
                  </span>
                )}
                {listType === 'SCOREBOARD' && si.score != null && (
                  <span style={{ color: 'var(--accent)' }}>Score: {si.score}/10</span>
                )}
                {si.numberValue != null && (
                  <span>{si.numberValue} {si.item?.unit || ''}</span>
                )}
                {si.comment && <span style={{ fontStyle: 'italic' }}>"{si.comment}"</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {submissions.length === 0 && (
            <p style={{ color: 'var(--text3)', fontSize: 14 }}>No submissions yet.</p>
          )}
          <ul style={{ listStyle: 'none' }}>
            {submissions.map(s => (
              <li key={s.id} className="history-item" onClick={() => openSubmission(s.id)}>
                <span>{formatDate(s.submittedAt)}</span>
                {s.notes && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{s.notes.slice(0, 40)}</span>}
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>View →</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
