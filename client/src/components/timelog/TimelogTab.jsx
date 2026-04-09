import { useState, useEffect } from 'react';
import { getUserProjects, createProject, deleteProject, updateProject } from '../../api/projects.js';
import { getTimelog, getLastEntry, createEntry, deleteEntry, getAnalytics } from '../../api/timelog.js';
import { useToast } from '../common/Toast.jsx';
import Loading from '../common/Loading.jsx';
import Modal from '../common/Modal.jsx';
import ProjectTree from './ProjectTree.jsx';
import TimelogList from './TimelogList.jsx';
import TimelogAnalytics from './TimelogAnalytics.jsx';

const EST_TZ = 'America/New_York';
const COLORS = ['#6c63ff','#4a9eff','#4caf7d','#f5a623','#f06565','#a78bfa','#ff6b9d','#00c9a7'];

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

export default function TimelogTab({ token, user }) {
  const toast = useToast();
  const tz = user.timezone || EST_TZ;

  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('log'); // log | analytics

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

  useEffect(() => {
    loadAll();
  }, [token]);

  async function loadAll() {
    setLoading(true);
    try {
      const [projs, ents, last] = await Promise.all([
        getUserProjects(token),
        getTimelog(token),
        getLastEntry(token),
      ]);
      setProjects(projs);
      setEntries(ents);
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
      const proj = await createProject(token, {
        title: newProjTitle,
        parentId: newProjParent,
        color: newProjColor,
      });
      const flat = flattenTree(projects);
      // Reload tree
      const projs = await getUserProjects(token);
      setProjects(projs);
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
      const projs = await getUserProjects(token);
      setProjects(projs);
      if (selectedProject?.id === id) setSelectedProject(null);
    } catch {
      toast('Failed to delete', 'error');
    }
  }

  function flattenTree(nodes, arr = []) {
    nodes.forEach(n => { arr.push(n); if (n.children) flattenTree(n.children, arr); });
    return arr;
  }

  if (loading) return <Loading />;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`nav-tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>Log</button>
        <button className={`nav-tab ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}>Analytics</button>
      </div>

      {tab === 'log' && (
        <div className="two-col">
          {/* Projects sidebar */}
          <div className="card">
            <div className="section-header">
              <span className="sidebar-title">Projects</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewProject(true)}>+ Add</button>
            </div>
            {projects.length === 0 && (
              <div className="empty" style={{ padding: '12px 0' }}><p>No projects yet.</p></div>
            )}
            <ProjectTree
              nodes={projects}
              selected={selectedProject}
              onSelect={setSelectedProject}
              onDelete={handleDeleteProject}
              onAddChild={(parentId) => { setNewProjParent(parentId); setShowNewProject(true); }}
            />
          </div>

          {/* Log form + entries */}
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
                <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 14 }}>← Select a project</p>
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
        </div>
      )}

      {tab === 'analytics' && (
        <TimelogAnalytics token={token} tz={tz} />
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
    </div>
  );
}
