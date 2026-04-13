import { useEffect, useState } from 'react';
import { getSubmission, getSubmissionAnalytics, deleteSubmission } from '../../api/submissions.js';
import { useToast } from '../common/Toast.jsx';
import Modal from '../common/Modal.jsx';
import Loading from '../common/Loading.jsx';

function formatDate(d) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ScoreScalePreview({ score }) {
  return (
    <div className="score-display score-display-readonly" aria-label={`Score ${score ?? 0} out of 10`}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
        <span key={value} className={`score-pip score-pip-readonly ${score !== null && score !== undefined && score >= value ? 'filled' : ''}`}>
          {value}
        </span>
      ))}
    </div>
  );
}

function localDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayStr() {
  return localDateStr(new Date());
}

function fifteenDaysAgoStr() {
  const date = new Date();
  date.setDate(date.getDate() - 14);
  return localDateStr(date);
}

function buildItemTree(items) {
  const map = {};
  items.forEach((item) => {
    map[item.id] = { ...item, children: [] };
  });

  const roots = [];
  Object.values(map).forEach((node) => {
    if (node.parentId && map[node.parentId]) {
      map[node.parentId].children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export default function SubmissionHistory({ listId, listType, submissions, onClose, onDeleted }) {
  const toast = useToast();
  const [viewed, setViewed] = useState(null);
  const [loadingView, setLoadingView] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [mode, setMode] = useState(listType === 'CHECKLIST' ? 'analytics' : 'history');
  const [from, setFrom] = useState(fifteenDaysAgoStr());
  const [to, setTo] = useState(todayStr());
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  function buildSubmissionTree(items) {
    const map = {};
    items.forEach((si) => {
      if (!si.item) return;
      map[si.item.id] = { ...si, children: [] };
    });

    const roots = [];
    Object.values(map).forEach((node) => {
      const parentId = node.item?.parentId || null;
      if (parentId && map[parentId]) {
        map[parentId].children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  useEffect(() => {
    if (listType !== 'CHECKLIST') return;
    loadAnalytics(from, to);
  }, [listId]);

  async function loadAnalytics(fromValue, toValue) {
    setLoadingAnalytics(true);
    try {
      const data = await getSubmissionAnalytics(listId, { from: fromValue, to: toValue });
      setAnalytics(data);
    } catch {
      toast('Failed to load checklist analytics', 'error');
    } finally {
      setLoadingAnalytics(false);
    }
  }

  async function openSubmission(id) {
    setLoadingView(true);
    try {
      const data = await getSubmission(id);
      setViewed(data);
      setCollapsed({});
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
          {buildSubmissionTree(viewed.items || []).map(node => (
            <SubmissionTreeRow
              key={node.id}
              node={node}
              listType={listType}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              depth={0}
            />
          ))}
        </div>
      ) : (
        <div>
          {listType === 'CHECKLIST' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button className={`btn btn-secondary btn-sm ${mode === 'analytics' ? 'active-edit-btn' : ''}`} onClick={() => setMode('analytics')}>Analytics</button>
              <button className={`btn btn-secondary btn-sm ${mode === 'history' ? 'active-edit-btn' : ''}`} onClick={() => setMode('history')}>History</button>
            </div>
          )}

          {listType === 'CHECKLIST' && mode === 'analytics' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>From</label>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 160 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>To</label>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 160 }} />
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => loadAnalytics(from, to)} style={{ height: 38 }}>Apply</button>
              </div>
              {loadingAnalytics && <Loading text="Loading analytics…" />}
              {!loadingAnalytics && analytics && (
                <div>
                  <div className="checklist-analytics-summary">
                    Showing how many days each checklist item was checked in the selected range.
                  </div>
                  <div className="checklist-analytics-list">
                    {buildItemTree(analytics.items || []).map((node) => (
                      <ChecklistAnalyticsRow key={node.id} node={node} rangeDays={analytics.rangeDays} depth={0} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(listType !== 'CHECKLIST' || mode === 'history') && (
            <>
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
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function ChecklistAnalyticsRow({ node, rangeDays, depth }) {
  return (
    <div className="checklist-analytics-row">
      <div style={{ paddingLeft: `${depth * 22}px`, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ width: 18, display: 'inline-block' }} />
        <span style={{ fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.title}
          {node.unit && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 6 }}>[{node.unit}]</span>}
        </span>
      </div>
      <div className="checklist-analytics-count">{node.checkedDays}/{rangeDays}</div>
      {node.children?.length > 0 && node.children.map((child) => (
        <ChecklistAnalyticsRow key={child.id} node={child} rangeDays={rangeDays} depth={depth + 1} />
      ))}
    </div>
  );
}

function SubmissionTreeRow({ node, listType, collapsed, setCollapsed, depth }) {
  const hasChildren = (node.children || []).length > 0;
  const isCollapsed = !!collapsed[node.id];
  const isScorecard = listType === 'SCORECARD' || listType === 'SCOREBOARD';

  return (
    <div>
      <div className="submission-item-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: `${depth * 22}px` }}>
          {hasChildren ? (
            <button
              className="collapse-btn"
              onClick={() => setCollapsed(prev => ({ ...prev, [node.id]: !prev[node.id] }))}
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
          ) : (
            <span style={{ width: 18, display: 'inline-block' }} />
          )}
          <div style={{ fontWeight: 500 }}>
            {node.item?.title}
            {listType === 'CHECKLIST' && node.item?.unit && (
              <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 6 }}>[{node.item.unit}]</span>
            )}
          </div>
        </div>

        <div className="submission-item-meta">
          {listType === 'CHECKLIST' && (
            <span style={{ color: node.checked ? 'var(--green)' : 'var(--text3)' }}>
              {node.checked ? '✓ Checked' : '○ Unchecked'}
            </span>
          )}
          {isScorecard && (
            <ScoreScalePreview score={node.score} />
          )}
          {listType === 'CHECKLIST' && node.numberValue != null && (
            <span>{node.numberValue} {node.item?.unit || ''}</span>
          )}
          {node.comment && <span style={{ fontStyle: 'italic' }}>"{node.comment}"</span>}
        </div>
      </div>

      {hasChildren && !isCollapsed && node.children.map(child => (
        <SubmissionTreeRow
          key={child.id}
          node={child}
          listType={listType}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
