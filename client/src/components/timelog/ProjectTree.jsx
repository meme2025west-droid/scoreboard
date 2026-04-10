function DropZone({ onDrop, depth = 0 }) {
  return (
    <div
      className="project-drop-zone"
      style={{ marginLeft: depth > 0 ? 18 : 0 }}
      onDragOver={(e) => e.preventDefault()}
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
}) {
  if (!nodes || nodes.length === 0) return null;
  return (
    <div style={depth > 0 ? { paddingLeft: 16 } : {}}>
      {nodes.map((n, idx) => (
        <div key={n.id}>
          <DropZone
            depth={depth}
            onDrop={(draggedId) => onMove(draggedId, parentId, idx)}
          />
          <div
            className={`project-node ${selected?.id === n.id ? 'selected' : ''}`}
            onClick={() => onSelect(n)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', n.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const draggedId = e.dataTransfer.getData('text/plain');
              if (draggedId && draggedId !== n.id) {
                const childCount = n.children?.length || 0;
                onMove(draggedId, n.id, childCount);
              }
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
            />
          )}
          {idx === nodes.length - 1 && (
            <DropZone
              depth={depth}
              onDrop={(draggedId) => onMove(draggedId, parentId, nodes.length)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
