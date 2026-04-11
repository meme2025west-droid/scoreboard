import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

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
        const draggedIds = readDraggedIds(e);
        if (draggedIds.length > 0) onDrop(draggedIds);
      }}
    />
  );
}

export default function ListItemRow({ item, type, editMode = false, values, setValue, onDelete, onUpdate, onMove, onOutdent, onToggleCollapse, onAddChild, isTemplateLocked = false, depth = 0, parentId = null, index = 0, siblingsCount = 1, dragState: sharedDragState, setDragState: setSharedDragState, selectedItemIds, onSelectRow }) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [showComment, setShowComment] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [editingNotes, setEditingNotes] = useState(item.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [localDragState, setLocalDragState] = useState({ draggedId: null, draggedIds: [], dropTargetKey: null });
  const dragState = sharedDragState || localDragState;
  const setDragState = setSharedDragState || setLocalDragState;
  const val = values[item.id] || { checked: false, score: null, comment: '', numberValue: '' };
  const hasChildren = item.children && item.children.length > 0;
  const isChecklist = type === 'CHECKLIST';
  const isScorecard = type === 'SCORECARD' || type === 'SCOREBOARD';
  const beforeZoneKey = `zone:${parentId ?? 'root'}:${index}`;
  const nodeDropKey = `node:${item.id}`;
  const afterZoneKey = `zone:${parentId ?? 'root'}:${siblingsCount}`;
  const isSelected = selectedItemIds?.has?.(item.id) || false;

  function saveTitle() {
    if (editTitle.trim() && editTitle !== item.title) {
      onUpdate(item.id, { title: editTitle });
    }
    setEditing(false);
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await onUpdate(item.id, { notes: editingNotes });
      setShowNotes(false);
    } finally {
      setSavingNotes(false);
    }
  }

  function handleNotesKeyDown(e) {
    if (e.ctrlKey) {
      switch (e.key) {
        case 'b':
        case 'B':
          e.preventDefault();
          const textarea = e.target;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const selectedText = editingNotes.substring(start, end);
          const before = editingNotes.substring(0, start);
          const after = editingNotes.substring(end);
          setEditingNotes(before + '**' + (selectedText || 'bold') + '**' + after);
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          const ta1 = e.target;
          const s1 = ta1.selectionStart;
          const e1 = ta1.selectionEnd;
          const sel1 = editingNotes.substring(s1, e1);
          const b1 = editingNotes.substring(0, s1);
          const a1 = editingNotes.substring(e1);
          setEditingNotes(b1 + '*' + (sel1 || 'italic') + '*' + a1);
          break;
        case 'u':
        case 'U':
          e.preventDefault();
          const ta2 = e.target;
          const s2 = ta2.selectionStart;
          const e2 = ta2.selectionEnd;
          const sel2 = editingNotes.substring(s2, e2);
          const b2 = editingNotes.substring(0, s2);
          const a2 = editingNotes.substring(e2);
          setEditingNotes(b2 + '<u>' + (sel2 || 'underline') + '</u>' + a2);
          break;
        case '-':
          e.preventDefault();
          const ta3 = e.target;
          const s3 = ta3.selectionStart;
          const lineStart = editingNotes.lastIndexOf('\n', s3 - 1) + 1;
          const before3 = editingNotes.substring(0, lineStart);
          const after3 = editingNotes.substring(lineStart);
          setEditingNotes(before3 + '- ' + after3);
          break;
        default:
          break;
      }
    }
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
            setDragState({ draggedId: null, draggedIds: [], dropTargetKey: null });
          }}
        />
      )}
      <div
        className={`list-item-row ${isSelected ? 'selected' : ''} ${dragState.draggedIds?.length && !dragState.draggedIds.includes(item.id) && dragState.dropTargetKey === nodeDropKey ? 'drop-target' : ''}`}
        style={{ marginLeft: depth > 0 ? 0 : 0 }}
        draggable={editMode}
        onDragStart={(e) => {
          if (!editMode) return;
          const canDragSelection = selectedItemIds?.has?.(item.id) && selectedItemIds.size > 1;
          const draggedIds = canDragSelection ? Array.from(selectedItemIds) : [item.id];
          e.dataTransfer.setData('application/x-list-item-ids', JSON.stringify(draggedIds));
          e.dataTransfer.setData('text/plain', draggedIds[0]);
          e.dataTransfer.effectAllowed = 'move';
          setDragState({ draggedId: item.id, draggedIds, dropTargetKey: null });
        }}
        onDragEnd={() => setDragState({ draggedId: null, draggedIds: [], dropTargetKey: null })}
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
          const draggedIds = readDraggedIds(e);
          if (draggedIds.length > 0 && !draggedIds.includes(item.id)) {
            const childCount = item.children?.length || 0;
            onMove(draggedIds, item.id, childCount);
          }
          setDragState({ draggedId: null, draggedIds: [], dropTargetKey: null });
        }}
        onClick={(e) => onSelectRow?.(item.id, e)}
      >
        {/* Collapse toggle */}
        {hasChildren ? (
          <button className="collapse-btn" onClick={() => onToggleCollapse(item)}>
            {item.collapsed ? '▶' : '▼'}
          </button>
        ) : (
          <span style={{ width: 18 }} />
        )}

        {/* Checklist checkbox (scorecard places score after title) */}
        {isChecklist && (
          <div
            className={`checkbox-custom ${val.checked ? 'checked' : ''}`}
            onClick={() => setValue(item.id, 'checked', !val.checked)}
          >
            {val.checked && '✓'}
          </div>
        )}

        {/* Title */}
        <div className="list-item-title">
          {editing ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => e.key === 'Enter' && saveTitle()}
              autoFocus
              className="inline-edit-input"
              style={{ background: 'transparent', border: '1px solid var(--accent)', padding: '2px 6px', borderRadius: 4, fontSize: 14, width: '100%' }}
            />
          ) : (
            <span onDoubleClick={() => { setEditing(true); setEditTitle(item.title); }}>{item.title}</span>
          )}
          {isChecklist && item.unit && <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 6 }}>[{item.unit}]</span>}
        </div>

        {editMode && (
          <button
            className="btn-icon"
            style={{ fontSize: 13 }}
            onClick={() => onOutdent(item.id)}
            title="Outdent one level"
          >
            ⇤
          </button>
        )}

        {/* Score controls after title for scorecard */}
        {isScorecard && (
          <div className="score-display">
            {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
              <button
                key={n}
                className={`score-pip ${val.score !== null && val.score !== undefined && val.score >= n ? 'filled' : ''}`}
                onClick={() => setValue(item.id, 'score', val.score === n ? null : n)}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {/* Number input */}
        {isChecklist && item.unit && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="number"
              value={val.numberValue}
              onChange={e => setValue(item.id, 'numberValue', e.target.value)}
              style={{ width: 72, padding: '4px 8px', fontSize: 13 }}
              placeholder="0"
            />
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{item.unit}</span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {(editMode || item.notes) && (
            <button className="btn-icon" title="Note" onClick={() => setShowNotes(s => !s)} style={{ fontSize: 14 }}>
              📝
            </button>
          )}
          <button className="btn-icon" title="Comment" onClick={() => setShowComment(s => !s)} style={{ fontSize: 14 }}>
            💬
          </button>
          <button className="btn-icon" title="Add sub-item" onClick={() => onAddChild(item.id)} style={{ fontSize: 14 }}>
            ⊕
          </button>
          <button className="btn-icon" title="Delete" onClick={() => onDelete(item.id)} style={{ color: 'var(--red)', fontSize: 14 }}>
            ✕
          </button>
        </div>
      </div>

      {/* Notes field */}
      {showNotes && (
        <div style={{ paddingLeft: depth * 28 + 54, marginBottom: 6 }}>
          {editMode ? (
            <>
              <textarea
                value={editingNotes}
                onChange={e => setEditingNotes(e.target.value)}
                onKeyDown={handleNotesKeyDown}
                placeholder="Add notes (supports markdown)… Ctrl+B: bold, Ctrl+I: italic, Ctrl+U: underline, Ctrl+-: bullet"
                style={{ fontSize: 13, minHeight: 80 }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button 
                  className="btn btn-primary btn-sm" 
                  onClick={saveNotes}
                  disabled={savingNotes}
                >
                  {savingNotes ? 'Saving...' : 'Save'}
                </button>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => {
                    setEditingNotes(item.notes || '');
                    setShowNotes(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div style={{ 
              fontSize: 13, 
              padding: '8px 12px', 
              background: 'var(--bg3)', 
              border: '1px solid var(--border)', 
              borderRadius: 4,
              wordBreak: 'break-word'
            }}>
              {item.notes ? (
                <div 
                  dangerouslySetInnerHTML={{ __html: item.notes }} 
                  style={{ fontSize: 13 }}
                />
              ) : (
                '(no notes)'
              )}
            </div>
          )}
        </div>
      )}

      {/* Comment field */}
      {showComment && (
        <div style={{ paddingLeft: depth * 28 + 54, marginBottom: 6 }}>
          <input
            value={val.comment}
            onChange={e => setValue(item.id, 'comment', e.target.value)}
            placeholder="Comment for this item…"
            style={{ fontSize: 13 }}
          />
        </div>
      )}

      {/* Children */}
      {hasChildren && !item.collapsed && (
        <div className="list-item-children">
          {item.children.map((child, childIndex) => (
            <ListItemRow
              key={child.id}
              item={child}
              type={type}
              editMode={editMode}
              values={values}
              setValue={setValue}
              onDelete={onDelete}
              onUpdate={onUpdate}
              onMove={onMove}
              onOutdent={onOutdent}
              onToggleCollapse={onToggleCollapse}
              onAddChild={onAddChild}
              isTemplateLocked={isTemplateLocked}
              selectedItemIds={selectedItemIds}
              onSelectRow={onSelectRow}
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
            setDragState({ draggedId: null, draggedIds: [], dropTargetKey: null });
          }}
        />
      )}
    </div>
  );
}

function readDraggedIds(event) {
  const raw = event.dataTransfer.getData('application/x-list-item-ids');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((id) => typeof id === 'string' && id);
      }
    } catch {
      // Ignore malformed payload and fall back to plain text.
    }
  }
  const draggedId = event.dataTransfer.getData('text/plain');
  return draggedId ? [draggedId] : [];
}
