import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyAdmin, getOverview, getAllUsers, getUserLists, getUserTimelog } from '../api/admin.js';
import {
  getTemplate,
  getTemplates,
  createTemplate,
  deleteTemplate,
  addTemplateItem,
  updateTemplateItem,
  moveTemplateItem,
  deleteTemplateItem,
  addTemplateProject,
  updateTemplateProject,
  moveTemplateProject,
  deleteTemplateProject,
} from '../api/templates.js';
import { useToast } from '../components/common/Toast.jsx';
import Modal from '../components/common/Modal.jsx';

function fmt(d) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const PROJECT_TEMPLATE_COLORS = ['#6c63ff', '#4a9eff', '#4caf7d', '#f5a623', '#f06565', '#a78bfa', '#ff6b9d', '#00c9a7'];

function buildTemplateTree(items) {
  const map = {};
  items.forEach((item) => {
    map[item.id] = { ...item, children: [] };
  });

  const roots = [];
  items.forEach((item) => {
    if (item.parentId && map[item.parentId]) {
      map[item.parentId].children.push(map[item.id]);
    } else {
      roots.push(map[item.id]);
    }
  });

  return roots;
}

function findNodeWithContext(nodes, id, parent = null) {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) return { node, parent, index };
    if (node.children?.length) {
      const found = findNodeWithContext(node.children, id, node);
      if (found) return found;
    }
  }

  return null;
}

function parseIndentedItemLines(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^[\t ]*/);
      const indent = match ? match[0] : '';
      const tabs = (indent.match(/\t/g) || []).length;
      const spaces = (indent.match(/ /g) || []).length;
      const depth = tabs + Math.floor(spaces / 4);
      return { title: line.trim(), depth };
    })
    .filter((entry) => entry.title);
}

function DropZone({ onDrop, depth = 0, isActive = false, onDragOver }) {
  return (
    <div
      className={`list-item-drop-zone ${isActive ? 'active' : ''}`}
      style={{ marginLeft: depth > 0 ? 28 : 0 }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver?.(e);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId) onDrop(draggedId);
      }}
    />
  );
}

