export default function ProjectTree({ nodes, selected, onSelect, onDelete, onAddChild, depth = 0 }) {
  if (!nodes || nodes.length === 0) return null;
  return (
    <div style={depth > 0 ? { paddingLeft: 16 } : {}}>
      {nodes.map(n => (
        <div key={n.id}>
          <div
            className={`project-node ${selected?.id === n.id ? 'selected' : ''}`}
            onClick={() => onSelect(n)}
          >
            <span
              className="project-dot"
              style={{ background: n.color || 'var(--text3)' }}
            />
            <span style={{ flex: 1 }}>{n.title}</span>
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
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
}
