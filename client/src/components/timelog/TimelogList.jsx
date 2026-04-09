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

export default function TimelogList({ entries, tz, onDelete }) {
  if (entries.length === 0) {
    return <div className="empty"><p>No log entries yet.</p></div>;
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
          </div>
          <button className="btn-icon" style={{ color: 'var(--red)' }} onClick={() => onDelete(e.id)} title="Delete">✕</button>
        </div>
      ))}
    </div>
  );
}