function TemplateItemRow({
  item,
  templateType,
  editMode,
  onToggleCollapse,
  onUpdate,
  onMove,
  onOutdent,
  onDelete,
  onAddChild,
  depth = 0,
  parentId = null,
  index = 0,
  siblingsCount = 1,
  dragState: sharedDragState,
  setDragState: setSharedDragState,
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editUnit, setEditUnit] = useState(item.unit || '');
  const [localDragState, setLocalDragState] = useState({ draggedId: null, dropTargetKey: null });
  const dragState = sharedDragState || localDragState;
  const setDragState = setSharedDragState || setLocalDragState;
  const hasChildren = item.children && item.children.length > 0;
  const isCollapsed = !!item.collapsed;
  const isChecklist = templateType === 'CHECKLIST';
  const beforeZoneKey = `zone:${parentId ?? 'root'}:${index}`;
  const nodeDropKey = `node:${item.id}`;
  const afterZoneKey = `zone:${parentId ?? 'root'}:${siblingsCount}`;

  useEffect(() => {
    setEditTitle(item.title);
    setEditUnit(item.unit || '');
  }, [item.id, item.title, item.unit]);

  async function saveItem() {
    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      setEditTitle(item.title);
      setEditUnit(item.unit || '');
      setEditing(false);
      return;
    }

    const changed = nextTitle !== item.title || (isChecklist && (editUnit || null) !== (item.unit || null));
    if (changed) {
      await onUpdate(item.id, {
        title: nextTitle,
        ...(isChecklist ? { unit: editUnit || null } : {}),
      });
    }

    setEditing(false);
  }

  return (
    <div>
      {editMode && (
        <DropZone
          depth={depth}
          isActive={dragState.draggedId && dragState.dropTargetKey === beforeZoneKey}
          onDragOver={() => {
            if (dragState.dropTargetKey !== beforeZoneKey) {
              setDragState((prev) => ({ ...prev, dropTargetKey: beforeZoneKey }));
            }
          }}
          onDrop={(draggedId) => {
            onMove(draggedId, parentId, index);
            setDragState({ draggedId: null, dropTargetKey: null });
          }}
        />
      )}

      <div
        className={`list-item-row ${dragState.draggedId && dragState.draggedId !== item.id && dragState.dropTargetKey === nodeDropKey ? 'drop-target' : ''}`}
        draggable={editMode}
        onDragStart={(e) => {
          if (!editMode) return;
          e.dataTransfer.setData('text/plain', item.id);
          e.dataTransfer.effectAllowed = 'move';
          setDragState({ draggedId: item.id, dropTargetKey: null });
        }}
        onDragEnd={() => setDragState({ draggedId: null, dropTargetKey: null })}
        onDragOver={(e) => {
          if (editMode) {
            e.preventDefault();
            if (dragState.dropTargetKey !== nodeDropKey) {
              setDragState((prev) => ({ ...prev, dropTargetKey: nodeDropKey }));
            }
          }
        }}
        onDrop={(e) => {
          if (!editMode) return;
          e.preventDefault();
          const draggedId = e.dataTransfer.getData('text/plain');
          if (draggedId && draggedId !== item.id) {
            onMove(draggedId, item.id, item.children?.length || 0);
          }
          setDragState({ draggedId: null, dropTargetKey: null });
        }}
      >
        {hasChildren ? (
          <button className="collapse-btn" onClick={() => onToggleCollapse(item)}>
            {isCollapsed ? '▶' : '▼'}
          </button>
        ) : (
          <span style={{ width: 18 }} />
        )}

        <div className="list-item-title">
          {editing ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={saveItem}
                onKeyDown={(e) => e.key === 'Enter' && saveItem()}
                autoFocus
                style={{ flex: 1, background: 'transparent', border: '1px solid var(--accent)', padding: '2px 6px', borderRadius: 4, fontSize: 14 }}
              />
              {isChecklist && (
                <input
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  onBlur={saveItem}
                  onKeyDown={(e) => e.key === 'Enter' && saveItem()}
                  placeholder="Unit"
                  style={{ width: 100, background: 'transparent', border: '1px solid var(--accent)', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}
                />
              )}
            </div>
          ) : (
            <span onDoubleClick={() => setEditing(true)}>
              {item.title}
              {isChecklist && item.unit && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 6 }}>[{item.unit}]</span>}
            </span>
          )}
        </div>

        {editMode && (
          <>
            <button className="btn-icon" style={{ fontSize: 13 }} onClick={() => onOutdent(item.id)} title="Outdent one level">
              ⇤
            </button>
            <button className="btn-icon" style={{ fontSize: 14 }} onClick={() => onAddChild(item.id)} title="Add sub-item">
              ⊕
            </button>
            <button className="btn-icon" style={{ color: 'var(--red)', fontSize: 14 }} onClick={() => onDelete(item.id)} title="Delete item">
              ✕
            </button>
          </>
        )}
      </div>

      {hasChildren && !isCollapsed && (
        <div className="list-item-children">
          {item.children.map((child, childIndex) => (
            <TemplateItemRow
              key={child.id}
              item={child}
              templateType={templateType}
              editMode={editMode}
              onToggleCollapse={onToggleCollapse}
              onUpdate={onUpdate}
              onMove={onMove}
              onOutdent={onOutdent}
              onDelete={onDelete}
              onAddChild={onAddChild}
              depth={depth + 1}
              parentId={item.id}
              index={childIndex}
              siblingsCount={item.children.length}
              dragState={dragState}
              setDragState={setDragState}
            />
          ))}
        </div>
      )}

      {editMode && index === siblingsCount - 1 && (
        <DropZone
          depth={depth}
          isActive={dragState.draggedId && dragState.dropTargetKey === afterZoneKey}
          onDragOver={() => {
            if (dragState.dropTargetKey !== afterZoneKey) {
              setDragState((prev) => ({ ...prev, dropTargetKey: afterZoneKey }));
            }
          }}
          onDrop={(draggedId) => {
            onMove(draggedId, parentId, siblingsCount);
            setDragState({ draggedId: null, dropTargetKey: null });
          }}
        />
      )}
    </div>
  );
}

