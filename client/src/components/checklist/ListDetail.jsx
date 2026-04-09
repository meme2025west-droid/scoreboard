import { useState, useEffect } from 'react';
import { getList, updateList, addListItem, updateListItem, deleteListItem, syncListFromTemplate } from '../../api/lists.js';
import { submitList, getSubmissions } from '../../api/submissions.js';
import { useToast } from '../common/Toast.jsx';
import Loading from '../common/Loading.jsx';
import Modal from '../common/Modal.jsx';
import SubmissionHistory from './SubmissionHistory.jsx';
import ListItemRow from './ListItemRow.jsx';

export default function ListDetail({ listId, onDelete, onUpdate }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState({});  // itemId -> { checked, score, comment, numberValue }
  const [showSubmit, setShowSubmit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [submitNotes, setSubmitNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState('');
  const [addingItem, setAddingItem] = useState(null); // parentId or 'root'
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');

  useEffect(() => {
    loadList();
    loadSubmissions();
  }, [listId]);

  async function loadList() {
    setLoading(true);
    try {
      const data = await getList(listId);
      setList(data);
      setTitleVal(data.title);
      // Init values from items
      const v = {};
      (data.items || []).forEach(i => {
        v[i.id] = { checked: false, score: null, comment: '', numberValue: '' };
      });
      setValues(v);
    } catch {
      toast('Failed to load list', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadSubmissions() {
    try {
      const data = await getSubmissions(listId);
      setSubmissions(data);
    } catch {}
  }

  function setValue(itemId, field, val) {
    setValues(v => ({ ...v, [itemId]: { ...v[itemId], [field]: val } }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const allItems = list.items || [];
      const items = allItems.map(i => ({
        itemId: i.id,
        checked: list.type === 'CHECKLIST' ? (values[i.id]?.checked ?? false) : null,
        score: list.type === 'SCOREBOARD' ? (values[i.id]?.score ?? null) : null,
        comment: values[i.id]?.comment || null,
        numberValue: values[i.id]?.numberValue !== '' ? parseFloat(values[i.id]?.numberValue) : null,
      }));
      await submitList({ listId, notes: submitNotes, items });
      toast('Submitted!');
      setShowSubmit(false);
      setSubmitNotes('');
      loadSubmissions();
    } catch {
      toast('Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTitle() {
    if (!titleVal.trim()) return;
    try {
      const updated = await updateList(listId, { title: titleVal });
      setList(l => ({ ...l, title: updated.title }));
      onUpdate(updated);
    } catch { toast('Failed to save', 'error'); }
    setEditingTitle(false);
  }

  async function handleAddItem(parentId) {
    if (!newItemTitle.trim()) return;
    try {
      const item = await addListItem(listId, {
        title: newItemTitle,
        parentId: parentId === 'root' ? null : parentId,
        unit: newItemUnit || null,
      });
      setValues(v => ({ ...v, [item.id]: { checked: false, score: null, comment: '', numberValue: '' } }));
      setAddingItem(null);
      setNewItemTitle('');
      setNewItemUnit('');
      loadList();
    } catch { toast('Failed to add item', 'error'); }
  }

  async function handleDeleteItem(itemId) {
    try {
      await deleteListItem(itemId);
      loadList();
    } catch { toast('Failed to delete', 'error'); }
  }

  async function handleUpdateItem(itemId, data) {
    try {
      await updateListItem(itemId, data);
      loadList();
    } catch { toast('Failed to update', 'error'); }
  }

  async function handleToggleCollapse(item) {
    await updateListItem(item.id, { collapsed: !item.collapsed });
    loadList();
  }

  async function handleSync() {
    if (!confirm('This will replace all items with the latest template. Continue?')) return;
    try {
      await syncListFromTemplate(listId);
      toast('Synced from template');
      loadList();
    } catch { toast('Sync failed', 'error'); }
  }

  async function handleTypeChange(newType) {
    try {
      await updateList(listId, { type: newType });
      setList(l => ({ ...l, type: newType }));
      onUpdate({ id: listId, type: newType });
    } catch { toast('Failed to update type', 'error'); }
  }

  if (loading) return <Loading />;
  if (!list) return null;

  const tree = list.itemsTree || [];

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        {/* Header */}
        <div className="section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            {editingTitle ? (
              <input
                value={titleVal}
                onChange={e => setTitleVal(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => e.key === 'Enter' && saveTitle()}
                autoFocus
                style={{ fontSize: 18, fontWeight: 700, background: 'transparent', border: '1px solid var(--accent)', padding: '2px 8px' }}
              />
            ) : (
              <h2 style={{ fontSize: 18, fontWeight: 700, cursor: 'pointer' }} onClick={() => setEditingTitle(true)}>
                {list.title}
              </h2>
            )}
            <select
              value={list.type}
              onChange={e => handleTypeChange(e.target.value)}
              style={{ width: 'auto', fontSize: 12, padding: '3px 8px' }}
            >
              <option value="CHECKLIST">Checklist</option>
              <option value="SCOREBOARD">Scoreboard</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {list.templateId && (
              <button className="btn btn-secondary btn-sm" onClick={handleSync} title="Sync from template">↻ Sync</button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(true)}>History</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowSubmit(true)}>Submit</button>
            <button className="btn-icon" onClick={onDelete} title="Delete list" style={{ color: 'var(--red)' }}>🗑</button>
          </div>
        </div>

        {list.template && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
            Template: <strong>{list.template.title}</strong>
          </div>
        )}

        {/* Items */}
        {tree.length === 0 && (
          <div className="empty" style={{ padding: '20px 0' }}><p>No items yet. Add your first item below.</p></div>
        )}

        {tree.map(item => (
          <ListItemRow
            key={item.id}
            item={item}
            type={list.type}
            values={values}
            setValue={setValue}
            onDelete={handleDeleteItem}
            onUpdate={handleUpdateItem}
            onToggleCollapse={handleToggleCollapse}
            onAddChild={(parentId) => { setAddingItem(parentId); setNewItemTitle(''); setNewItemUnit(''); }}
          />
        ))}

        {/* Add root item */}
        {addingItem === 'root' ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} placeholder="Item title…" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAddItem('root')}
              style={{ flex: 2 }}
            />
            <input value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} placeholder="Unit (optional)" style={{ flex: 1 }} />
            <button className="btn btn-primary btn-sm" onClick={() => handleAddItem('root')}>Add</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setAddingItem(null)}>✕</button>
          </div>
        ) : (
          <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setAddingItem('root')}>
            + Add item
          </button>
        )}

        {/* Adding child items (triggered from row) */}
        {addingItem && addingItem !== 'root' && (
          <Modal title="Add sub-item" onClose={() => setAddingItem(null)}
            actions={
              <>
                <button className="btn btn-secondary" onClick={() => setAddingItem(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => handleAddItem(addingItem)}>Add</button>
              </>
            }
          >
            <div className="form-group">
              <label>Title</label>
              <input value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} autoFocus placeholder="Sub-item title…" />
            </div>
            <div className="form-group">
              <label>Unit (optional, e.g. "kg", "reps")</label>
              <input value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} placeholder="Unit…" />
            </div>
          </Modal>
        )}
      </div>

      {/* Submit modal */}
      {showSubmit && (
        <Modal
          title={`Submit ${list.type === 'CHECKLIST' ? 'checklist' : 'scoreboard'}`}
          onClose={() => setShowSubmit(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setShowSubmit(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Saving…' : 'Submit & save'}
              </button>
            </>
          }
        >
          <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 16 }}>
            This will snapshot the current state and save it to history.
          </p>
          <div className="form-group">
            <label>Notes (optional)</label>
            <textarea value={submitNotes} onChange={e => setSubmitNotes(e.target.value)} placeholder="Any notes for this submission…" />
          </div>
        </Modal>
      )}

      {/* History panel */}
      {showHistory && (
        <SubmissionHistory
          listId={listId}
          listType={list.type}
          submissions={submissions}
          onClose={() => setShowHistory(false)}
          onDeleted={loadSubmissions}
        />
      )}
    </div>
  );
}
