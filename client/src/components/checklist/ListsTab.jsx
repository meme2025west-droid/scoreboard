import { useState, useEffect, useMemo } from 'react';
import { getUserLists, createList, deleteList, updateList, moveList } from '../../api/lists.js';
import { getTemplates } from '../../api/templates.js';
import { useToast } from '../common/Toast.jsx';
import Loading from '../common/Loading.jsx';
import Modal from '../common/Modal.jsx';
import ListDetail from './ListDetail.jsx';

function buildListTree(lists) {
  const map = new Map();
  lists.forEach((l) => map.set(l.id, { ...l, children: [] }));

  const roots = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNode = (nodes) => {
    nodes.sort((a, b) => (a.position - b.position) || a.title.localeCompare(b.title));
    nodes.forEach((n) => sortNode(n.children));
  };
  sortNode(roots);
  return roots;
}

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
  const [newParentId, setNewParentId] = useState(null);
  const [dragState, setDragState] = useState({ draggedId: null, dropTargetKey: null });

  useEffect(() => {
    load();
  }, [token]);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    try {
      const data = await getUserLists(token);
      setLists(data);
      if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
      if (data.length === 0) setSelectedId(null);
    } catch {
      toast('Failed to load lists', 'error');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function handleCreate(templateId = null) {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const list = await createList(token, { title: newTitle, type: newType, templateId, parentId: newParentId });
      setLists(l => [...l, list]);
      setSelectedId(list.id);

      if (newParentId) {
        const parent = lists.find(x => x.id === newParentId);
        if (parent?.collapsed) {
          setLists((prev) => prev.map((x) => x.id === newParentId ? { ...x, collapsed: false } : x));
          updateList(newParentId, { collapsed: false }).catch(() => {});
        }
      }

      setShowNew(false);
      setShowTemplates(false);
      setNewTitle('');
      setNewParentId(null);
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
      await load(false);
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

  async function handleToggleCollapsed(list) {
    const next = !list.collapsed;
    setLists((prev) => prev.map((x) => x.id === list.id ? { ...x, collapsed: next } : x));
    try {
      await updateList(list.id, { collapsed: next });
    } catch {
      setLists((prev) => prev.map((x) => x.id === list.id ? { ...x, collapsed: list.collapsed } : x));
      toast('Failed to update collapse state', 'error');
    }
  }

  async function handleMoveList(draggedId, parentId, index) {
    setDragState({ draggedId: null, dropTargetKey: null });
    if (!draggedId) return;
    try {
      await moveList(draggedId, { newParentId: parentId, newIndex: index });
      await load(false);
    } catch {
      toast('Failed to reorder lists', 'error');
    }
  }

  async function handleReplaceList(duplicatedList) {
    if (!duplicatedList?.id) return;
    await load(false);
    setSelectedId(duplicatedList.id);
  }

  async function handleOutdentList(listId) {
    const list = lists.find((x) => x.id === listId);
    if (!list?.parentId) return;

    const parent = lists.find((x) => x.id === list.parentId);
    if (!parent) return;

    const newParentId = parent.parentId || null;
    const newIndex = (parent.position ?? 0) + 1;
    await handleMoveList(list.id, newParentId, newIndex);
  }

  const tree = useMemo(() => buildListTree(lists), [lists]);
  const selected = lists.find(l => l.id === selectedId);

  function renderNodes(nodes, parentId = null, depth = 0) {
    return (
      <>
        {nodes.map((node, index) => {
          const beforeKey = `zone:${parentId ?? 'root'}:${index}`;
          const nodeKey = `node:${node.id}`;

          return (
            <div key={node.id}>
              <div
                className={`sidebar-drop-zone ${dragState.draggedId && dragState.dropTargetKey === beforeKey ? 'active' : ''}`}
                style={{ marginLeft: depth * 14 + 8 }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragState.dropTargetKey !== beforeKey) {
                    setDragState((prev) => ({ ...prev, dropTargetKey: beforeKey }));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedId = e.dataTransfer.getData('text/plain');
                  handleMoveList(draggedId, parentId, index);
                }}
              />

              <div
                className={`sidebar-item ${selectedId === node.id ? 'active' : ''} ${dragState.draggedId && dragState.draggedId !== node.id && dragState.dropTargetKey === nodeKey ? 'drop-target' : ''}`}
                style={{ paddingLeft: depth * 14 + 8 }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', node.id);
                  setDragState({ draggedId: node.id, dropTargetKey: null });
                }}
                onDragEnd={() => setDragState({ draggedId: null, dropTargetKey: null })}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragState.dropTargetKey !== nodeKey) {
                    setDragState((prev) => ({ ...prev, dropTargetKey: nodeKey }));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedId = e.dataTransfer.getData('text/plain');
                  if (!draggedId || draggedId === node.id) return;
                  handleMoveList(draggedId, node.id, node.children.length);
                }}
                onClick={() => setSelectedId(node.id)}
              >
                {node.children.length > 0 ? (
                  <button
                    className="collapse-btn"
                    title={node.collapsed ? 'Expand' : 'Collapse'}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleCollapsed(node);
                    }}
                  >
                    {node.collapsed ? '▶' : '▼'}
                  </button>
                ) : (
                  <span style={{ width: 18, flexShrink: 0 }} />
                )}

                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.title}</span>
                <span className={`badge ${node.type === 'CHECKLIST' ? 'badge-checklist' : 'badge-scorecard'}`}>{node.type === 'CHECKLIST' ? '✓' : '★'}</span>
                {node.parentId && (
                  <button
                    className="btn-icon"
                    title="Outdent one level"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOutdentList(node.id);
                    }}
                  >
                    ⇤
                  </button>
                )}
                <button
                  className="btn-icon"
                  title="Add sub-list"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNewParentId(node.id);
                    setShowNew(true);
                  }}
                >
                  ⊕
                </button>
              </div>

              {!node.collapsed && node.children.length > 0 && renderNodes(node.children, node.id, depth + 1)}
            </div>
          );
        })}
        <div
          className={`sidebar-drop-zone ${dragState.draggedId && dragState.dropTargetKey === `zone:${parentId ?? 'root'}:${nodes.length}` ? 'active' : ''}`}
          style={{ marginLeft: depth * 14 + 8 }}
          onDragOver={(e) => {
            e.preventDefault();
            const key = `zone:${parentId ?? 'root'}:${nodes.length}`;
            if (dragState.dropTargetKey !== key) {
              setDragState((prev) => ({ ...prev, dropTargetKey: key }));
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            handleMoveList(draggedId, parentId, nodes.length);
          }}
        />
      </>
    );
  }

  if (loading) return <Loading />;

  return (
    <div className="two-col">
      {/* Sidebar */}
      <div className="card sidebar">
        {selected && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {selected.type === 'CHECKLIST' && (
              <a href={`?tab=checklist-analysis`} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>📊 Analysis</a>
            )}
            {selected.type === 'SCORECARD' && (
              <a href={`?tab=scorecard-analysis`} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>📊 Analysis</a>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => { setNewParentId(null); setShowNew(true); }}>+ New</button>
          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={loadTemplates}>Templates</button>
        </div>
        {lists.length === 0 && (
          <div className="empty" style={{ padding: '24px 0' }}>
            <p>No lists yet.<br />Create one above.</p>
          </div>
        )}
        {renderNodes(tree, null, 0)}
      </div>

      {/* Main content */}
      <div>
        {selected ? (
          <ListDetail
            key={selected.id}
            listId={selected.id}
            onDelete={() => handleDelete(selected.id)}
            onUpdate={(updated) => setLists(l => l.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
            onReplaceList={handleReplaceList}
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
          title={newParentId ? 'New sub-list' : 'New list'}
          onClose={() => { setShowNew(false); setNewParentId(null); }}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => { setShowNew(false); setNewParentId(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleCreate()} disabled={creating || !newTitle.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </>
          }
        >
          {newParentId && (
            <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 10 }}>This list will be created as a child list.</p>
          )}
          <div className="form-group">
            <label>Title</label>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Morning Routine" autoFocus />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={newType} onChange={e => setNewType(e.target.value)}>
              <option value="CHECKLIST">Checklist</option>
              <option value="SCORECARD">Scorecard</option>
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
              <option value="SCORECARD">Scorecard</option>
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
