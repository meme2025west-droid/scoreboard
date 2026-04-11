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
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

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
              {analytics.items.map(item => {
                const completedCount = Object.values(item.valuesByDate).filter(v => v?.checked).length;
                const frequency = `${completedCount}/${analytics.dates.length}`;
                return (
                  <tr key={item.id}>
                    <td style={{ textAlign: 'left' }}>{item.title}</td>
                    {analytics.dates.map(date => {
                      const value = item.valuesByDate[date];
                      return (
                        <td key={date} style={{ textAlign: 'center', backgroundColor: value?.checked ? '#e8f5e9' : '#fff3e0' }}>
                          {value?.checked ? '✓' : ''}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', fontWeight: 500 }}>{frequency}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
