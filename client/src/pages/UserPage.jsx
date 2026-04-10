import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getUser, updateUser } from '../api/users.js';
import { useToast } from '../components/common/Toast.jsx';
import Loading from '../components/common/Loading.jsx';
import ListsTab from '../components/checklist/ListsTab.jsx';
import TimelogTab from '../components/timelog/TimelogTab.jsx';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
  'Australia/Sydney',
];

export default function UserPage() {
  const { token } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [tz, setTz] = useState('');

  const requestedTab = searchParams.get('tab');
  const tab = requestedTab === 'timelog' ? 'timelog' : 'lists';

  useEffect(() => {
    getUser(token)
      .then(u => { setUser(u); setTz(u.timezone); })
      .catch(() => toast('Dashboard not found', 'error'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!requestedTab) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('tab', 'lists');
      setSearchParams(nextParams, { replace: true });
    }
  }, [requestedTab, searchParams, setSearchParams]);

  function handleTabChange(nextTab) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextTab);
    if (nextTab !== 'timelog') {
      nextParams.delete('timelogView');
    } else if (!nextParams.get('timelogView')) {
      nextParams.set('timelogView', 'log');
    }
    setSearchParams(nextParams);
  }

  async function saveTimezone() {
    try {
      const updated = await updateUser(token, { timezone: tz });
      setUser(updated);
      toast('Timezone saved');
      setShowSettings(false);
    } catch {
      toast('Failed to save', 'error');
    }
  }

  if (loading) return <div className="app-layout"><Loading /></div>;
  if (!user) return (
    <div className="app-layout">
      <div className="page-content">
        <div className="empty"><p>Dashboard not found.</p><a href="/">Go home</a></div>
      </div>
    </div>
  );

  return (
    <div className="app-layout">
      <nav className="nav">
        <a href="/" className="nav-brand" style={{ textDecoration: 'none' }}>⬡ Scorecard</a>
        <div className="nav-tabs">
          <button className={`nav-tab ${tab === 'lists' ? 'active' : ''}`} onClick={() => handleTabChange('lists')}>Lists</button>
          <button className={`nav-tab ${tab === 'timelog' ? 'active' : ''}`} onClick={() => handleTabChange('timelog')}>Timelog</button>
          <button className="nav-tab" onClick={() => setShowSettings(s => !s)} style={{ fontSize: 18, padding: '6px 12px' }}>⚙</button>
        </div>
      </nav>

      <div className="page-content">
        {showSettings && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-header">
              <span className="section-title">Settings</span>
              <button className="btn-icon" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="form-group">
              <label>Your dashboard token (share this URL to access your dashboard)</label>
              <div className="token-box">{window.location.origin}/u/{token}</div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Timezone</label>
                <select value={tz} onChange={e => setTz(e.target.value)}>
                  {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" style={{ marginBottom: 0, alignSelf: 'flex-end', height: 38 }} onClick={saveTimezone}>Save</button>
            </div>
          </div>
        )}

        {tab === 'lists' && <ListsTab token={token} user={user} />}
        {tab === 'timelog' && <TimelogTab token={token} user={user} />}
      </div>
    </div>
  );
}
