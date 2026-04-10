import { useState } from 'react';

function DropZone({ onDrop, depth = 0, isActive = false, onDragOver }) {
  return (
    <div
      className={`project-drop-zone ${isActive ? 'active' : ''}`}
      style={{ marginLeft: depth > 0 ? 18 : 0 }}
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

function TallyMarks({ count }) {
  if (!count) {
    return <span className="project-tally-zero">0</span>;
  }

  const groupsOfFive = Math.floor(count / 5);
  const remainder = count % 5;

  return (
    <span className="project-tally-marks" aria-label={`${count} tallies`}>
      {Array.from({ length: groupsOfFive }).map((_, index) => (
        <span key={`five-${index}`} className="tally-group-five">
          <span className="tally-group-four">IIII</span>
          <span className="tally-group-slash">/</span>
        </span>
      ))}
      {remainder > 0 && <span className="tally-group-remainder">{'I'.repeat(remainder)}</span>}
    </span>
  );
}

export default function ProjectTree({
  nodes,
  selected,
  onSelect,
  onDelete,
  onAddChild,
  onMove,
  onOutdent,
  onToggleStar,
  onAddTally,
  tallyCounts = {},
  depth = 0,
  parentId = null,
  dragState: sharedDragState,
  setDragState: setSharedDragState,
}) {
  const [localDragState, setLocalDragState] = useState({ draggedId: null, dropTargetKey: null });
  const dragState = sharedDragState || localDragState;
  const setDragState = setSharedDragState || setLocalDragState;

  if (!nodes || nodes.length === 0) return null;
  return (
    <div style={depth > 0 ? { paddingLeft: 16 } : {}}>
      {nodes.map((n, idx) => {
        const beforeZoneKey = `zone:${parentId ?? 'root'}:${idx}`;
        const nodeDropKey = `node:${n.id}`;
        const afterZoneKey = `zone:${parentId ?? 'root'}:${nodes.length}`;

        return (
          <div key={n.id}>
          <DropZone
            depth={depth}
            isActive={dragState.draggedId && dragState.dropTargetKey === beforeZoneKey}
            onDragOver={() => {
              if (dragState.dropTargetKey !== beforeZoneKey) {
                setDragState((prev) => ({ ...prev, dropTargetKey: beforeZoneKey }));
              }
            }}
            onDrop={(draggedId) => {
              onMove(draggedId, parentId, idx);
              setDragState({ draggedId: null, dropTargetKey: null });
            }}
          />
          <div
            className={`project-node ${selected?.id === n.id ? 'selected' : ''} ${dragState.draggedId && dragState.draggedId !== n.id && dragState.dropTargetKey === nodeDropKey ? 'drop-target' : ''}`}
            onClick={() => onSelect(n)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', n.id);
              e.dataTransfer.effectAllowed = 'move';
              setDragState({ draggedId: n.id, dropTargetKey: null });
            }}
            onDragEnd={() => setDragState({ draggedId: null, dropTargetKey: null })}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragState.dropTargetKey !== nodeDropKey) {
                setDragState((prev) => ({ ...prev, dropTargetKey: nodeDropKey }));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const draggedId = e.dataTransfer.getData('text/plain');
              if (draggedId && draggedId !== n.id) {
                const childCount = n.children?.length || 0;
                onMove(draggedId, n.id, childCount);
              }
              setDragState({ draggedId: null, dropTargetKey: null });
            }}
          >
            <span
              className="project-dot"
              style={{ background: n.color || 'var(--text3)' }}
            />
            <span style={{ flex: 1 }}>{n.title}</span>
            <button
              className={`btn-icon project-star-btn ${n.starred ? 'active' : ''}`}
              style={{ fontSize: 14 }}
              onClick={e => { e.stopPropagation(); onToggleStar(n); }}
              title={n.starred ? 'Remove from tally list' : 'Star for tally list'}
            >★</button>
            {n.starred && (
              <>
                <span className="project-tally-count"><TallyMarks count={tallyCounts[n.id] || 0} /></span>
                <button
                  className="btn btn-secondary btn-sm project-tally-btn"
                  onClick={e => { e.stopPropagation(); onAddTally(n); }}
                  title="Add one tally"
                >+</button>
              </>
            )}
            <button
              className="btn-icon"
              style={{ fontSize: 13 }}
              onClick={e => { e.stopPropagation(); onOutdent(n.id); }}
              title="Outdent one level"
            >⇤</button>
            <button
              className="btn-icon"
              style={{ fontSize: 13 }}
              onClick={e => { e.stopPropagation(); onAddChild(n.id); }}
              title="Add sub-project"
            >⊕</button>
            <button
              className="btn-icon"
              style={{ fontSize: 13, color: 'var(--red)' }}
              onClick={e => { e.stopPropagation(); onDelete(n.id); }}
              title="Delete"
            >✕</button>
          </div>
          {n.children && n.children.length > 0 && (
            <ProjectTree
              nodes={n.children}
              selected={selected}
              onSelect={onSelect}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onMove={onMove}
              onOutdent={onOutdent}
              onToggleStar={onToggleStar}
              onAddTally={onAddTally}
              tallyCounts={tallyCounts}
              depth={depth + 1}
              parentId={n.id}
              dragState={dragState}
              setDragState={setDragState}
            />
          )}
          {idx === nodes.length - 1 && (
            <DropZone
              depth={depth}
              isActive={dragState.draggedId && dragState.dropTargetKey === afterZoneKey}
              onDragOver={() => {
                if (dragState.dropTargetKey !== afterZoneKey) {
                  setDragState((prev) => ({ ...prev, dropTargetKey: afterZoneKey }));
                }
              }}
              onDrop={(draggedId) => {
                onMove(draggedId, parentId, nodes.length);
                setDragState({ draggedId: null, dropTargetKey: null });
              }}
            />
          )}
          </div>
        );
      })}
    </div>
  );
}
