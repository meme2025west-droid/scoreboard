import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUser, getUser } from '../api/users.js';
import { useToast } from '../components/common/Toast.jsx';

export default function LandingPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [token, setToken] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      const user = await createUser();
      nav(`/u/${user.token}`);
    } catch {
      toast('Failed to create dashboard', 'error');
      setCreating(false);
    }
  }

  async function handleEnter(e) {
    e.preventDefault();
    if (!token.trim()) return;
    try {
      await getUser(token.trim());
      nav(`/u/${token.trim()}`);
    } catch {
      toast('Dashboard not found', 'error');
    }
  }

  return (
    <div className="app-layout">
      <nav className="nav">
        <span className="nav-brand">⬡ Scorecard</span>
      </nav>
      <div className="page-content">
        <div className="landing">
          <div>
            <h1>Your personal dashboard</h1>
            <p style={{ marginTop: 12 }}>Checklists, scorecards, and time tracking — all in one place. No accounts needed.</p>
          </div>

          <div className="landing-actions">
            <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '14px' }} onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : '✦ Create my dashboard'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <hr className="divider" style={{ flex: 1, margin: 0 }} />
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>or</span>
              <hr className="divider" style={{ flex: 1, margin: 0 }} />
            </div>

            <form onSubmit={handleEnter} style={{ display: 'flex', gap: 8 }}>
              <input
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Paste your dashboard token…"
              />
              <button className="btn btn-secondary" type="submit" style={{ whiteSpace: 'nowrap' }}>Open</button>
            </form>
          </div>

          <a href="/admin" style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>Admin</a>
        </div>
      </div>
    </div>
  );
}
