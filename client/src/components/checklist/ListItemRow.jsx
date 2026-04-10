import { useState } from 'react';

function DropZone({ onDrop, depth = 0 }) {
  return (
    <div
      className="list-item-drop-zone"
      style={{ marginLeft: depth > 0 ? 28 : 0 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId) onDrop(draggedId);
      }}
    />
  );
}

export default function ListItemRow({ item, type, editMode = false, values, setValue, onDelete, onUpdate, onMove, onOutdent, onToggleCollapse, onAddChild, depth = 0, parentId = null, index = 0, siblingsCount = 1 }) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [showComment, setShowComment] = useState(false);
  const val = values[item.id] || { checked: false, score: null, comment: '', numberValue: '' };
  const hasChildren = item.children && item.children.length > 0;
  const isChecklist = type === 'CHECKLIST';
  const isScorecard = type === 'SCORECARD' || type === 'SCOREBOARD';

  function saveTitle() {
    if (editTitle.trim() && editTitle !== item.title) {
      onUpdate(item.id, { title: editTitle });
    }
    setEditing(false);
  }

  return (
    <div>
      {editMode && (
        <DropZone depth={depth} onDrop={(draggedId) => onMove(draggedId, parentId, index)} />
      )}
      <div
        className="list-item-row"
        style={{ marginLeft: depth > 0 ? 0 : 0 }}
        draggable={editMode}
        onDragStart={(e) => {
          if (!editMode) return;
          e.dataTransfer.setData('text/plain', item.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (editMode) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!editMode) return;
          e.preventDefault();
          const draggedId = e.dataTransfer.getData('text/plain');
          if (draggedId && draggedId !== item.id) {
            const childCount = item.children?.length || 0;
            onMove(draggedId, item.id, childCount);
          }
        }}
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
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button
                key={n}
                className={`score-pip ${val.score >= n ? 'filled' : ''}`}
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
              depth={depth + 1}
              parentId={item.id}
              index={childIndex}
              siblingsCount={item.children.length}
            />
          ))}
        </div>
      )}

      {editMode && index === siblingsCount - 1 && (
        <DropZone depth={depth} onDrop={(draggedId) => onMove(draggedId, parentId, siblingsCount)} />
      )}
    </div>
  );
}
