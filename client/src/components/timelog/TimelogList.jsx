import { useMemo, useState } from 'react';

function formatDuration(startTime, endTime, submittedAt) {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date(submittedAt);
  const ms = Math.max(0, end - start);
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs > 0) return `${hrs}h ${rem}m`;
  return `${mins}m`;
}

function formatTime(d, tz) {
  try {
    return new Date(d).toLocaleString('en-US', {
      timeZone: tz,
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return new Date(d).toLocaleString(); }
}

const EST = 'America/New_York';

function toLocalInput(date, tz) {
  if (!date) return '';
  try {
    const d = new Date(date);
    const fmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    return fmt.format(d).replace(' ', 'T').slice(0, 16);
  } catch {
    return '';
  }
}

function formatDurationFromInputs(startLocal, endLocal) {
  if (!startLocal) return '';
  const start = new Date(startLocal);
  const end = endLocal ? new Date(endLocal) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const mins = Math.floor((end - start) / 60000);
  if (mins < 0) return 'End time is before start time';
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;
}

export default function TimelogList({ entries, tz, onDelete, onUpdate }) {
  const [editingId, setEditingId] = useState(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [savingId, setSavingId] = useState(null);

  const editDurationPreview = useMemo(() => formatDurationFromInputs(editStart, editEnd), [editStart, editEnd]);

  if (entries.length === 0) {
    return <div className="empty"><p>No log entries yet.</p></div>;
  }

  function startEditing(entry) {
    setEditingId(entry.id);
    setEditStart(toLocalInput(entry.startTime, tz));
    setEditEnd(toLocalInput(entry.endTime, tz));
  }

  async function saveEdit(entryId) {
    if (!editStart) return;
    if (editEnd && new Date(editEnd) < new Date(editStart)) return;
    setSavingId(entryId);
    const ok = await onUpdate(entryId, {
      startTime: new Date(editStart).toISOString(),
      endTime: editEnd ? new Date(editEnd).toISOString() : null,
    });
    setSavingId(null);
    if (ok) {
      setEditingId(null);
      setEditStart('');
      setEditEnd('');
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditStart('');
    setEditEnd('');
  }

  return (
    <div>
      {entries.map(e => (
        <div key={e.id} className="timelog-entry" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: e.project?.color || 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>
              {e.project?.title}
              <span style={{ fontWeight: 400, color: 'var(--text2)', marginLeft: 8 }}>
                {formatDuration(e.startTime, e.endTime, e.submittedAt)}
              </span>
            </div>
            {e.comment && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{e.comment}</div>}
            <div className="timelog-meta">
              {formatTime(e.startTime, tz)}
              {e.endTime && <> → {formatTime(e.endTime, tz)}</>}
              {tz !== EST && (
                <span style={{ marginLeft: 8, opacity: 0.6 }}>
                  | EST: {formatTime(e.startTime, EST)}
                </span>
              )}
            </div>
            {editingId === e.id && (
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input type="datetime-local" value={editStart} onChange={(evt) => setEditStart(evt.target.value)} />
                  <input type="datetime-local" value={editEnd} onChange={(evt) => setEditEnd(evt.target.value)} placeholder="End (optional)" />
                </div>
                {editDurationPreview && (
                  <div style={{ fontSize: 12, color: editDurationPreview.startsWith('End time') ? 'var(--red)' : 'var(--text3)' }}>
                    Duration preview: {editDurationPreview}{editStart && !editEnd && !editDurationPreview.startsWith('End time') ? ' (so far)' : ''}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" disabled={savingId === e.id || !editStart || editDurationPreview.startsWith('End time')} onClick={() => saveEdit(e.id)}>
                    {savingId === e.id ? 'Saving…' : 'Save times'}
                  </button>
                  <button className="btn btn-secondary btn-sm" disabled={savingId === e.id} onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {editingId !== e.id && (
              <button className="btn-icon" onClick={() => startEditing(e)} title="Edit times">✎</button>
            )}
            <button className="btn-icon" style={{ color: 'var(--red)' }} onClick={() => onDelete(e.id)} title="Delete">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
