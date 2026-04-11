import { useState, useEffect } from 'react';
import { getUserLists } from '../../api/lists.js';
import { getDetailedAnalytics } from '../../api/submissions.js';
import { useToast } from '../common/Toast.jsx';
import Loading from '../common/Loading.jsx';

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

export default function ScorecardAnalysisTab({ token }) {
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
      const scorecards = data.filter(l => l.type === 'SCORECARD');
      setLists(scorecards);
      if (scorecards.length > 0) setSelectedListId(scorecards[0].id);
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

  function getStatistics(item) {
    const values = Object.values(item.valuesByDate)
      .map(v => v?.score ?? v?.numberValue)
      .filter(v => v !== null && v !== undefined);

    if (values.length === 0) {
      return { start: null, avg: null, end: null };
    }

    const start = values[0];
    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
    const end = values[values.length - 1];

    return { start, avg, end };
  }

  if (!selectedListId) return <div className="card"><p>No scorecards found</p></div>;

  return (
    <div className="card">
      <div className="section-header" style={{ marginBottom: 20 }}>
        <span className="section-title">Scorecard Analysis</span>
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
                <th style={{ minWidth: 100, textAlign: 'center' }}>Starting</th>
                <th style={{ minWidth: 100, textAlign: 'center' }}>Average</th>
                <th style={{ minWidth: 100, textAlign: 'center' }}>Ending</th>
              </tr>
            </thead>
            <tbody>
              {analytics.items.map(item => {
                const stats = getStatistics(item);
                return (
                  <tr key={item.id}>
                    <td style={{ textAlign: 'left' }}>{item.title}</td>
                    {analytics.dates.map(date => {
                      const value = item.valuesByDate[date];
                      const displayValue = value?.score ?? value?.numberValue;
                      return (
                        <td key={date} style={{ textAlign: 'center' }}>
                          {displayValue !== null && displayValue !== undefined ? displayValue : '—'}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', fontWeight: 500 }}>{stats.start !== null ? stats.start : '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 500 }}>{stats.avg !== null ? stats.avg : '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 500 }}>{stats.end !== null ? stats.end : '—'}</td>
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
