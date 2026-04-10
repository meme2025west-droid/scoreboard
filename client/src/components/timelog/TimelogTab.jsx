import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getUserProjects, createProject, deleteProject, moveProject, updateProject } from '../../api/projects.js';
import { getTimelog, getLastEntry, createEntry, deleteEntry } from '../../api/timelog.js';
import { createEffortEntry, getEffortAnalytics } from '../../api/effort.js';
import { useToast } from '../common/Toast.jsx';
import Loading from '../common/Loading.jsx';
import Modal from '../common/Modal.jsx';
import ProjectTree from './ProjectTree.jsx';
import TimelogList from './TimelogList.jsx';
import TimelogAnalytics from './TimelogAnalytics.jsx';

const EST_TZ = 'America/New_York';
const COLORS = ['#6c63ff','#4a9eff','#4caf7d','#f5a623','#f06565','#a78bfa','#ff6b9d','#00c9a7'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoStr() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
}

function flattenTree(nodes, arr = []) {
  nodes.forEach((node) => {
    arr.push(node);
    if (node.children) flattenTree(node.children, arr);
  });
  return arr;
}

function toLocalInput(date, tz) {
  if (!date) return '';
  try {
    // Format as datetime-local input value in given tz
    const d = new Date(date);
    const fmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    return fmt.format(d).replace(' ', 'T').slice(0, 16);
  } catch { return ''; }
}

function inputToUTC(localStr) {
  if (!localStr) return null;
  return new Date(localStr).toISOString();
}

function getStarredOnlyStorageKey(token) {
  return `scorecard.timelog.starredOnly.${token}`;
}

function filterToStarred(nodes) {
  const filtered = [];
  for (const node of nodes) {
    const filteredChildren = filterToStarred(node.children || []);
    if (node.starred || filteredChildren.length > 0) {
      filtered.push({ ...node, children: filteredChildren });
    }
  }
  return filtered;
}

