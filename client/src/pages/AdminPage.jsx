import { useState, useEffect } from 'react';
import { verifyAdmin, getOverview, getAllUsers, getUserLists, getUserTimelog } from '../api/admin.js';
import { getTemplates, createTemplate, deleteTemplate, updateTemplate, addTemplateItem } from '../api/templates.js';
import { useToast } from '../components/common/Toast.jsx';
import Loading from '../components/common/Loading.jsx';
import Modal from '../components/common/Modal.jsx';

function fmt(d) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminPage() {
  const toast = useToast();
  const [adminToken, setAdminToken] = useState(sessionStorage.getItem('adminToken') || '');
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Overview
  const [overview, setOverview] = useState(null);

  // Users
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userLists, setUserLists] = useState([]);
  const [userTimelog, setUserTimelog] = useState([]);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTmplTitle, setNewTmplTitle] = useState('');
  const [newTmplType, setNewTmplType] = useState('CHECKLIST');
  const [newTmplDesc, setNewTmplDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');

  useEffect(() => {
    if (authed) {
      loadOverview();
      loadUsers();
      loadTemplates();
    }
  }, [authed]);

  async function handleAuth(e) {
    e.preventDefault();
    setChecking(true);
    try {
      await verifyAdmin(adminToken);
      sessionStorage.setItem('adminToken', adminToken);
      setAuthed(true);
    } catch {
      toast('Invalid admin token', 'error');
    } finally {
      setChecking(false);
    }
  }

  async function loadOverview() {
    try { setOverview(await getOverview(adminToken)); } catch {}
  }
  async function loadUsers() {
    try { setUsers(await getAllUsers(adminToken)); } catch {}
  }
  async function loadTemplates() {
    try { setTemplates(await getTemplates()); } catch {}
  }

  async function selectUser(user) {
    setSelectedUser(user);
    try {
      const [lists, timelog] = await Promise.all([
        getUserLists(adminToken, user.id),
        getUserTimelog(adminToken, user.id),
      ]);
      setUserLists(lists);
      setUserTimelog(timelog);
    } catch {
      toast('Failed to load user data', 'error');
    }
  }

  async function handleCreateTemplate() {
    if (!newTmplTitle.trim()) return;
    try {
      const t = await createTemplate(adminToken, { title: newTmplTitle, type: newTmplType, description: newTmplDesc });
      setTemplates(ts => [t, ...ts]);
      setShowNewTemplate(false);
      setNewTmplTitle(''); setNewTmplDesc('');
      toast('Template created');
    } catch { toast('Failed to create', 'error'); }
  }

  async function handleDeleteTemplate(id) {
    if (!confirm('Delete this template? Existing lists keep their items.')) return;
    try {
      await deleteTemplate(adminToken, id);
      setTemplates(ts => ts.filter(t => t.id !== id));
      if (selectedTemplate?.id === id) setSelectedTemplate(null);
      toast('Deleted');
    } catch { toast('Failed', 'error'); }
  }

  async function handleAddTemplateItem(templateId) {
    if (!newItemTitle.trim()) return;
    try {
      await addTemplateItem(adminToken, templateId, { title: newItemTitle, unit: newItemUnit || null });
      const updated = await getTemplates();
      setTemplates(updated);
      setNewItemTitle(''); setNewItemUnit('');
      toast('Item added — linked lists will sync on next visit');
    } catch { toast('Failed', 'error'); }
  }

  if (!authed) return (
    <div className="app-layout">
      <nav className="nav"><span className="nav-brand">⬡ Scoreboard — Admin</span></nav>
      <div className="page-content">
        <div className="landing">
          <div>
            <h1 style={{ fontSize: 28 }}>Admin access</h1>
            <p>Enter your admin token to continue.</p>
          </div>
          <form onSubmit={handleAuth} className="landing-actions">
            <input
              type="password"
              value={adminToken}
              onChange={e => setAdminToken(e.target.value)}
              placeholder="Admin token…"
              autoFocus
            />
            <button className="btn btn-primary" type="submit" style={{ justifyContent: 'center' }} disabled={checking}>
              {checking ? 'Checking…' : 'Enter admin'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-layout">
      <nav className="nav">
        <span className="nav-brand">⬡ Admin</span>
        <div className="nav-tabs">
          {['overview', 'users', 'templates'].map(t => (
            <button key={t} className={`nav-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          <a href="/" className="nav-tab" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>← Site</a>
        </div>
      </nav>
      <div className="page-content">

        {activeTab === 'overview' && overview && (
          <div>
            <div className="section-title" style={{ marginBottom: 16 }}>Overview</div>
            <div className="three-col">
              {[
                { label: 'Users', value: overview.userCount },
                { label: 'Lists', value: overview.listCount },
                { label: 'Submissions', value: overview.submissionCount },
                { label: 'Timelog entries', value: overview.timelogCount },
              ].map(s => (
                <div key={s.label} className="card stat-card">
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="two-col">
            <div className="card">
              <div className="section-title" style={{ marginBottom: 12 }}>All users ({users.length})</div>
              {users.map(u => (
                <button
                  key={u.id}
                  className={`sidebar-item ${selectedUser?.id === u.id ? 'active' : ''}`}
                  onClick={() => selectUser(u)}
                >
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 12, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.token.slice(0, 20)}…
                  </span>
                  <span style={{ fontSize: 11, color: 'inherit', opacity: 0.7 }}>{u.timezone?.split('/')[1] || 'UTC'}</span>
                </button>
              ))}
            </div>
            {selectedUser && (
              <div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="section-title" style={{ marginBottom: 8 }}>User</div>
                  <div className="token-box" style={{ marginBottom: 8 }}>{selectedUser.token}</div>
                  <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                    Joined: {fmt(selectedUser.createdAt)} · TZ: {selectedUser.timezone}
                  </div>
                </div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="section-title" style={{ marginBottom: 12 }}>Lists ({userLists.length})</div>
                  {userLists.map(l => (
                    <div key={l.id} className="history-item" onClick={() => window.open(`/u/${selectedUser.token}`, '_blank')}>
                      <span>{l.title}</span>
                      <span className={`badge badge-${l.type.toLowerCase()}`}>{l.type}</span>
                    </div>
                  ))}
                  {userLists.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 14 }}>No lists.</p>}
                </div>
                <div className="card">
                  <div className="section-title" style={{ marginBottom: 12 }}>Recent timelog ({userTimelog.length})</div>
                  {userTimelog.slice(0, 20).map(e => (
                    <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                      <strong>{e.project?.title}</strong> — {e.comment || <em style={{ color: 'var(--text3)' }}>no comment</em>}
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>{fmt(e.startTime)}</div>
                    </div>
                  ))}
                  {userTimelog.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 14 }}>No timelog entries.</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="two-col">
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="section-title">Templates</span>
                <button className="btn btn-primary btn-sm" onClick={() => setShowNewTemplate(true)}>+ New</button>
              </div>
              {templates.map(t => (
                <button
                  key={t.id}
                  className={`sidebar-item ${selectedTemplate?.id === t.id ? 'active' : ''}`}
                  onClick={() => setSelectedTemplate(t)}
                >
                  <span style={{ flex: 1, textAlign: 'left' }}>{t.title}</span>
                  <span className={`badge badge-${t.type.toLowerCase()}`}>{t.type}</span>
                </button>
              ))}
              {templates.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 14 }}>No templates yet.</p>}
            </div>

            {selectedTemplate && (
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedTemplate.title}</div>
                    {selectedTemplate.description && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{selectedTemplate.description}</div>}
                    <span className={`badge badge-${selectedTemplate.type.toLowerCase()}`}>{selectedTemplate.type}</span>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTemplate(selectedTemplate.id)}>Delete</button>
                </div>

                <div className="section-title" style={{ marginBottom: 10, fontSize: 14 }}>Items</div>
                <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                  Adding/editing items here automatically syncs all linked lists.
                </p>

                {/* Template items list — load fresh */}
                <TemplateItemsList templateId={selectedTemplate.id} adminToken={adminToken} />

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <input value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} placeholder="Item title…" />
                  <input value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} placeholder="Unit" style={{ width: 100 }} />
                  <button className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => handleAddTemplateItem(selectedTemplate.id)}>
                    + Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showNewTemplate && (
        <Modal title="New template" onClose={() => setShowNewTemplate(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setShowNewTemplate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateTemplate} disabled={!newTmplTitle.trim()}>Create</button>
            </>
          }
        >
          <div className="form-group">
            <label>Title</label>
            <input value={newTmplTitle} onChange={e => setNewTmplTitle(e.target.value)} autoFocus placeholder="e.g. CEO Morning Checklist" />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={newTmplType} onChange={e => setNewTmplType(e.target.value)}>
              <option value="CHECKLIST">Checklist</option>
              <option value="SCOREBOARD">Scoreboard</option>
              <option value="TIMELOG">Timelog Project Set</option>
            </select>
          </div>
          <div className="form-group">
            <label>Description (optional)</label>
            <input value={newTmplDesc} onChange={e => setNewTmplDesc(e.target.value)} placeholder="Brief description…" />
          </div>
        </Modal>
      )}
    </div>
  );
}

// Sub-component to load and display template items
function TemplateItemsList({ templateId, adminToken }) {
  const [items, setItems] = useState([]);
  const toast = useToast();

  useEffect(() => { loadItems(); }, [templateId]);

  async function loadItems() {
    try {
      const { getTemplate } = await import('../api/templates.js');
      const tmpl = await getTemplate(templateId);
      setItems(tmpl.items || []);
    } catch {}
  }

  return (
    <div>
      {items.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 14 }}>No items yet.</p>}
      {items.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
          {i.parentId && <span style={{ opacity: 0.4, fontSize: 12 }}>↳</span>}
          <span style={{ flex: 1 }}>{i.title}</span>
          {i.unit && <span style={{ fontSize: 12, color: 'var(--text3)' }}>[{i.unit}]</span>}
        </div>
      ))}
    </div>
  );
}
