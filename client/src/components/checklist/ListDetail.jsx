import { useState, useEffect, useMemo } from 'react';
import { getList, updateList, addListItem, updateListItem, moveListItem, deleteListItem, duplicateDetachedList } from '../../api/lists.js';
import { submitList, getSubmissions, getSubmission } from '../../api/submissions.js';
import { useToast } from '../common/Toast.jsx';
import Loading from '../common/Loading.jsx';
import Modal from '../common/Modal.jsx';
import SubmissionHistory from './SubmissionHistory.jsx';
import ListItemRow from './ListItemRow.jsx';

export default function ListDetail({ listId, onDelete, onUpdate, onReplaceList }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState({});  // itemId -> { checked, score, comment, numberValue }
  const [showSubmit, setShowSubmit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [submitNotes, setSubmitNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [recentCheckedIds, setRecentCheckedIds] = useState(() => new Set());
  const [editingTitle, setEditingTitle] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [titleVal, setTitleVal] = useState('');
  const [addingItem, setAddingItem] = useState(null); // parentId or 'root'
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState(() => new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState(null);

  const tree = useMemo(() => list?.itemsTree || [], [list?.itemsTree]);
  const visibleItemIds = useMemo(() => flattenVisibleIds(tree), [tree]);

  useEffect(() => {
    loadList();
    loadSubmissions();
    setSelectedItemIds(new Set());
    setSelectionAnchorId(null);
  }, [listId]);

  useEffect(() => {
    const existingIds = new Set((list?.items || []).map((i) => i.id));
    setSelectedItemIds((prev) => {
      const next = new Set();
      prev.forEach((id) => {
        if (existingIds.has(id)) next.add(id);
      });
      return next;
    });
    setSelectionAnchorId((prev) => (prev && existingIds.has(prev) ? prev : null));
  }, [list?.items]);

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
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
      const recent = data.filter(s => new Date(s.submittedAt) > twentyHoursAgo);
      if (recent.length > 0) {
        const fulls = await Promise.all(recent.map(s => getSubmission(s.id)));
        const ids = new Set(
          fulls.flatMap(f => (f.items || []).filter(si => si.checked).map(si => si.itemId))
        );
        setRecentCheckedIds(ids);
      } else {
        setRecentCheckedIds(new Set());
      }
    } catch {}
  }

  function setValue(itemId, field, val) {
    setValues(v => ({ ...v, [itemId]: { ...v[itemId], [field]: val } }));
  }

  function handleIndentedTextareaKeyDown(e, addHandler) {
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      addHandler();
    }
  }

  function toggleCollapsedInTree(nodes, itemId) {
    return nodes.map((n) => {
      if (n.id === itemId) {
        return { ...n, collapsed: !n.collapsed };
      }
      if (n.children?.length) {
        return { ...n, children: toggleCollapsedInTree(n.children, itemId) };
      }
      return n;
    });
  }

  async function ensureDetachedForEdit(actionLabel = 'make changes') {
    if (!list?.templateId) return true;

    const templateName = list.template?.title || 'this template';
    const confirmed = confirm(
      `This list is synced from ${templateName}. To ${actionLabel}, create an editable copy and stop syncing with the template?`
    );
    if (!confirmed) return false;

    try {
      const duplicated = await duplicateDetachedList(list.id);
      toast('Created editable copy. It no longer syncs with template updates.');
      await onReplaceList?.(duplicated, list.id);
      return false;
    } catch (error) {
      const message = error?.response?.data?.error || 'Failed to create editable copy';
      toast(message, 'error');
      return false;
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const allItems = list.items || [];
      const items = allItems.map(i => ({
        itemId: i.id,
        checked: isChecklist ? (values[i.id]?.checked ?? false) : null,
        score: isScorecard ? (values[i.id]?.score ?? null) : null,
        comment: values[i.id]?.comment || null,
        numberValue: isChecklist && values[i.id]?.numberValue !== '' ? parseFloat(values[i.id]?.numberValue) : null,
      }));
      const result = await submitList({ listId, notes: submitNotes, items });
      toast('Submitted!');
      setShowSubmit(false);
      setSubmitNotes('');
      if (isChecklist) {
        const v = {};
        allItems.forEach(i => {
          v[i.id] = { checked: false, score: null, comment: '', numberValue: '' };
        });
        setValues(v);
      }
      loadSubmissions();
    } catch {
      toast('Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTitle() {
    if (!titleVal.trim()) return;
    if (!(await ensureDetachedForEdit('rename this list'))) {
      setEditingTitle(false);
      setTitleVal(list?.title || '');
      return;
    }
    try {
      const updated = await updateList(listId, { title: titleVal });
      setList(l => ({ ...l, title: updated.title }));
      onUpdate(updated);
    } catch { toast('Failed to save', 'error'); }
    setEditingTitle(false);
  }

  async function handleAddItem(parentId) {
    const lines = newItemTitle
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
    if (lines.length === 0) return;
    if (!(await ensureDetachedForEdit('add items'))) return;
    try {
      const created = [];
      const baseParentId = parentId === 'root' ? null : parentId;
      const parentStack = [];
      let prevDepth = 0;

      for (const entry of lines) {
        const desiredDepth = Number.isInteger(entry.depth) ? entry.depth : 0;
        const safeDepth = Math.min(desiredDepth, prevDepth + 1);
        const effectiveDepth = Math.max(0, safeDepth);

        const itemParentId = effectiveDepth === 0
          ? baseParentId
          : (parentStack[effectiveDepth - 1] || baseParentId);

        const item = await addListItem(listId, {
          title: entry.title,
          parentId: itemParentId,
          unit: isChecklist ? (newItemUnit || null) : null,
        });
        created.push(item);
        parentStack[effectiveDepth] = item.id;
        parentStack.length = effectiveDepth + 1;
        prevDepth = effectiveDepth;
      }
      setValues(v => {
        const next = { ...v };
        for (const item of created) {
          next[item.id] = { checked: false, score: null, comment: '', numberValue: '' };
        }
        return next;
      });
      setAddingItem(null);
      setNewItemTitle('');
      setNewItemUnit('');
      if (created.length > 1) {
        toast(`Added ${created.length} items`);
      }
      loadList();
    } catch { toast('Failed to add item', 'error'); }
  }

  async function handleDeleteItem(itemId) {
    if (!(await ensureDetachedForEdit('delete items'))) return;
    try {
      await deleteListItem(itemId);
      setSelectedItemIds((prev) => {
        if (!prev.has(itemId)) return prev;
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      setSelectionAnchorId((prev) => (prev === itemId ? null : prev));
      loadList();
    } catch { toast('Failed to delete', 'error'); }
  }

  async function handleUpdateItem(itemId, data) {
    if (!(await ensureDetachedForEdit('edit items'))) return;
    try {
      await updateListItem(itemId, data);
      loadList();
    } catch { toast('Failed to update', 'error'); }
  }

  async function handleToggleCollapse(item) {
    // Optimistically update local UI so collapse/expand feels instant.
    setList((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items?.map((it) => it.id === item.id ? { ...it, collapsed: !it.collapsed } : it),
        itemsTree: toggleCollapsedInTree(prev.itemsTree || [], item.id),
      };
    });

    try {
      await updateListItem(item.id, { collapsed: !item.collapsed });
    } catch {
      toast('Failed to toggle item', 'error');
      loadList();
    }
  }

  async function handleMoveItems(itemIds, newParentId, newIndex) {
    if (!(await ensureDetachedForEdit('reorder items'))) return;
    try {
      const ids = Array.from(new Set((itemIds || []).filter(Boolean)));
      if (ids.length === 0) return;

      const parentById = new Map((list?.items || []).map((i) => [i.id, i.parentId || null]));
      const selectedSet = new Set(ids);
      const topLevelIds = ids.filter((id) => {
        let parent = parentById.get(id) || null;
        while (parent) {
          if (selectedSet.has(parent)) return false;
          parent = parentById.get(parent) || null;
        }
        return true;
      });

      const isAncestor = (ancestorId, maybeDescendantId) => {
        let current = maybeDescendantId || null;
        while (current) {
          if (current === ancestorId) return true;
          current = parentById.get(current) || null;
        }
        return false;
      };

      const movableTopLevelIds = topLevelIds.filter((id) => id !== newParentId && !isAncestor(id, newParentId));
      if (movableTopLevelIds.length === 0) return;

      const orderedVisible = flattenVisibleIds(tree);
      const orderedTopLevelIds = [
        ...orderedVisible.filter((id) => movableTopLevelIds.includes(id)),
        ...movableTopLevelIds.filter((id) => !orderedVisible.includes(id)),
      ];

      let insertionIndex = Math.max(0, Number.isInteger(newIndex) ? newIndex : 0);
      for (const id of orderedTopLevelIds) {
        await moveListItem(id, { newParentId, newIndex: insertionIndex });
        insertionIndex += 1;
      }

      setSelectedItemIds(new Set(orderedTopLevelIds));
      loadList();
    } catch {
      toast('Failed to move item', 'error');
    }
  }

  async function handleMoveItem(itemIdOrIds, newParentId, newIndex) {
    const ids = Array.isArray(itemIdOrIds) ? itemIdOrIds : [itemIdOrIds];
    await handleMoveItems(ids, newParentId, newIndex);
  }

  function findNodeWithContext(nodes, id, parent = null) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === id) return { node, parent, index: i };
      if (node.children?.length) {
        const found = findNodeWithContext(node.children, id, node);
        if (found) return found;
      }
    }
    return null;
  }

  async function handleOutdentItem(itemId) {
    const root = list?.itemsTree || [];
    const ctx = findNodeWithContext(root, itemId);
    if (!ctx || !ctx.parent) return;

    const parentCtx = findNodeWithContext(root, ctx.parent.id);
    const newParentId = parentCtx?.parent ? parentCtx.parent.id : null;
    const newIndex = (parentCtx?.index ?? 0) + 1;
    await handleMoveItem(itemId, newParentId, newIndex);
  }

  async function handleSetAllItemsCollapsed(collapsed) {
    const items = list?.items || [];
    const parentIds = new Set(items.map(i => i.parentId).filter(Boolean));
    const targets = items.filter(i => parentIds.has(i.id));
    if (targets.length === 0) return;
    setList((prev) => ({
      ...prev,
      items: prev.items.map(i => parentIds.has(i.id) ? { ...i, collapsed } : i),
      itemsTree: setAllCollapsedInTree(prev.itemsTree || [], parentIds, collapsed),
    }));
    await Promise.all(targets.map(i => updateListItem(i.id, { collapsed }).catch(() => {})));
  }

  function setAllCollapsedInTree(nodes, parentIds, collapsed) {
    return nodes.map(n => ({
      ...n,
      collapsed: parentIds.has(n.id) ? collapsed : n.collapsed,
      children: n.children ? setAllCollapsedInTree(n.children, parentIds, collapsed) : [],
    }));
  }

  async function handleTypeChange(newType) {
    if (hasSubmissions) {
      toast('Type cannot change after submissions exist', 'error');
      return;
    }

    if (!(await ensureDetachedForEdit('change list type'))) return;

    try {
      await updateList(listId, { type: newType });
      setList(l => ({ ...l, type: newType }));
      onUpdate({ id: listId, type: newType });
    } catch (error) {
      const message = error?.response?.data?.error || 'Failed to update type';
      toast(message, 'error');
    }
  }

  if (loading) return <Loading />;
  if (!list) return null;

  const isTemplateLocked = !!list.templateId;
  const isChecklist = list.type === 'CHECKLIST';
  const isScorecard = list.type === 'SCORECARD' || list.type === 'SCOREBOARD';
  const selectType = isScorecard ? 'SCORECARD' : list.type;
  const hasSubmissions = submissions.length > 0;

  function handleRowSelect(itemId, event) {
    if (!editMode) return;
    // Only handle clicks directly on the row, not on interactive elements
    const target = event?.target;
    const isInteractiveElement = target?.closest?.('button,input,textarea,select,a,label,[contenteditable="true"]');
    if (isInteractiveElement) {
      return;
    }

    if ((event?.ctrlKey || event?.metaKey) && !event?.shiftKey) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
      setSelectionAnchorId(itemId);
      return;
    }

    if (event?.shiftKey && selectionAnchorId) {
      const anchorIdx = visibleItemIds.indexOf(selectionAnchorId);
      const currentIdx = visibleItemIds.indexOf(itemId);
      
      if (anchorIdx !== -1 && currentIdx !== -1) {
        const start = Math.min(anchorIdx, currentIdx);
        const end = Math.max(anchorIdx, currentIdx);
        const range = visibleItemIds.slice(start, end + 1);
        
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          range.forEach((id) => next.add(id));
          return next;
        });
        return;
      }
    }

    setSelectedItemIds(new Set([itemId]));
    setSelectionAnchorId(itemId);
  }

  async function handleToggleEditMode() {
    if (editMode) {
      setEditMode(false);
      setSelectedItemIds(new Set());
      setSelectionAnchorId(null);
      return;
    }
    if (!(await ensureDetachedForEdit('reorder items'))) return;
    setEditMode(true);
  }

  async function handleStartAddItem(parentId) {
    if (!(await ensureDetachedForEdit('add items'))) return;
    setAddingItem(parentId);
    setNewItemTitle('');
    setNewItemUnit('');
  }

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
              value={selectType}
              onChange={e => handleTypeChange(e.target.value)}
              disabled={hasSubmissions}
              style={{ width: 'auto', fontSize: 12, padding: '3px 8px' }}
              title={hasSubmissions ? 'Type is locked because this list already has submissions' : 'Change list type'}
            >
              <option value="CHECKLIST">Checklist</option>
              <option value="SCORECARD">Scorecard</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(list?.items || []).some(i => (list?.items || []).some(x => x.parentId === i.id)) && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => handleSetAllItemsCollapsed(false)}>Expand All</button>
                <button className="btn btn-secondary btn-sm" onClick={() => handleSetAllItemsCollapsed(true)}>Collapse All</button>
              </>
            )}
            <button
              className={`btn btn-secondary btn-sm ${editMode ? 'active-edit-btn' : ''}`}
              onClick={handleToggleEditMode}
              title={editMode ? 'Stop rearranging' : 'Rearrange items'}
            >
              {editMode ? '✓ Done' : '✎ Edit'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(true)}>History</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowSubmit(true)}>Submit</button>
            <button className="btn-icon" onClick={onDelete} title="Delete list" style={{ color: 'var(--red)' }}>🗑</button>
          </div>
        </div>

        {list.template && (
          <div style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 6, padding: '6px 10px', marginBottom: 12 }}>
            Synced with template <strong>{list.template.title}</strong>. If you edit this list, you will be asked to create a detached editable copy.
          </div>
        )}

        {/* Items */}
        {tree.length === 0 && (
          <div className="empty" style={{ padding: '20px 0' }}><p>No items yet. Add your first item below.</p></div>
        )}

        {tree.map((item, idx) => (
          <ListItemRow
            key={item.id}
            item={item}
            type={list.type}
            editMode={editMode}
            values={values}
            setValue={setValue}
            onDelete={handleDeleteItem}
            onUpdate={handleUpdateItem}
            onMove={handleMoveItem}
            onOutdent={handleOutdentItem}
            onToggleCollapse={handleToggleCollapse}
            onAddChild={handleStartAddItem}
            isTemplateLocked={isTemplateLocked}
            recentCheckedIds={recentCheckedIds}
            selectedItemIds={selectedItemIds}
            onSelectRow={handleRowSelect}
            parentId={null}
            index={idx}
            siblingsCount={tree.length}
          />
        ))}

        {/* Add root item */}
        {addingItem === 'root' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <textarea
              value={newItemTitle}
              onChange={e => setNewItemTitle(e.target.value)}
              placeholder="Type or paste items (one per line). Use tab or 4 spaces to indent sub-items…"
              autoFocus
              rows={4}
              draggable={false}
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => handleIndentedTextareaKeyDown(e, () => handleAddItem('root'))}
              style={{ width: '100%' }}
            />
            {isChecklist && <input value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} placeholder="Unit for all items (optional)" style={{ width: '100%' }} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => handleAddItem('root')}>Add</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setAddingItem(null)}>✕</button>
              <span style={{ fontSize: 12, color: 'var(--text2)', alignSelf: 'center' }}>Tip: one per line, tab/4 spaces indents sub-items, Ctrl+Enter adds</span>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => handleStartAddItem('root')}>
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
              <label>Title(s)</label>
              <textarea
                value={newItemTitle}
                onChange={e => setNewItemTitle(e.target.value)}
                autoFocus
                rows={4}
                draggable={false}
                onMouseDown={e => e.stopPropagation()}
                placeholder="Type or paste sub-items, one per line. Use tab or 4 spaces for deeper levels…"
                onKeyDown={e => handleIndentedTextareaKeyDown(e, () => handleAddItem(addingItem))}
              />
              <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>One item per line. Tab or 4 spaces creates sub-items. Use Ctrl+Enter to add.</p>
            </div>
            {isChecklist && (
              <div className="form-group">
                <label>Unit for all items (optional, e.g. "kg", "reps")</label>
                <input value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} placeholder="Unit…" />
              </div>
            )}
          </Modal>
        )}
      </div>

      {/* Submit modal */}
      {showSubmit && (
        <Modal
          title={`Submit ${isChecklist ? 'checklist' : 'scorecard'}`}
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

function flattenVisibleIds(nodes) {
  const out = [];
  for (const node of nodes || []) {
    out.push(node.id);
    if (!node.collapsed && node.children?.length) {
      out.push(...flattenVisibleIds(node.children));
    }
  }
  return out;
}
