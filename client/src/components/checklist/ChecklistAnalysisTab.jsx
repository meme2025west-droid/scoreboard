import { useState, useEffect, useMemo } from 'react';
import { getUserLists } from '../../api/lists.js';
import { getDetailedAnalytics } from '../../api/submissions.js';
import { useToast } from '../common/Toast.jsx';
import Loading from '../common/Loading.jsx';

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

export default function ChecklistAnalysisTab({ token }) {
  const toast = useToast();
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [collapsedItemIds, setCollapsedItemIds] = useState(() => new Set());
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const itemTree = useMemo(() => buildItemTree(analytics?.items || []), [analytics?.items]);

  useEffect(() => {
    getUserLists(token).then(data => {
      const checklists = data.filter(l => l.type === 'CHECKLIST');
      setLists(checklists);
      if (checklists.length > 0) setSelectedListId(checklists[0].id);
    }).catch(() => toast('Failed to load lists', 'error'));
  }, [token]);

  useEffect(() => {
    if (selectedListId) {
      loadAnalytics();
    }
  }, [selectedListId, fromDate, toDate]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const data = await getDetailedAnalytics(selectedListId, { from: fromDate, to: toDate });
      setAnalytics(data);
    } catch {
      toast('Failed to load analysis', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const next = new Set();
    (analytics?.items || []).forEach((item) => {
      if (item.collapsed) next.add(item.id);
    });
    setCollapsedItemIds(next);
  }, [analytics?.items]);

  if (!selectedListId) return <div className="card"><p>No checklists found</p></div>;

  return (
    <div className="card">
      <div className="section-header" style={{ marginBottom: 20 }}>
        <span className="section-title">Checklist Analysis</span>
      </div>

      <div className="form-row" style={{ marginBottom: 20 }}>
        <div className="form-group">
          <label>List</label>
          <select value={selectedListId} onChange={e => setSelectedListId(e.target.value)}>
            {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label>To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
      </div>

      {analytics && !loading && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setCollapsedItemIds(new Set())}>Expand all</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setCollapsedItemIds(new Set(getCollapsibleIds(itemTree)))}>Collapse all</button>
        </div>
      )}

      {loading && <Loading />}
      {analytics && !loading && (
        <div style={{ overflowX: 'auto' }}>
          <table className="analytics-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200, textAlign: 'left' }}>Item</th>
                {analytics.dates.map(date => (
                  <th key={date} style={{ minWidth: 80, textAlign: 'center', fontSize: 12 }}>
                    {formatDate(date)}
                  </th>
                ))}
                <th style={{ minWidth: 100, textAlign: 'center' }}>Frequency</th>
              </tr>
            </thead>
            <tbody>
              {itemTree.map((item) => (
                <ChecklistAnalysisRow
                  key={item.id}
                  item={item}
                  dates={analytics.dates}
                  totalDates={analytics.dates.length}
                  depth={0}
                  collapsedItemIds={collapsedItemIds}
                  setCollapsedItemIds={setCollapsedItemIds}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChecklistAnalysisRow({ item, dates, totalDates, depth, collapsedItemIds, setCollapsedItemIds }) {
  const hasChildren = (item.children || []).length > 0;
  const isCollapsed = collapsedItemIds.has(item.id);
  const completedCount = Object.values(item.valuesByDate || {}).filter((value) => value?.checked).length;
  const frequency = `${completedCount}/${totalDates}`;

  return (
    <>
      <tr>
        <td style={{ textAlign: 'left' }}>
          <div style={{ paddingLeft: `${depth * 22}px`, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {hasChildren ? (
              <button
                className="collapse-btn"
                onClick={() => {
                  setCollapsedItemIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) {
                      next.delete(item.id);
                    } else {
                      next.add(item.id);
                    }
                    return next;
                  });
                }}
                title={isCollapsed ? 'Expand children' : 'Collapse children'}
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
            ) : (
              <span style={{ width: 18, display: 'inline-block' }} />
            )}
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
              {item.unit && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 6 }}>[{item.unit}]</span>}
            </span>
          </div>
        </td>
        {dates.map((date) => {
          const value = item.valuesByDate?.[date];
          return (
            <td key={date} style={{ textAlign: 'center', backgroundColor: value?.checked ? '#e8f5e9' : '#fff3e0' }}>
              {value?.checked ? '✓' : ''}
            </td>
          );
        })}
        <td style={{ textAlign: 'center', fontWeight: 500 }}>{frequency}</td>
      </tr>
      {hasChildren && !isCollapsed && item.children.map((child) => (
        <ChecklistAnalysisRow
          key={child.id}
          item={child}
          dates={dates}
          totalDates={totalDates}
          depth={depth + 1}
          collapsedItemIds={collapsedItemIds}
          setCollapsedItemIds={setCollapsedItemIds}
        />
      ))}
    </>
  );
}

function buildItemTree(items) {
  const byId = new Map();
  const roots = [];

  (items || []).forEach((item) => {
    byId.set(item.id, { ...item, children: [] });
  });

  (items || []).forEach((item) => {
    const node = byId.get(item.id);
    if (!node) return;
    if (item.parentId && byId.has(item.parentId)) {
      byId.get(item.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function getCollapsibleIds(nodes) {
  const ids = [];
  for (const node of nodes || []) {
    if (node.children?.length) {
      ids.push(node.id);
      ids.push(...getCollapsibleIds(node.children));
    }
  }
  return ids;
}
