import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getUserProjects, createProject, createProjectsFromTemplate, deleteProject, moveProject, updateProject } from '../../api/projects.js';
import { getTimelog, getLastEntry, createEntry, updateEntry, deleteEntry } from '../../api/timelog.js';
import { createEffortEntry, getEffortAnalytics } from '../../api/effort.js';
import { getTemplates } from '../../api/templates.js';
import { useToast } from '../common/Toast.jsx';
import Loading from '../common/Loading.jsx';
import Modal from '../common/Modal.jsx';
import ProjectTree from './ProjectTree.jsx';
import TimelogList from './TimelogList.jsx';
import TimelogAnalytics from './TimelogAnalytics.jsx';

const EST_TZ = 'America/New_York';
const COLORS = ['#6c63ff','#4a9eff','#4caf7d','#f5a623','#f06565','#a78bfa','#ff6b9d','#00c9a7'];

function todayStr() {
  return formatLocalDate(new Date());
}

function weekAgoStr() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return formatLocalDate(date);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function getLatestSubmittedEntry(entries) {
  if (!entries?.length) return null;
  return entries.reduce((latest, entry) => {
    if (!latest) return entry;
    return new Date(entry.submittedAt) > new Date(latest.submittedAt) ? entry : latest;
  }, null);
}

function formatDurationLabel(start, end) {
  if (!start || Number.isNaN(start.getTime())) return '';
  if (!end || Number.isNaN(end.getTime())) return '';
  const mins = Math.floor((end - start) / 60000);
  if (mins < 0) return 'End time is before start time';
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;
}

function getStarredOnlyStorageKey(token) {
  return `scorecard.timelog.starredOnly.${token}`;
}