export default function AdminPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [adminToken, setAdminToken] = useState(localStorage.getItem('adminToken') || '');
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
  const [templateItemsVersion, setTemplateItemsVersion] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('adminToken');
    if (saved) {
      setChecking(true);
      verifyAdmin(saved)
        .then(() => setAuthed(true))
        .catch(() => {
          localStorage.removeItem('adminToken');
          setAdminToken('');
        })
        .finally(() => setChecking(false));
    }
  }, []);

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
      localStorage.setItem('adminToken', adminToken);
      setAuthed(true);
    } catch {
      toast('Invalid admin token', 'error');
    } finally {
      setChecking(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('adminToken');
    setAdminToken('');
    setAuthed(false);
    nav('/');
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

  useEffect(() => {
    setNewItemTitle('');
    setNewItemUnit('');
    setTemplateItemsVersion(0);
  }, [selectedTemplate?.id]);

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
    const lines = parseIndentedItemLines(newItemTitle);
    if (lines.length === 0) return;
    try {
      const unit = selectedTemplate?.type === 'CHECKLIST' ? (newItemUnit || null) : null;
      const parentStack = [];
      let prevDepth = 0;

      for (const entry of lines) {
        const desiredDepth = Number.isInteger(entry.depth) ? entry.depth : 0;
        const safeDepth = Math.min(desiredDepth, prevDepth + 1);
        const effectiveDepth = Math.max(0, safeDepth);
        const parentId = effectiveDepth === 0 ? null : parentStack[effectiveDepth - 1] || null;

        const created = await addTemplateItem(adminToken, templateId, {
          title: entry.title,
          parentId,
          unit,
        });

        parentStack[effectiveDepth] = created.id;
        parentStack.length = effectiveDepth + 1;
        prevDepth = effectiveDepth;
      }

      const updated = await getTemplates();
      setTemplates(updated);
      setSelectedTemplate(current => current ? updated.find(t => t.id === current.id) || current : current);
      setNewItemTitle(''); setNewItemUnit('');
      setTemplateItemsVersion(version => version + 1);
      toast(lines.length > 1 ? `Added ${lines.length} items` : 'Item added');
    } catch { toast('Failed', 'error'); }
  }

  function handleAddTextareaKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target;
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      const currentValue = target.value ?? '';
      const next = `${currentValue.slice(0, start)}\t${currentValue.slice(end)}`;
      setNewItemTitle(next);
      requestAnimationFrame(() => {
        target.selectionStart = start + 1;
        target.selectionEnd = start + 1;
      });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && selectedTemplate?.id) {
      handleAddTemplateItem(selectedTemplate.id);
    }
  }

  if (!authed) return (
    <div className="app-layout">
      <nav className="nav"><span className="nav-brand">⬡ Scorecard — Admin</span></nav>
      <div className="page-content">
        <div className="landing">
          {checking ? (
            <div><p>Verifying…</p></div>
          ) : (
            <>
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
                <button className="btn btn-primary" type="submit" style={{ justifyContent: 'center' }}>
                  Enter admin
                </button>
              </form>
              <a href="/" style={{ color: 'var(--text3)', fontSize: 13 }}>← Back to site</a>
            </>
          )}
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
          <button className="nav-tab" onClick={handleLogout}>Log out</button>
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
                  <div style={{ marginBottom: 8 }}>
                    <a
                      href={`/u/${selectedUser.token}`}
                      className="btn btn-secondary btn-sm"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                    >
                      Open user site ↗
                    </a>
                  </div>
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

                {selectedTemplate.type === 'TIMELOG' ? (
                  <>
                    <div className="section-title" style={{ marginBottom: 10, fontSize: 14 }}>Project set</div>
                    <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                      Editing this tree updates the timelog project set users can apply from their timelog page.
                    </p>
                    <TemplateProjectsList
                      adminToken={adminToken}
                      templateId={selectedTemplate.id}
                      refreshKey={templateItemsVersion}
                    />
                  </>
                ) : (
                  <>
                    <div className="section-title" style={{ marginBottom: 10, fontSize: 14 }}>Items</div>
                    <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                      Adding/editing items here automatically syncs all linked lists.
                    </p>

                    <TemplateItemsList
                      adminToken={adminToken}
                      templateId={selectedTemplate.id}
                      templateType={selectedTemplate.type}
                      refreshKey={templateItemsVersion}
                    />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                      <textarea
                        value={newItemTitle}
                        onChange={e => setNewItemTitle(e.target.value)}
                        placeholder="Type or paste items, one per line. Use tab or 4 spaces for sub-items…"
                        rows={4}
                        draggable={false}
                        onMouseDown={e => e.stopPropagation()}
                        onKeyDown={handleAddTextareaKeyDown}
                      />
                      {selectedTemplate.type === 'CHECKLIST' && (
                        <input value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} placeholder="Unit for all items (optional)" style={{ width: 180 }} />
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => handleAddTemplateItem(selectedTemplate.id)}>
                          + Add
                        </button>
                        <span style={{ fontSize: 12, color: 'var(--text2)' }}>Tip: one per line, tab/4 spaces indents, Ctrl+Enter adds</span>
                      </div>
                    </div>
                  </>
                )}
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
              <option value="SCORECARD">Scorecard</option>
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

function TemplateItemsList({ adminToken, templateId, templateType, refreshKey }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [addingChild, setAddingChild] = useState(null);
  const [newChildTitle, setNewChildTitle] = useState('');
  const [newChildUnit, setNewChildUnit] = useState('');

  useEffect(() => {
    setEditMode(false);
    setAddingChild(null);
    setNewChildTitle('');
    setNewChildUnit('');
  }, [templateId]);

  useEffect(() => { loadItems(); }, [templateId, refreshKey]);

  async function loadItems() {
    try {
      const tmpl = await getTemplate(templateId);
      setItems(tmpl.items || []);
    } catch {
      toast('Failed to load template items', 'error');
    }
  }

  async function toggleCollapse(item) {
    try {
      await updateTemplateItem(adminToken, item.id, { collapsed: !item.collapsed });
      await loadItems();
    } catch {
      toast('Failed to toggle item', 'error');
    }
  }

  async function handleUpdateItem(itemId, data) {
    try {
      await updateTemplateItem(adminToken, itemId, data);
      await loadItems();
    } catch {
      toast('Failed to update item', 'error');
    }
  }

  async function handleMoveItem(itemId, newParentId, newIndex) {
    try {
      await moveTemplateItem(adminToken, itemId, { newParentId, newIndex });
      await loadItems();
    } catch (error) {
      toast(error?.response?.data?.error || 'Failed to move item', 'error');
    }
  }

  async function handleDeleteItem(itemId) {
    if (!confirm('Delete this item and its sub-items?')) return;

    try {
      await deleteTemplateItem(adminToken, itemId);
      await loadItems();
    } catch {
      toast('Failed to delete item', 'error');
    }
  }

  async function handleAddChild(parentId) {
    const lines = parseIndentedItemLines(newChildTitle);
    if (lines.length === 0) return;

    try {
      const baseParentId = parentId;
      const parentStack = [];
      let prevDepth = 0;

      for (const entry of lines) {
        const desiredDepth = Number.isInteger(entry.depth) ? entry.depth : 0;
        const safeDepth = Math.min(desiredDepth, prevDepth + 1);
        const effectiveDepth = Math.max(0, safeDepth);
        const itemParentId = effectiveDepth === 0 ? baseParentId : (parentStack[effectiveDepth - 1] || baseParentId);

        const created = await addTemplateItem(adminToken, templateId, {
          title: entry.title,
          parentId: itemParentId,
          unit: templateType === 'CHECKLIST' ? (newChildUnit || null) : null,
        });

        parentStack[effectiveDepth] = created.id;
        parentStack.length = effectiveDepth + 1;
        prevDepth = effectiveDepth;
      }

      setAddingChild(null);
      setNewChildTitle('');
      setNewChildUnit('');
      await loadItems();
      toast(lines.length > 1 ? `Added ${lines.length} items` : 'Item added');
    } catch {
      toast('Failed to add item', 'error');
    }
  }

  function handleChildTextareaKeyDown(e, addHandler) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target;
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      const currentValue = target.value ?? '';
      const next = `${currentValue.slice(0, start)}\t${currentValue.slice(end)}`;
      setNewChildTitle(next);
      requestAnimationFrame(() => {
        target.selectionStart = start + 1;
        target.selectionEnd = start + 1;
      });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      addHandler();
    }
  }

  async function handleOutdentItem(itemId) {
    const ctx = findNodeWithContext(tree, itemId);
    if (!ctx || !ctx.parent) return;

    const parentCtx = findNodeWithContext(tree, ctx.parent.id);
    const newParentId = parentCtx?.parent ? parentCtx.parent.id : null;
    const newIndex = (parentCtx?.index ?? 0) + 1;
    await handleMoveItem(itemId, newParentId, newIndex);
  }

  const tree = buildTemplateTree(items);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          className={`btn btn-secondary btn-sm ${editMode ? 'active-edit-btn' : ''}`}
          onClick={() => setEditMode((current) => !current)}
        >
          {editMode ? '✓ Done' : '✎ Edit'}
        </button>
      </div>

      {items.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 14 }}>No items yet.</p>}

      {tree.map((item, index) => (
        <TemplateItemRow
          key={item.id}
          item={item}
          templateType={templateType}
          editMode={editMode}
          onToggleCollapse={toggleCollapse}
          onUpdate={handleUpdateItem}
          onMove={handleMoveItem}
          onOutdent={handleOutdentItem}
          onDelete={handleDeleteItem}
          onAddChild={(parentId) => {
            setAddingChild(parentId);
            setNewChildTitle('');
            setNewChildUnit('');
          }}
          parentId={null}
          index={index}
          siblingsCount={tree.length}
        />
      ))}

      {addingChild && (
        <Modal
          title="Add sub-item"
          onClose={() => setAddingChild(null)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setAddingChild(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleAddChild(addingChild)} disabled={parseIndentedItemLines(newChildTitle).length === 0}>
                Add
              </button>
            </>
          }
        >
          <div className="form-group">
            <label>Title(s)</label>
            <textarea
              value={newChildTitle}
              onChange={(e) => setNewChildTitle(e.target.value)}
              autoFocus
              rows={4}
              draggable={false}
              onMouseDown={e => e.stopPropagation()}
              placeholder="Type or paste sub-items, one per line. Use tab or 4 spaces for deeper levels…"
              onKeyDown={e => handleChildTextareaKeyDown(e, () => handleAddChild(addingChild))}
            />
            <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>One item per line. Tab or 4 spaces creates sub-items. Use Ctrl+Enter to add.</p>
          </div>
          {templateType === 'CHECKLIST' && (
            <div className="form-group">
              <label>Unit for all items (optional)</label>
              <input value={newChildUnit} onChange={(e) => setNewChildUnit(e.target.value)} placeholder="Unit…" />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function TemplateProjectRow({
  project,
  editMode,
  onUpdate,
  onMove,
  onOutdent,
  onDelete,
  onAddChild,
  depth = 0,
  parentId = null,
  index = 0,
  siblingsCount = 1,
  dragState: sharedDragState,
  setDragState: setSharedDragState,
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(project.title);
  const [editColor, setEditColor] = useState(project.color || PROJECT_TEMPLATE_COLORS[0]);
  const [localDragState, setLocalDragState] = useState({ draggedId: null, dropTargetKey: null });
  const dragState = sharedDragState || localDragState;
  const setDragState = setSharedDragState || setLocalDragState;
  const beforeZoneKey = `zone:${parentId ?? 'root'}:${index}`;
  const nodeDropKey = `node:${project.id}`;
  const afterZoneKey = `zone:${parentId ?? 'root'}:${siblingsCount}`;

  useEffect(() => {
    setEditTitle(project.title);
    setEditColor(project.color || PROJECT_TEMPLATE_COLORS[0]);
  }, [project.id, project.title, project.color]);

  async function saveProject() {
    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      setEditTitle(project.title);
      setEditColor(project.color || PROJECT_TEMPLATE_COLORS[0]);
      setEditing(false);
      return;
    }

    if (nextTitle !== project.title || (editColor || null) !== (project.color || null)) {
      await onUpdate(project.id, { title: nextTitle, color: editColor || null });
    }

    setEditing(false);
  }

  return (
    <div>
      {editMode && (
        <DropZone
          depth={depth}
          isActive={dragState.draggedId && dragState.dropTargetKey === beforeZoneKey}
          onDragOver={() => {
            if (dragState.dropTargetKey !== beforeZoneKey) {
              setDragState((prev) => ({ ...prev, dropTargetKey: beforeZoneKey }));
            }
          }}
          onDrop={(draggedId) => {
            onMove(draggedId, parentId, index);
            setDragState({ draggedId: null, dropTargetKey: null });
          }}
        />
      )}

      <div
        className={`list-item-row ${dragState.draggedId && dragState.draggedId !== project.id && dragState.dropTargetKey === nodeDropKey ? 'drop-target' : ''}`}
        draggable={editMode}
        onDragStart={(e) => {
          if (!editMode) return;
          e.dataTransfer.setData('text/plain', project.id);
          e.dataTransfer.effectAllowed = 'move';
          setDragState({ draggedId: project.id, dropTargetKey: null });
        }}
        onDragEnd={() => setDragState({ draggedId: null, dropTargetKey: null })}
        onDragOver={(e) => {
          if (editMode) {
            e.preventDefault();
            if (dragState.dropTargetKey !== nodeDropKey) {
              setDragState((prev) => ({ ...prev, dropTargetKey: nodeDropKey }));
            }
          }
        }}
        onDrop={(e) => {
          if (!editMode) return;
          e.preventDefault();
          const draggedId = e.dataTransfer.getData('text/plain');
          if (draggedId && draggedId !== project.id) {
            onMove(draggedId, project.id, project.children?.length || 0);
          }
          setDragState({ draggedId: null, dropTargetKey: null });
        }}
      >
        <span style={{ width: 18 }} />
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: project.color || 'var(--accent)', flexShrink: 0 }} />

        <div className="list-item-title">
          {editing ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={saveProject}
                onKeyDown={(e) => e.key === 'Enter' && saveProject()}
                autoFocus
                style={{ minWidth: 220, flex: '1 1 220px', background: 'transparent', border: '1px solid var(--accent)', padding: '2px 6px', borderRadius: 4, fontSize: 14 }}
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {PROJECT_TEMPLATE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setEditColor(color)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: editColor === color ? '2px solid var(--text1)' : '1px solid var(--border)',
                      background: color,
                      cursor: 'pointer',
                    }}
                    title="Set color"
                  />
                ))}
              </div>
            </div>
          ) : (
            <span onDoubleClick={() => setEditing(true)}>
              {project.title}
            </span>
          )}
        </div>

        {editMode && (
          <>
            <button className="btn-icon" style={{ fontSize: 13 }} onClick={() => onOutdent(project.id)} title="Outdent one level">
              ⇤
            </button>
            <button className="btn-icon" style={{ fontSize: 14 }} onClick={() => onAddChild(project.id)} title="Add sub-project">
              ⊕
            </button>
            <button className="btn-icon" style={{ color: 'var(--red)', fontSize: 14 }} onClick={() => onDelete(project.id)} title="Delete project">
              ✕
            </button>
          </>
        )}
      </div>

      {project.children?.length > 0 && (
        <div className="list-item-children">
          {project.children.map((child, childIndex) => (
            <TemplateProjectRow
              key={child.id}
              project={child}
              editMode={editMode}
              onUpdate={onUpdate}
              onMove={onMove}
              onOutdent={onOutdent}
              onDelete={onDelete}
              onAddChild={onAddChild}
              depth={depth + 1}
              parentId={project.id}
              index={childIndex}
              siblingsCount={project.children.length}
              dragState={dragState}
              setDragState={setDragState}
            />
          ))}
        </div>
      )}

      {editMode && index === siblingsCount - 1 && (
        <DropZone
          depth={depth}
          isActive={dragState.draggedId && dragState.dropTargetKey === afterZoneKey}
          onDragOver={() => {
            if (dragState.dropTargetKey !== afterZoneKey) {
              setDragState((prev) => ({ ...prev, dropTargetKey: afterZoneKey }));
            }
          }}
          onDrop={(draggedId) => {
            onMove(draggedId, parentId, siblingsCount);
            setDragState({ draggedId: null, dropTargetKey: null });
          }}
        />
      )}
    </div>
  );
}