export default function TimelogTab({ token, user }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const tz = user.timezone || EST_TZ;

  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedProject, setSelectedProject] = useState(null);
  const [comment, setComment] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Project form
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjTitle, setNewProjTitle] = useState('');
  const [newProjParent, setNewProjParent] = useState(null);
  const [newProjColor, setNewProjColor] = useState(COLORS[0]);
  const [rangeFromInput, setRangeFromInput] = useState(weekAgoStr());
  const [rangeToInput, setRangeToInput] = useState(todayStr());
  const [rangeFrom, setRangeFrom] = useState(weekAgoStr());
  const [rangeTo, setRangeTo] = useState(todayStr());
  const [tallyCounts, setTallyCounts] = useState({});
  const [tallyProject, setTallyProject] = useState(null);
  const [tallyComment, setTallyComment] = useState('');
  const [tallySubmitting, setTallySubmitting] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(() => {
    try {
      return localStorage.getItem(getStarredOnlyStorageKey(token)) === 'true';
    } catch {
      return false;
    }
  });

  const requestedView = searchParams.get('timelogView');
  const tab = requestedView === 'analytics' ? 'analytics' : 'log';

  useEffect(() => {
    loadAll();
  }, [token]);

  useEffect(() => {
    try {
      setShowStarredOnly(localStorage.getItem(getStarredOnlyStorageKey(token)) === 'true');
    } catch {
      setShowStarredOnly(false);
    }
  }, [token]);

  useEffect(() => {
    if (!requestedView) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('timelogView', 'log');
      setSearchParams(nextParams, { replace: true });
    }
  }, [requestedView, searchParams, setSearchParams]);

  async function refreshProjects() {
    const projs = await getUserProjects(token);
    setProjects(projs);
    if (selectedProject) {
      const updatedSelected = flattenTree(projs).find(p => p.id === selectedProject.id) || null;
      setSelectedProject(updatedSelected);
    }
  }

  async function loadAll() {
    setLoading(true);
    try {
      const fromISO = new Date(rangeFrom + 'T00:00:00').toISOString();
      const toISO = new Date(rangeTo + 'T23:59:59').toISOString();
      const [projs, ents, last] = await Promise.all([
        getUserProjects(token),
        getTimelog(token),
        getLastEntry(token),
      ]);
      setProjects(projs);
      setEntries(ents);
      await loadTallyCounts(fromISO, toISO);
      const now = toLocalInput(new Date(), tz);
      setEndTime(now);
      if (last) {
        setStartTime(toLocalInput(new Date(last.submittedAt), tz));
      } else {
        setStartTime(now);
      }
    } catch {
      toast('Failed to load timelog', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadTallyCounts(fromISO, toISO) {
    const tallyData = await getEffortAnalytics(token, { from: fromISO, to: toISO });
    setTallyCounts(tallyData.reduce((acc, item) => {
      acc[item.projectId] = item.count;
      return acc;
    }, {}));
  }

  async function handleSubmitEntry() {
    if (!selectedProject) return toast('Select a project', 'error');
    if (!startTime) return toast('Start time required', 'error');
    setSubmitting(true);
    try {
      const entry = await createEntry(token, {
        projectId: selectedProject.id,
        comment: comment || null,
        startTime: inputToUTC(startTime),
        endTime: endTime ? inputToUTC(endTime) : null,
      });
      setEntries(e => [entry, ...e]);
      setComment('');
      const now = toLocalInput(new Date(), tz);
      setStartTime(toLocalInput(new Date(entry.submittedAt), tz));
      setEndTime(now);
      toast('Entry logged');
    } catch {
      toast('Failed to log entry', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteEntry(id) {
    try {
      await deleteEntry(id);
      setEntries(e => e.filter(x => x.id !== id));
      toast('Entry deleted');
    } catch {
      toast('Failed to delete', 'error');
    }
  }

  async function handleCreateProject() {
    if (!newProjTitle.trim()) return;
    try {
      await createProject(token, {
        title: newProjTitle,
        parentId: newProjParent,
        color: newProjColor,
      });
      await refreshProjects();
      setShowNewProject(false);
      setNewProjTitle('');
      setNewProjParent(null);
    } catch {
      toast('Failed to create project', 'error');
    }
  }

  async function handleDeleteProject(id) {
    if (!confirm('Delete this project?')) return;
    try {
      await deleteProject(id);
      await refreshProjects();
      if (selectedProject?.id === id) setSelectedProject(null);
    } catch {
      toast('Failed to delete', 'error');
    }
  }

  async function handleToggleStar(project) {
    try {
      await updateProject(project.id, { starred: !project.starred });
      await refreshProjects();
    } catch {
      toast('Failed to update star', 'error');
    }
  }

  function handleToggleStarredOnly() {
    setShowStarredOnly((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(getStarredOnlyStorageKey(token), String(next));
      } catch {
        // Ignore storage errors and keep the in-memory toggle.
      }
      return next;
    });
  }

  async function handleAddTally() {
    if (!tallyProject) return;
    setTallySubmitting(true);
    try {
      await createEffortEntry(token, {
        projectId: tallyProject.id,
        comment: tallyComment.trim() || null,
        loggedAt: new Date().toISOString(),
      });
      const fromISO = new Date(rangeFrom + 'T00:00:00').toISOString();
      const toISO = new Date(rangeTo + 'T23:59:59').toISOString();
      await loadTallyCounts(fromISO, toISO);
      setTallyProject(null);
      setTallyComment('');
      toast('Tally logged');
    } catch {
      toast('Failed to log tally', 'error');
    } finally {
      setTallySubmitting(false);
    }
  }

  function findNodeWithContext(nodes, id, parent = null, siblings = nodes, index = -1) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === id) return { node, parent, siblings, index: i };
      if (node.children?.length) {
        const found = findNodeWithContext(node.children, id, node, node.children, i);
        if (found) return found;
      }
    }
    return null;
  }

  async function handleMoveProject(projectId, targetParentId, targetIndex) {
    try {
      await moveProject(projectId, { newParentId: targetParentId, newIndex: targetIndex });
      await refreshProjects();
    } catch {
      toast('Move failed', 'error');
    }
  }

  async function handleOutdentProject(projectId) {
    const ctx = findNodeWithContext(projects, projectId);
    if (!ctx || !ctx.parent) return;

    const parentCtx = findNodeWithContext(projects, ctx.parent.id);
    const newParentId = parentCtx?.parent ? parentCtx.parent.id : null;
    const newIndex = (parentCtx?.index ?? 0) + 1;

    try {
      await moveProject(projectId, { newParentId, newIndex });
      await refreshProjects();
    } catch {
      toast('Outdent failed', 'error');
    }
  }

  async function applyRange() {
    try {
      const fromISO = new Date(rangeFromInput + 'T00:00:00').toISOString();
      const toISO = new Date(rangeToInput + 'T23:59:59').toISOString();
      setRangeFrom(rangeFromInput);
      setRangeTo(rangeToInput);
      await loadTallyCounts(fromISO, toISO);
    } catch {
      toast('Failed to apply tally range', 'error');
    }
  }

  function handleViewChange(nextView) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'timelog');
    nextParams.set('timelogView', nextView);
    setSearchParams(nextParams);
  }

  if (loading) return <Loading />;

  const starredCount = flattenTree(projects).filter(project => project.starred).length;
  const visibleProjects = showStarredOnly ? filterToStarred(projects) : projects;

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-header" style={{ alignItems: 'flex-end' }}>
          <div>
            <span className="sidebar-title">Projects</span>
            <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 6 }}>
              Starred projects are the tally list. Tallies use the analytics date range below.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>From</label>
              <input type="date" value={rangeFromInput} onChange={e => setRangeFromInput(e.target.value)} style={{ width: 160 }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>To</label>
              <input type="date" value={rangeToInput} onChange={e => setRangeToInput(e.target.value)} style={{ width: 160 }} />
            </div>
            <button className="btn btn-secondary btn-sm" onClick={applyRange} style={{ height: 38 }}>Apply</button>
            <button
              className={`btn btn-secondary btn-sm ${showStarredOnly ? 'active-edit-btn' : ''}`}
              onClick={handleToggleStarredOnly}
              style={{ height: 38 }}
            >
              {showStarredOnly ? 'Showing starred' : 'Show starred only'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowNewProject(true)}>+ Add</button>
          </div>
        </div>
        {projects.length === 0 && (
          <div className="empty" style={{ padding: '12px 0' }}><p>No projects yet.</p></div>
        )}
        {projects.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
              {starredCount} starred {starredCount === 1 ? 'project' : 'projects'} in tally list
            </div>
            {showStarredOnly && visibleProjects.length === 0 && (
              <div className="empty" style={{ padding: '12px 0' }}><p>No starred projects yet.</p></div>
            )}
            <ProjectTree
              nodes={visibleProjects}
              selected={selectedProject}
              onSelect={setSelectedProject}
              onDelete={handleDeleteProject}
              onAddChild={(parentId) => { setNewProjParent(parentId); setShowNewProject(true); }}
              onMove={handleMoveProject}
              onOutdent={handleOutdentProject}
              onToggleStar={handleToggleStar}
              onAddTally={(project) => { setTallyProject(project); setTallyComment(''); }}
              tallyCounts={tallyCounts}
            />
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`nav-tab ${tab === 'log' ? 'active' : ''}`} onClick={() => handleViewChange('log')}>Log</button>
        <button className={`nav-tab ${tab === 'analytics' ? 'active' : ''}`} onClick={() => handleViewChange('analytics')}>Analytics</button>
      </div>

      {tab === 'log' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title" style={{ marginBottom: 14 }}>Log entry</div>

            {selectedProject ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: selectedProject.color || 'var(--accent)', flexShrink: 0 }} />
                <span style={{ fontWeight: 500 }}>{selectedProject.title}</span>
                <button className="btn-icon" onClick={() => setSelectedProject(null)}>✕</button>
              </div>
            ) : (
              <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 14 }}>Select a project from the list above.</p>
            )}

            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label>Start time ({tz})</label>
                <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="form-group">
                <label>End time (leave blank = open)</label>
                <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>What did you work on?</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Describe what you worked on…" style={{ minHeight: 60 }} />
            </div>
            <button className="btn btn-primary" onClick={handleSubmitEntry} disabled={submitting || !selectedProject}>
              {submitting ? 'Logging…' : 'Log entry'}
            </button>
          </div>

          <TimelogList entries={entries} tz={tz} onDelete={handleDeleteEntry} />
        </div>
      )}

      {tab === 'analytics' && (
        <TimelogAnalytics token={token} tz={tz} from={rangeFrom} to={rangeTo} />
      )}

      {showNewProject && (
        <Modal title="New project" onClose={() => setShowNewProject(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setShowNewProject(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateProject} disabled={!newProjTitle.trim()}>Create</button>
            </>
          }
        >
          <div className="form-group">
            <label>Project name</label>
            <input value={newProjTitle} onChange={e => setNewProjTitle(e.target.value)} autoFocus placeholder="e.g. Marketing" />
          </div>
          {newProjParent && (
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>
              Sub-project of: {flattenTree(projects).find(p => p.id === newProjParent)?.title || newProjParent}
            </div>
          )}
          <div className="form-group">
            <label>Color</label>
            <div className="color-picker-row">
              {COLORS.map(c => (
                <div
                  key={c}
                  className={`color-swatch ${newProjColor === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewProjColor(c)}
                />
              ))}
            </div>
          </div>
        </Modal>
      )}

      {tallyProject && (
        <Modal
          title={`Add tally: ${tallyProject.title}`}
          onClose={() => { if (!tallySubmitting) setTallyProject(null); }}
          actions={(
            <>
              <button className="btn btn-secondary" onClick={() => setTallyProject(null)} disabled={tallySubmitting}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddTally} disabled={tallySubmitting}>{tallySubmitting ? 'Adding…' : 'Add tally'}</button>
            </>
          )}
        >
          <div className="form-group">
            <label>Comment (optional)</label>
            <textarea
              value={tallyComment}
              onChange={e => setTallyComment(e.target.value)}
              placeholder="Add a note for this tally…"
              autoFocus
              style={{ minHeight: 80 }}
            />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            This logs 1 tally at the current date and time.
          </div>
        </Modal>
      )}
    </div>
  );
}