function filterToStarred(nodes) {
  const filtered = [];
  for (const node of nodes) {
    const filteredChildren = filterToStarred(node.children || []);
    if (node.starred) {
      filtered.push({ ...node, children: filteredChildren });
      continue;
    }

    filtered.push(...filteredChildren);
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
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [timelogTemplates, setTimelogTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState(null);
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
  const [collapsedNodeIds, setCollapsedNodeIds] = useState(new Set());

  const requestedView = searchParams.get('timelogView');
  const tab = requestedView === 'analytics' ? 'analytics' : 'log';

  function syncLogFormTimes(sourceEntries, fallbackLastEntry = null) {
    const latest = getLatestSubmittedEntry(sourceEntries) || fallbackLastEntry;
    const now = toLocalInput(new Date(), tz);
    setEndTime(now);
    if (latest) {
      setStartTime(toLocalInput(new Date(latest.endTime || latest.submittedAt), tz));
    } else {
      setStartTime(now);
    }
  }

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
    const starredOnlyParam = searchParams.get('starredOnly');
    if (starredOnlyParam !== null) {
      const val = starredOnlyParam === 'true';
      setShowStarredOnly(val);
      try { localStorage.setItem(getStarredOnlyStorageKey(token), val ? 'true' : 'false'); } catch {}
    }
  }, [searchParams, token]);

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
      syncLogFormTimes(ents, last);
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
    if (endTime && new Date(endTime) < new Date(startTime)) return toast('End time cannot be before start time', 'error');
    setSubmitting(true);
    try {
      const entry = await createEntry(token, {
        projectId: selectedProject.id,
        comment: comment || null,
        startTime: inputToUTC(startTime),
        endTime: endTime ? inputToUTC(endTime) : null,
      });
      const nextEntries = [entry, ...entries];
      setEntries(nextEntries);
      setComment('');
      syncLogFormTimes(nextEntries);
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
      const nextEntries = entries.filter((x) => x.id !== id);
      setEntries(nextEntries);
      syncLogFormTimes(nextEntries);
      toast('Entry deleted');
    } catch {
      toast('Failed to delete', 'error');
    }
  }

  async function handleUpdateEntry(id, data) {
    try {
      const updated = await updateEntry(id, data);
      const nextEntries = entries.map((entry) => (entry.id === id ? updated : entry));
      setEntries(nextEntries);
      syncLogFormTimes(nextEntries);
      toast('Entry updated');
      return true;
    } catch {
      toast('Failed to update entry', 'error');
      return false;
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
      setShowStarredOnly(false);
      try {
        localStorage.setItem(getStarredOnlyStorageKey(token), 'false');
      } catch {
        // Ignore storage errors
      }
      setShowNewProject(false);
      setNewProjTitle('');
      setNewProjParent(null);
    } catch {
      toast('Failed to create project', 'error');
    }
  }

  async function openTemplatePicker() {
    setShowTemplatePicker(true);
    if (timelogTemplates.length > 0 || loadingTemplates) return;

    setLoadingTemplates(true);
    try {
      const templates = await getTemplates();
      setTimelogTemplates(templates.filter((template) => template.type === 'TIMELOG'));
    } catch {
      toast('Failed to load project sets', 'error');
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function handleApplyTemplate(template) {
    setApplyingTemplateId(template.id);
    try {
      await createProjectsFromTemplate(token, template.id);
      await refreshProjects();
      setShowStarredOnly(false);
      try {
        localStorage.setItem(getStarredOnlyStorageKey(token), 'false');
      } catch {
        // Ignore storage errors
      }
      setShowTemplatePicker(false);
      toast(`Applied ${template.title}`);
    } catch (error) {
      toast(error?.response?.data?.error || 'Failed to apply project set', 'error');
    } finally {
      setApplyingTemplateId(null);
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

  async function handleRenameProject(id, title) {
    try {
      await updateProject(id, { title });
      await refreshProjects();
    } catch {
      toast('Failed to rename project', 'error');
    }
  }

  function handleToggleStarredOnly() {
    setShowStarredOnly((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(getStarredOnlyStorageKey(token), String(next));
      } catch {}
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('starredOnly', next ? 'true' : 'false');
      setSearchParams(nextParams, { replace: true });
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

  async function applyTodayRange() {
    try {
      const today = todayStr();
      const fromISO = new Date(today + 'T00:00:00').toISOString();
      const toISO = new Date(today + 'T23:59:59').toISOString();
      setRangeFromInput(today);
      setRangeToInput(today);
      setRangeFrom(today);
      setRangeTo(today);
      await loadTallyCounts(fromISO, toISO);
    } catch {
      toast('Failed to set today range', 'error');
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
  const previewStart = startTime ? new Date(startTime) : null;
  const previewEnd = endTime ? new Date(endTime) : new Date();
  const durationPreview = formatDurationLabel(previewStart, previewEnd);
  const showOpenDuration = Boolean(startTime) && !endTime && durationPreview && !durationPreview.startsWith('End time');

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="sidebar-title" style={{ margin: 0, marginBottom: 16 }}>Projects</div>
        <div style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16 }}>
          Starred projects are the tally list. Tallies use the analytics date range below.
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>From</label>
                <input type="date" value={rangeFromInput} onChange={e => setRangeFromInput(e.target.value)} style={{ width: 160 }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>To</label>
                <input type="date" value={rangeToInput} onChange={e => setRangeToInput(e.target.value)} style={{ width: 160 }} />
              </div>
              <button className="btn btn-secondary btn-sm" onClick={applyRange} style={{ height: 38 }}>Apply</button>
              <button className="btn btn-secondary btn-sm" onClick={applyTodayRange} style={{ height: 38 }}>Today</button>
              <button
                className={`btn btn-secondary btn-sm ${showStarredOnly ? 'active-edit-btn' : ''}`}
                onClick={handleToggleStarredOnly}
                style={{ height: 38 }}
              >
                {showStarredOnly ? 'Showing starred' : 'Show starred only'}
              </button>
              {flattenTree(projects).some(x => x.parentId) && (
                <>
                  <button className="btn btn-secondary btn-sm" style={{ height: 38 }} onClick={() => setCollapsedNodeIds(new Set())}>Expand all</button>
                  <button className="btn btn-secondary btn-sm" style={{ height: 38 }} onClick={() => {
                    const parentIds = new Set(flattenTree(projects).map(p => p.parentId).filter(Boolean));
                    setCollapsedNodeIds(parentIds);
                  }}>Collapse all</button>
                </>
              )}
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
                  onRename={handleRenameProject}
                  tallyCounts={tallyCounts}
                  collapsedNodeIds={collapsedNodeIds}
                  setCollapsedNodeIds={setCollapsedNodeIds}
                />
              </>
            )}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => setShowNewProject(true)}>+ Add</button>
            <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={openTemplatePicker}>Templates</button>
          </div>
        </div>
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
            {durationPreview && (
              <div style={{ marginBottom: 12, fontSize: 13, color: durationPreview.startsWith('End time') ? 'var(--red)' : 'var(--text2)' }}>
                Duration preview: {durationPreview}{showOpenDuration ? ' (so far)' : ''}
              </div>
            )}
            <div className="form-group">
              <label>What did you work on?</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Describe what you worked on…" style={{ minHeight: 60 }} />
            </div>
            <button className="btn btn-primary" onClick={handleSubmitEntry} disabled={submitting || !selectedProject}>
              {submitting ? 'Logging…' : 'Log entry'}
            </button>
          </div>

          <TimelogList entries={entries} tz={tz} onDelete={handleDeleteEntry} onUpdate={handleUpdateEntry} />
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

      {showTemplatePicker && (
        <Modal
          title="Project set templates"
          onClose={() => !applyingTemplateId && setShowTemplatePicker(false)}
          actions={(
            <button className="btn btn-secondary" onClick={() => setShowTemplatePicker(false)} disabled={Boolean(applyingTemplateId)}>
              Close
            </button>
          )}
        >
          {loadingTemplates ? (
            <p style={{ color: 'var(--text3)' }}>Loading templates…</p>
          ) : timelogTemplates.length === 0 ? (
            <p style={{ color: 'var(--text3)' }}>No timelog project sets are available yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {timelogTemplates.map((template) => (
                <div key={template.id} className="card" style={{ padding: 14, margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{template.title}</div>
                      {template.description && (
                        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{template.description}</div>
                      )}
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleApplyTemplate(template)}
                      disabled={applyingTemplateId === template.id}
                    >
                      {applyingTemplateId === template.id ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