function TemplateProjectsList({ adminToken, templateId, refreshKey }) {
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [addingChild, setAddingChild] = useState(null);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_TEMPLATE_COLORS[0]);
  const [newRootTitle, setNewRootTitle] = useState('');
  const [newRootColor, setNewRootColor] = useState(PROJECT_TEMPLATE_COLORS[0]);

  useEffect(() => {
    setEditMode(false);
    setAddingChild(null);
    setNewProjectTitle('');
    setNewRootTitle('');
    setNewProjectColor(PROJECT_TEMPLATE_COLORS[0]);
    setNewRootColor(PROJECT_TEMPLATE_COLORS[0]);
  }, [templateId]);

  useEffect(() => { loadProjects(); }, [templateId, refreshKey]);

  async function loadProjects() {
    try {
      const tmpl = await getTemplate(templateId);
      setProjects(tmpl.templateProjects || []);
    } catch {
      toast('Failed to load template projects', 'error');
    }
  }

  async function handleUpdateProject(projectId, data) {
    try {
      await updateTemplateProject(adminToken, projectId, data);
      await loadProjects();
    } catch {
      toast('Failed to update project', 'error');
    }
  }

  async function handleMoveProject(projectId, newParentId, newIndex) {
    try {
      await moveTemplateProject(adminToken, projectId, { newParentId, newIndex });
      await loadProjects();
    } catch (error) {
      toast(error?.response?.data?.error || 'Failed to move project', 'error');
    }
  }

  async function handleDeleteProject(projectId) {
    if (!confirm('Delete this project and its sub-projects?')) return;

    try {
      await deleteTemplateProject(adminToken, projectId);
      await loadProjects();
    } catch {
      toast('Failed to delete project', 'error');
    }
  }

  async function createProjectsFromLines(rawTitle, color, parentId = null) {
    const lines = parseIndentedItemLines(rawTitle);
    if (lines.length === 0) return false;

    const baseParentId = parentId;
    const parentStack = [];
    let prevDepth = 0;

    for (const entry of lines) {
      const desiredDepth = Number.isInteger(entry.depth) ? entry.depth : 0;
      const safeDepth = Math.min(desiredDepth, prevDepth + 1);
      const effectiveDepth = Math.max(0, safeDepth);
      const projectParentId = effectiveDepth === 0 ? baseParentId : (parentStack[effectiveDepth - 1] || baseParentId);

      const created = await addTemplateProject(adminToken, templateId, {
        title: entry.title,
        parentId: projectParentId,
        color,
      });

      parentStack[effectiveDepth] = created.id;
      parentStack.length = effectiveDepth + 1;
      prevDepth = effectiveDepth;
    }

    await loadProjects();
    toast(lines.length > 1 ? `Added ${lines.length} projects` : 'Project added');
    return true;
  }

  async function handleAddRootProject() {
    const created = await createProjectsFromLines(newRootTitle, newRootColor, null);
    if (created) {
      setNewRootTitle('');
    }
  }

  async function handleAddChildProject(parentId) {
    const created = await createProjectsFromLines(newProjectTitle, newProjectColor, parentId);
    if (created) {
      setAddingChild(null);
      setNewProjectTitle('');
      setNewProjectColor(PROJECT_TEMPLATE_COLORS[0]);
    }
  }

  function handleProjectTextareaKeyDown(e, value, setValue, submit) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target;
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      const next = `${value.slice(0, start)}\t${value.slice(end)}`;
      setValue(next);
      requestAnimationFrame(() => {
        target.selectionStart = start + 1;
        target.selectionEnd = start + 1;
      });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      submit();
    }
  }

  async function handleOutdentProject(projectId) {
    const tree = buildTemplateTree(projects);
    const ctx = findNodeWithContext(tree, projectId);
    if (!ctx || !ctx.parent) return;

    const parentCtx = findNodeWithContext(tree, ctx.parent.id);
    const newParentId = parentCtx?.parent ? parentCtx.parent.id : null;
    const newIndex = (parentCtx?.index ?? 0) + 1;
    await handleMoveProject(projectId, newParentId, newIndex);
  }

  const tree = buildTemplateTree(projects);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          className={`btn btn-secondary btn-sm ${editMode ? 'active-edit-btn' : ''}`}
          onClick={() => setEditMode((current) => !current)}
        >
          {editMode ? '✓ Done' : '✎ Edit'}
        </button>
      </div>

      {projects.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 14 }}>No template projects yet.</p>}

      {tree.map((project, index) => (
        <TemplateProjectRow
          key={project.id}
          project={project}
          editMode={editMode}
          onUpdate={handleUpdateProject}
          onMove={handleMoveProject}
          onOutdent={handleOutdentProject}
          onDelete={handleDeleteProject}
          onAddChild={(parentId) => {
            setAddingChild(parentId);
            setNewProjectTitle('');
            setNewProjectColor(PROJECT_TEMPLATE_COLORS[0]);
          }}
          parentId={null}
          index={index}
          siblingsCount={tree.length}
        />
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        <textarea
          value={newRootTitle}
          onChange={(e) => setNewRootTitle(e.target.value)}
          placeholder="Type or paste projects, one per line. Use tab or 4 spaces for sub-projects…"
          rows={4}
          draggable={false}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={e => handleProjectTextareaKeyDown(e, newRootTitle, setNewRootTitle, handleAddRootProject)}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Color</span>
          {PROJECT_TEMPLATE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="color-swatch"
              style={{ background: color, opacity: newRootColor === color ? 1 : 0.55, border: newRootColor === color ? '2px solid var(--text1)' : '1px solid var(--border)' }}
              onClick={() => setNewRootColor(color)}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={handleAddRootProject}>
            + Add projects
          </button>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Tip: one per line, tab/4 spaces indents, Ctrl+Enter adds</span>
        </div>
      </div>

      {addingChild && (
        <Modal
          title="Add sub-project"
          onClose={() => setAddingChild(null)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setAddingChild(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleAddChildProject(addingChild)} disabled={parseIndentedItemLines(newProjectTitle).length === 0}>
                Add
              </button>
            </>
          }
        >
          <div className="form-group">
            <label>Project name(s)</label>
            <textarea
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              autoFocus
              rows={4}
              draggable={false}
              onMouseDown={e => e.stopPropagation()}
              placeholder="Type or paste sub-projects, one per line. Use tab or 4 spaces for deeper levels…"
              onKeyDown={e => handleProjectTextareaKeyDown(e, newProjectTitle, setNewProjectTitle, () => handleAddChildProject(addingChild))}
            />
            <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>One project per line. Tab or 4 spaces creates sub-projects. Use Ctrl+Enter to add.</p>
          </div>
          <div className="form-group">
            <label>Color</label>
            <div className="color-picker-row">
              {PROJECT_TEMPLATE_COLORS.map((color) => (
                <div
                  key={color}
                  className={`color-swatch ${newProjectColor === color ? 'selected' : ''}`}
                  style={{ background: color }}
                  onClick={() => setNewProjectColor(color)}
                />
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
