import { useState, useEffect } from 'react';
import { getAnalytics } from '../../api/timelog.js';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useToast } from '../common/Toast.jsx';
import Loading from '../common/Loading.jsx';

function fmtMins(m) {
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  if (h > 0) return `${h}h ${rem}m`;
  return `${rem}m`;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekAgoStr() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export default function TimelogAnalytics({ token, tz }) {
  const toast = useToast();
  const [from, setFrom] = useState(weekAgoStr());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const fromISO = new Date(from + 'T00:00:00').toISOString();
      const toISO = new Date(to + 'T23:59:59').toISOString();
      const result = await getAnalytics(token, { from: fromISO, to: toISO });
      setData(result);
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

  return (
    <div className="card">
      <div className="section-header">
        <span className="section-title">Time analytics</span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 160 }} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 160 }} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={load} style={{ height: 38 }}>Apply</button>
      </div>

      {loading && <Loading text="Calculating…" />}

      {!loading && data.length === 0 && (
        <div className="empty"><p>No entries in this range.</p></div>
      )}

      {!loading && data.length > 0 && (
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
      )}
    </div>
  );
}
