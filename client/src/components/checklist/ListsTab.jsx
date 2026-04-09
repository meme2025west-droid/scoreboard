import { useState, useEffect } from 'react';
import { getUserLists, createList, deleteList, updateList } from '../../api/lists.js';
import { getTemplates } from '../../api/templates.js';
import { useToast } from '../common/Toast.jsx';
import Loading from '../common/Loading.jsx';
import Modal from '../common/Modal.jsx';
import ListDetail from './ListDetail.jsx';

export default function ListsTab({ token }) {
  const toast = useToast();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('CHECKLIST');
  const [templates, setTemplates] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    load();
  }, [token]);

  async function load() {
    try {
      const data = await getUserLists(token);
      setLists(data);
      if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
    } catch {
      toast('Failed to load lists', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(templateId = null) {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const list = await createList(token, { title: newTitle, type: newType, templateId });
      setLists(l => [list, ...l]);
      setSelectedId(list.id);
      setShowNew(false);
      setShowTemplates(false);
      setNewTitle('');
    } catch {
      toast('Failed to create', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this list and all its history?')) return;
    try {
      await deleteList(id);
      setLists(l => l.filter(x => x.id !== id));
      if (selectedId === id) setSelectedId(lists.find(x => x.id !== id)?.id || null);
      toast('List deleted');
    } catch {
      toast('Failed to delete', 'error');
    }
  }

  async function loadTemplates() {
    try {
      const data = await getTemplates();
      setTemplates(data.filter(t => t.type !== 'TIMELOG'));
      setShowTemplates(true);
    } catch {
      toast('Failed to load templates', 'error');
    }
  }

  const selected = lists.find(l => l.id === selectedId);

  if (loading) return <Loading />;

  return (
    <div className="two-col">
      {/* Sidebar */}
      <div className="card sidebar">
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setShowNew(true)}>+ New</button>
          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={loadTemplates}>Templates</button>
        </div>
        {lists.length === 0 && (
          <div className="empty" style={{ padding: '24px 0' }}>
            <p>No lists yet.<br />Create one above.</p>
          </div>
        )}
        {lists.map(l => (
          <button
            key={l.id}
            className={`sidebar-item ${selectedId === l.id ? 'active' : ''}`}
            onClick={() => setSelectedId(l.id)}
          >
            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</span>
            <span className={`badge badge-${l.type.toLowerCase()}`}>{l.type === 'CHECKLIST' ? '✓' : '★'}</span>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div>
        {selected ? (
          <ListDetail
            key={selected.id}
            listId={selected.id}
            onDelete={() => handleDelete(selected.id)}
            onUpdate={(updated) => setLists(l => l.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
          />
        ) : (
          <div className="card">
            <div className="empty"><p>Select or create a list</p></div>
          </div>
        )}
      </div>

      {/* New list modal */}
      {showNew && (
        <Modal
          title="New list"
          onClose={() => setShowNew(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleCreate()} disabled={creating || !newTitle.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label>Title</label>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Morning Routine" autoFocus />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={newType} onChange={e => setNewType(e.target.value)}>
              <option value="CHECKLIST">Checklist</option>
              <option value="SCOREBOARD">Scoreboard</option>
            </select>
          </div>
        </Modal>
      )}

      {/* Templates modal */}
      {showTemplates && (
        <Modal title="Browse templates" onClose={() => setShowTemplates(false)}>
          <div className="form-group">
            <label>Title for your new list</label>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="My list title…" />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={newType} onChange={e => setNewType(e.target.value)}>
              <option value="CHECKLIST">Checklist</option>
              <option value="SCOREBOARD">Scoreboard</option>
            </select>
          </div>
          <hr className="divider" />
          {templates.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 14 }}>No templates available yet.</p>}
          {templates.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                {t.description && <div style={{ fontSize: 13, color: 'var(--text3)' }}>{t.description}</div>}
                <span className={`badge badge-${t.type.toLowerCase()}`}>{t.type}</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => handleCreate(t.id)} disabled={!newTitle.trim()}>
                Use
              </button>
            </div>
          ))}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowTemplates(false)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
