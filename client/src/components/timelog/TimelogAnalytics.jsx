import { useState, useEffect } from 'react';
import { getAnalytics, getTimelog } from '../../api/timelog.js';
import { getEffort, updateEffortEntry, deleteEffortEntry } from '../../api/effort.js';
import { getUserProjects } from '../../api/projects.js';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useToast } from '../common/Toast.jsx';
import Loading from '../common/Loading.jsx';
import Modal from '../common/Modal.jsx';

function fmtMins(m) {
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  if (h > 0) return `${h}h ${rem}m`;
  return `${rem}m`;
}

function getHistoryModeStorageKey(token) {
  return `scorecard.timelog.historyMode.${token}`;
}

function toLocalInput(dateValue, tz) {
  if (!dateValue) return '';
  try {
    const date = new Date(dateValue);
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    return formatter.format(date).replace(' ', 'T').slice(0, 16);
  } catch {
    return '';
  }
}

function inputToUTC(localValue) {
  if (!localValue) return null;
  return new Date(localValue).toISOString();
}

function flattenProjects(nodes, depth = 0, items = []) {
  nodes.forEach((node) => {
    items.push({ ...node, depth });
    flattenProjects(node.children || [], depth + 1, items);
  });
  return items;
}

export default function TimelogAnalytics({ token, tz, from, to }) {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [projectsTree, setProjectsTree] = useState([]);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [effortEntries, setEffortEntries] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [loading, setLoading] = useState(false);
  const [historyMode, setHistoryMode] = useState(() => {
    try {
      const saved = localStorage.getItem(getHistoryModeStorageKey(token));
      return saved === 'tally' ? 'tally' : 'time';
    } catch {
      return 'time';
    }
  });
  const [editingEffort, setEditingEffort] = useState(null);
  const [editProjectId, setEditProjectId] = useState('');
  const [editLoggedAt, setEditLoggedAt] = useState('');
  const [editComment, setEditComment] = useState('');
  const [savingEffort, setSavingEffort] = useState(false);

  useEffect(() => { load(); }, [token, from, to]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(getHistoryModeStorageKey(token));
      setHistoryMode(saved === 'tally' ? 'tally' : 'time');
    } catch {
      setHistoryMode('time');
    }
  }, [token]);

  useEffect(() => {
    try {
      localStorage.setItem(getHistoryModeStorageKey(token), historyMode);
    } catch {
      // Ignore storage failures and keep current in-memory mode.
    }
  }, [token, historyMode]);

  async function load() {
    setLoading(true);
    try {
      const fromISO = new Date(from + 'T00:00:00').toISOString();
      const toISO = new Date(to + 'T23:59:59').toISOString();
      const [result, tree, entries, effort] = await Promise.all([
        getAnalytics(token, { from: fromISO, to: toISO }),
        getUserProjects(token),
        getTimelog(token, { from: fromISO, to: toISO }),
        getEffort(token, { from: fromISO, to: toISO }),
      ]);
      setData(result);
      setProjectsTree(tree);
      setHistoryEntries((entries || []).sort((a, b) => new Date(b.startTime) - new Date(a.startTime)));
      setEffortEntries((effort || []).sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt)));
    } catch {
      toast('Failed to load analytics', 'error');
    } finally {
      setLoading(false);
    }
  }

  const total = data.reduce((s, d) => s + d.totalMinutes, 0);

  const FALLBACK_COLORS = ['#6c63ff','#4a9eff','#4caf7d','#f5a623','#f06565','#a78bfa','#ff6b9d','#00c9a7'];
  const chartData = data.map((d, i) => ({
    name: d.title,
    value: Math.round(d.totalMinutes),
    color: d.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));

  const ownMap = data.reduce((acc, item) => {
    acc[item.projectId] = item.totalMinutes;
    return acc;
  }, {});

  function buildProjectRows(nodes, depth = 0, parentId = null) {
    const rows = [];
    for (const node of nodes) {
      const ownMinutes = ownMap[node.id] || 0;
      const childRows = buildProjectRows(node.children || [], depth + 1, node.id);
      const childrenTotal = childRows.reduce((sum, r) => sum + r.inclusiveMinutes, 0);
      const inclusiveMinutes = ownMinutes + childrenTotal;
      rows.push({
        id: node.id,
        parentId,
        title: node.title,
        depth,
        color: node.color,
        hasChildren: (node.children || []).length > 0,
        ownMinutes,
        inclusiveMinutes,
      });
      rows.push(...childRows);
    }
    return rows;
  }

  const projectRows = buildProjectRows(projectsTree).filter(r => r.inclusiveMinutes > 0 || r.ownMinutes > 0);
  const hierarchicalTotal = projectRows
    .filter(r => r.depth === 0)
    .reduce((sum, r) => sum + r.inclusiveMinutes, 0);

  const rowsById = projectRows.reduce((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});

  function isVisible(row) {
    let currParentId = row.parentId;
    while (currParentId) {
      if (collapsed[currParentId]) return false;
      currParentId = rowsById[currParentId]?.parentId || null;
    }
    return true;
  }

  const visibleRows = projectRows.filter(isVisible);

  function toggleCollapse(id) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function expandAll() {
    setCollapsed({});
  }

  function collapseAll() {
    const next = {};
    for (const row of projectRows) {
      if (row.hasChildren) next[row.id] = true;
    }
    setCollapsed(next);
  }

  function formatDateTime(d, timezone) {
    return new Date(d).toLocaleString('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function entryDurationMinutes(entry) {
    const start = new Date(entry.startTime);
    const end = entry.endTime ? new Date(entry.endTime) : new Date(entry.submittedAt);
    return Math.max(0, (end - start) / 60000);
  }

  const hasTimeData = data.length > 0;
  const flatProjects = flattenProjects(projectsTree);

  function openEditEffort(entry) {
    setEditingEffort(entry);
    setEditProjectId(entry.projectId);
    setEditLoggedAt(toLocalInput(entry.loggedAt, tz));
    setEditComment(entry.comment || '');
  }

  async function handleSaveEffort() {
    if (!editingEffort || !editProjectId || !editLoggedAt) return;
    setSavingEffort(true);
    try {
      await updateEffortEntry(editingEffort.id, {
        projectId: editProjectId,
        loggedAt: inputToUTC(editLoggedAt),
        comment: editComment,
      });
      await load();
      setEditingEffort(null);
      toast('Tally updated');
    } catch {
      toast('Failed to update tally', 'error');
    } finally {
      setSavingEffort(false);
    }
  }

  async function handleDeleteEffort(entry) {
    if (!confirm('Delete this tally?')) return;
    try {
      await deleteEffortEntry(entry.id);
      await load();
      if (editingEffort?.id === entry.id) setEditingEffort(null);
      toast('Tally deleted');
    } catch {
      toast('Failed to delete tally', 'error');
    }
  }

  return (
    <div className="card">
      <div className="section-header">
        <span className="section-title">Time analytics</span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          Using date range {from} to {to}
        </div>
      </div>

      {loading && <Loading text="Calculating…" />}

      {!loading && !hasTimeData && (
        <div className="empty"><p>No time entries in this range.</p></div>
      )}

      {!loading && hasTimeData && (
        <>
          <div className="chart-container">
            <ResponsiveContainer width={280} height={280}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  innerRadius={50}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => [fmtMins(v), 'Time']}
                  contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}
                  itemStyle={{ color: 'var(--text)' }}
                  labelStyle={{ color: 'var(--text2)' }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>
                Total: <strong style={{ color: 'var(--text)' }}>{fmtMins(total)}</strong>
              </div>
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Time</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d, i) => (
                    <tr key={d.projectId}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length], flexShrink: 0 }} />
                          {d.title}
                        </div>
                      </td>
                      <td>{fmtMins(d.totalMinutes)}</td>
                      <td>{total > 0 ? Math.round((d.totalMinutes / total) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Projects Hierarchy Totals</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={expandAll} disabled={projectRows.length === 0}>Expand all</button>
                <button className="btn btn-secondary btn-sm" onClick={collapseAll} disabled={projectRows.length === 0}>Collapse all</button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>
              Each row shows time directly on the project and the rolled-up sum including all child projects.
            </div>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Own Time</th>
                  <th>With Children</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: `${row.depth * 18}px` }}>
                        {row.hasChildren ? (
                          <button
                            className="btn-icon"
                            style={{ width: 18, height: 18, fontSize: 11 }}
                            onClick={() => toggleCollapse(row.id)}
                            title={collapsed[row.id] ? 'Expand children' : 'Collapse children'}
                          >
                            {collapsed[row.id] ? '▶' : '▼'}
                          </button>
                        ) : (
                          <span style={{ width: 18, display: 'inline-block' }} />
                        )}
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: row.color || 'var(--text3)', flexShrink: 0 }} />
                        {row.depth > 0 && <span style={{ color: 'var(--text3)' }}>{'↳'.repeat(Math.min(row.depth, 3))}</span>}
                        <span>{row.title}</span>
                      </div>
                    </td>
                    <td>{fmtMins(row.ownMinutes)}</td>
                    <td><strong>{fmtMins(row.inclusiveMinutes)}</strong></td>
                    <td>{hierarchicalTotal > 0 ? Math.round((row.inclusiveMinutes / hierarchicalTotal) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && (
        <>

          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{historyMode === 'time' ? 'Time History (Linear)' : 'Tally History'}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`btn btn-secondary btn-sm ${historyMode === 'time' ? 'active-edit-btn' : ''}`} onClick={() => setHistoryMode('time')}>
                  Time history
                </button>
                <button className={`btn btn-secondary btn-sm ${historyMode === 'tally' ? 'active-edit-btn' : ''}`} onClick={() => setHistoryMode('tally')}>
                  Tally history
                </button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>
              {historyMode === 'time'
                ? 'Chronological log of time entries in the selected range.'
                : 'Chronological tally log in the selected range, including comments.'}
            </div>
            {historyMode === 'time' ? (
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Start ({tz})</th>
                    <th>End ({tz})</th>
                    <th>Duration</th>
                    <th>Project</th>
                    <th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {historyEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ color: 'var(--text3)' }}>No time history in this range.</td>
                    </tr>
                  )}
                  {historyEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.startTime, tz)}</td>
                      <td>{entry.endTime ? formatDateTime(entry.endTime, tz) : 'Open'}</td>
                      <td>{fmtMins(entryDurationMinutes(entry))}</td>
                      <td>{entry.project?.title || 'Unknown'}</td>
                      <td style={{ maxWidth: 280, whiteSpace: 'normal' }}>{entry.comment || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Time ({tz})</th>
                    <th>Project</th>
                    <th>Comment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {effortEntries.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--text3)' }}>No tally history in this range.</td>
                    </tr>
                  )}
                  {effortEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.loggedAt, tz)}</td>
                      <td>{entry.project?.title || 'Unknown'}</td>
                      <td style={{ maxWidth: 320, whiteSpace: 'normal' }}>{entry.comment || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditEffort(entry)}>Edit</button>
                        <button className="btn btn-danger btn-sm" style={{ marginLeft: 8 }} onClick={() => handleDeleteEffort(entry)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {editingEffort && (
        <Modal
          title="Edit tally"
          onClose={() => { if (!savingEffort) setEditingEffort(null); }}
          actions={(
            <>
              <button className="btn btn-secondary" onClick={() => setEditingEffort(null)} disabled={savingEffort}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEffort} disabled={savingEffort || !editProjectId || !editLoggedAt}>
                {savingEffort ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        >
          <div className="form-group">
            <label>Project</label>
            <select value={editProjectId} onChange={e => setEditProjectId(e.target.value)}>
              {flatProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {`${'  '.repeat(project.depth)}${project.title}`}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Time ({tz})</label>
            <input type="datetime-local" value={editLoggedAt} onChange={e => setEditLoggedAt(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Comment</label>
            <textarea value={editComment} onChange={e => setEditComment(e.target.value)} placeholder="Add a note for this tally…" style={{ minHeight: 90 }} />
          </div>
        </Modal>
      )}
    </div>
  );
}
