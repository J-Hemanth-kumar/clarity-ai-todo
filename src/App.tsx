import { useCallback, useEffect, useMemo, useState, useRef, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Coffee, Columns3, Lightbulb, ListTodo, LoaderCircle, Milestone, Plus,
  Search, Sparkles, Square, Trash2, WandSparkles, X,
} from 'lucide-react';
import { api } from './api';
import type { Priority, PrioritySuggestion, Status, Task } from './types';

type View = 'all' | 'todo' | 'in_progress' | 'done';
type Page = 'board' | 'timeline';
type Notice = { message: string; tone: 'success' | 'error' } | null;
type Modal = 'improve' | 'breakdown' | 'plan' | null;

const priorityLabel: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState<Page>('board');
  const [mobileStatus, setMobileStatus] = useState<View>('all');
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);
  const [search, setSearch] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] = useState<Priority>('medium');
  const [quickDueDate, setQuickDueDate] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [activeModal, setActiveModal] = useState<Modal>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [newSubtasks, setNewSubtasks] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      setLoadError('');
      const nextTasks = await api.getTasks();
      setTasks(nextTasks);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(() => ({
    all: tasks.length,
    todo: tasks.filter((task) => task.status === 'todo').length,
    in_progress: tasks.filter((task) => task.status === 'in_progress').length,
    done: tasks.filter((task) => task.status === 'done').length,
  }), [tasks]);

  const visibleTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((task) => !term || `${task.title} ${task.description}`.toLowerCase().includes(term));
  }, [tasks, search]);

  const mobileVisibleTasks = useMemo(() => mobileStatus === 'all'
    ? visibleTasks
    : visibleTasks.filter((task) => task.status === mobileStatus), [visibleTasks, mobileStatus]);

  const timelineTasks = useMemo(() => [...visibleTasks].sort(
    (a, b) => timelineTimestamp(a) - timelineTimestamp(b),
  ), [visibleTasks]);

  const progress = tasks.length ? Math.round((counts.done / tasks.length) * 100) : 0;

  const showNotice = (message: string, tone: 'success' | 'error' = 'success') => setNotice({ message, tone });

  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!quickTitle.trim() || addingTask) return;
    setAddingTask(true);
    try {
      const task = await api.createTask({ title: quickTitle.trim(), priority: quickPriority, dueDate: quickDueDate || null });
      setTasks((current) => [task, ...current]);
      setQuickTitle('');
      setQuickDueDate('');
      setQuickPriority('medium');
      setMobileStatus('all');
      setPage('board');
      showNotice('Task added to your list');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not add task', 'error');
    } finally {
      setAddingTask(false);
    }
  };

  const patchTask = async (id: string, patch: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'dueDate'>>) => {
    try {
      const updated = await api.updateTask(id, patch);
      setTasks((current) => current.map((task) => task.id === id ? updated : task));
      return updated;
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not update task', 'error');
      return undefined;
    }
  };

  const toggleDone = async (task: Task) => {
    const status: Status = task.status === 'done' ? 'todo' : 'done';
    await patchTask(task.id, { status });
  };

  const deleteTask = async (task: Task) => {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    try {
      await api.deleteTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      showNotice('Task deleted');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not delete task', 'error');
    }
  };

  const toggleExpanded = (id: string) => setExpandedTasks((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const addSubtask = async (task: Task) => {
    const value = (newSubtasks[task.id] || '').trim();
    if (!value) return;
    try {
      const subtask = await api.addSubtask(task.id, value);
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, subtasks: [...item.subtasks, subtask] } : item));
      setNewSubtasks((current) => ({ ...current, [task.id]: '' }));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not add subtask', 'error');
    }
  };

  const toggleSubtask = async (task: Task, subtaskId: string, checked: boolean) => {
    try {
      const updated = await api.toggleSubtask(subtaskId, checked);
      setTasks((current) => current.map((item) => item.id === task.id ? {
        ...item, subtasks: item.subtasks.map((subtask) => subtask.id === subtaskId ? updated : subtask),
      } : item));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not update subtask', 'error');
    }
  };

  const removeSubtask = async (task: Task, subtaskId: string) => {
    try {
      await api.deleteSubtask(subtaskId);
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, subtasks: item.subtasks.filter((subtask) => subtask.id !== subtaskId) } : item));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not remove subtask', 'error');
    }
  };

  const openModal = (kind: Exclude<Modal, null>, task?: Task) => {
    setActiveTask(task ?? null);
    setActiveModal(kind);
  };

  const applyPlan = async (suggestions: PrioritySuggestion[]) => {
    const results = await Promise.allSettled(suggestions.map((item) => api.updateTask(item.taskId, { priority: item.priority })));
    const succeeded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    setTasks((current) => current.map((task) => succeeded.find((item) => item.id === task.id) ?? task));
    if (succeeded.length !== suggestions.length) {
      showNotice(`Updated ${succeeded.length} of ${suggestions.length} priorities. Failed updates were left unchanged.`, 'error');
      return;
    }
    setActiveModal(null);
    showNotice(`Updated priorities for ${succeeded.length} ${succeeded.length === 1 ? 'task' : 'tasks'}`);
  };

  const renderTaskCard = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      expanded={expandedTasks.has(task.id)}
      newSubtask={newSubtasks[task.id] || ''}
      onExpand={() => toggleExpanded(task.id)}
      onToggle={() => void toggleDone(task)}
      onStatus={(status) => void patchTask(task.id, { status })}
      onImprove={() => openModal('improve', task)}
      onBreakdown={() => openModal('breakdown', task)}
      onDelete={() => void deleteTask(task)}
      onNewSubtask={(value) => setNewSubtasks((current) => ({ ...current, [task.id]: value }))}
      onAddSubtask={() => void addSubtask(task)}
      onToggleSubtask={(id, checked) => void toggleSubtask(task, id, checked)}
      onDeleteSubtask={(id) => void removeSubtask(task, id)}
    />
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark"><ListTodo size={20} strokeWidth={2.4} /></div><span>clarity<span className="brand-dot">.</span></span></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace pages">
          <button className={`nav-item ${page === 'board' ? 'active' : ''}`} onClick={() => setPage('board')}><Columns3 size={17} /><span>Task board</span><span className="nav-count">{counts.all}</span></button>
          <button className={`nav-item ${page === 'timeline' ? 'active' : ''}`} onClick={() => setPage('timeline')}><Milestone size={17} /><span>Timeline</span><span className="nav-count">{counts.in_progress + counts.todo}</span></button>
        </nav>
        <div className="sidebar-status-summary">
          <div><span className="summary-dot todo-dot" />To do<strong>{counts.todo}</strong></div>
          <div><span className="summary-dot progress-dot" />In progress<strong>{counts.in_progress}</strong></div>
          <div><span className="summary-dot done-dot" />Done<strong>{counts.done}</strong></div>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><Lightbulb size={16} /></div><p>Small steps add up.</p><span>One thing at a time is still progress.</span></div>
          <div className="profile-row"><div className="avatar">Y</div><div className="profile-copy"><strong>Your workspace</strong><span>Personal planner</span></div><ChevronDown size={15} className="muted-icon" /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><div className="mobile-brand"><div className="brand-mark"><ListTodo size={17} /></div><strong>clarity<span className="brand-dot">.</span></strong></div><span className="desktop-crumb">Workspace</span><ChevronRight className="desktop-crumb" size={14} /><strong>{page === 'board' ? 'Task board' : 'Timeline'}</strong></div>
          <div className="top-actions"><MiniCalendar /><span className="top-divider" /><span className="status-dot" /> <span className="status-text">All changes saved</span></div>
        </header>

        <div className="content-wrap">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">YOUR PERSONAL SPACE</div>
              <h1>{page === 'board' ? <>Make room for <em>what matters.</em></> : <>Every step, <em>in view.</em></>}</h1>
              <p className="welcome-subtitle">{page === 'board' ? 'A little structure, a lot more headspace.' : 'A calm overview of what is coming up and what you have finished.'}</p>
            </div>
            <div className="progress-card"><div className="progress-heading"><span>YOUR PROGRESS</span><strong>{progress}%</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div><div className="progress-foot"><span>{counts.done} of {tasks.length} tasks complete</span><span>{tasks.length - counts.done} left to go</span></div></div>
          </section>

          <section className="quick-add-card">
            <div className="quick-add-icon"><Plus size={19} /></div>
            <form onSubmit={createTask} className="quick-add-form">
              <input aria-label="New task title" placeholder="What needs your attention?" value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} maxLength={180} />
              <div className="quick-add-options"><select aria-label="Task priority" value={quickPriority} onChange={(event) => setQuickPriority(event.target.value as Priority)}><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select><input aria-label="Due date" type="date" value={quickDueDate} onChange={(event) => setQuickDueDate(event.target.value)} /><button type="submit" disabled={!quickTitle.trim() || addingTask}>{addingTask ? <LoaderCircle className="spin" size={15} /> : <Plus size={16} />} Add task</button></div>
            </form>
          </section>

          {page === 'board' ? (
            <section className="task-section board-section">
              <div className="task-section-head">
                <div><div className="section-overline">THE OVERVIEW</div><h2>Your task board <span className="heading-count">{visibleTasks.length}</span></h2><p className="section-description">Move each task forward, one column at a time.</p></div>
                <div className="section-actions"><div className="search-box"><Search size={16} /><input aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>/</kbd></div><button className="ai-plan-button" onClick={() => openModal('plan')} disabled={tasks.every((task) => task.status === 'done')}><Sparkles size={16} /> Plan my day <span className="button-sheen" /></button></div>
              </div>
              {loading ? <div className="state-panel"><LoaderCircle size={22} className="spin" /><strong>Getting your tasks ready</strong><span>Just a moment…</span></div> : loadError ? <div className="state-panel error-state"><div className="state-icon"><X size={20} /></div><strong>We couldn't load your tasks</strong><span>{loadError}</span><button className="secondary-button" onClick={() => { setLoading(true); void refresh(); }}>Try again</button></div> : visibleTasks.length === 0 ? <div className="empty-state"><div className="empty-art"><div className="empty-sun" /><div className="empty-note"><Check size={22} /></div><div className="empty-sparkle">✦</div></div><h3>{search ? 'No matching tasks' : 'A clean slate.'}</h3><p>{search ? 'Try another keyword or clear your search.' : 'Add one small task above and build a little momentum.'}</p>{search && <button className="text-button" onClick={() => setSearch('')}>Clear search</button>}</div> : (
                <>
                  <div className="kanban-board">
                    {(['todo', 'in_progress', 'done'] as Status[]).map((status) => {
                      const columnTasks = visibleTasks.filter((task) => task.status === status);
                      const title = status === 'todo' ? 'To do' : status === 'in_progress' ? 'In progress' : 'Done';
                      return <section className={`kanban-column column-${status} ${dragOverStatus === status ? 'drag-over' : ''}`} key={status}>
                        <div className="kanban-column-head"><div className="kanban-column-title"><span className={`column-status-dot ${status}`} /><h3>{title}</h3><span className="column-count">{columnTasks.length}</span></div><span className="column-caption">{status === 'todo' ? 'Ready when you are' : status === 'in_progress' ? 'Currently moving' : 'Nicely wrapped up'}</span></div>
                        <div className="kanban-card-list" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverStatus(status); }} onDrop={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData('text/plain'); const dragged = tasks.find((task) => task.id === taskId); setDragOverStatus(null); if (dragged && dragged.status !== status) void patchTask(taskId, { status }); }}>{columnTasks.length ? columnTasks.map((task) => <div className="kanban-drag-wrapper" key={task.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id); }} onDragEnd={() => setDragOverStatus(null)}>{renderTaskCard(task)}</div>) : <div className="column-empty">{status === 'todo' ? 'Nothing waiting here.' : status === 'in_progress' ? 'No active tasks.' : 'Completed tasks land here.'}</div>}</div>
                      </section>;
                    })}
                  </div>
                  <div className="mobile-task-list">
                    <div className="mobile-status-tabs" role="tablist" aria-label="Filter tasks by status">
                      {([{ value: 'all', label: 'All', count: counts.all }, { value: 'todo', label: 'To do', count: counts.todo }, { value: 'in_progress', label: 'Doing', count: counts.in_progress }, { value: 'done', label: 'Done', count: counts.done }] as const).map((tab) => <button key={tab.value} role="tab" aria-selected={mobileStatus === tab.value} className={mobileStatus === tab.value ? 'selected' : ''} onClick={() => setMobileStatus(tab.value)}>{tab.label}<span>{tab.count}</span></button>)}
                    </div>
                    {mobileVisibleTasks.length ? <div className="task-list">{mobileVisibleTasks.map(renderTaskCard)}</div> : <div className="mobile-empty">No tasks in this view yet.</div>}
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className="task-section timeline-section">
              <div className="task-section-head">
                <div><div className="section-overline">YOUR WORK, OVER TIME</div><h2>Task timeline <span className="heading-count">{visibleTasks.length}</span></h2><p className="section-description">Upcoming work, active tasks and completed wins in one view.</p></div>
                <div className="section-actions"><div className="search-box"><Search size={16} /><input aria-label="Search timeline" placeholder="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>/</kbd></div><button className="ai-plan-button" onClick={() => openModal('plan')} disabled={tasks.every((task) => task.status === 'done')}><Sparkles size={16} /> Plan my day <span className="button-sheen" /></button></div>
              </div>
              <div className="timeline-summary"><div className="timeline-summary-item"><span className="summary-dot todo-dot"/><span>To do</span><strong>{counts.todo}</strong></div><div className="timeline-summary-item"><span className="summary-dot progress-dot"/><span>In progress</span><strong>{counts.in_progress}</strong></div><div className="timeline-summary-item"><span className="summary-dot done-dot"/><span>Done</span><strong>{counts.done}</strong></div></div>
              {loading ? <div className="state-panel"><LoaderCircle size={22} className="spin" /><strong>Getting your timeline ready</strong><span>Just a moment…</span></div> : loadError ? <div className="state-panel error-state"><div className="state-icon"><X size={20} /></div><strong>We couldn't load your timeline</strong><span>{loadError}</span><button className="secondary-button" onClick={() => { setLoading(true); void refresh(); }}>Try again</button></div> : timelineTasks.length ? <TimelineView tasks={timelineTasks} onStatus={(id, status) => void patchTask(id, { status })} /> : <div className="empty-state"><div className="empty-art"><div className="empty-sun" /><div className="empty-note"><Check size={22} /></div><div className="empty-sparkle">✦</div></div><h3>{search ? 'No matching moments' : 'Your timeline starts here.'}</h3><p>{search ? 'Try another keyword or clear your search.' : 'Add a task and your upcoming work will appear here.'}</p>{search && <button className="text-button" onClick={() => setSearch('')}>Clear search</button>}</div>}
            </section>
          )}
          <footer className="page-footer"><span><Coffee size={14} /> Take a breath. You're doing fine.</span><span>Clarity helps you focus on the next step.</span></footer>
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Main navigation">
        <button className={page === 'board' ? 'active' : ''} onClick={() => setPage('board')}><Columns3 size={18}/><span>Board</span></button>
        <button className={page === 'timeline' ? 'active' : ''} onClick={() => setPage('timeline')}><Milestone size={18}/><span>Timeline</span></button>
        <button onClick={() => { setPage('board'); document.querySelector<HTMLInputElement>('.quick-add-form > input')?.focus(); }}><Plus size={18}/><span>Add task</span></button>
      </nav>

      {activeModal === 'improve' && activeTask && <ImproveModal task={activeTask} onClose={() => setActiveModal(null)} onSave={async (title, description, priority, dueDate) => { const result = await patchTask(activeTask.id, { title, description, priority, dueDate }); if (result) { setActiveModal(null); showNotice('Task details updated'); } }} />}
      {activeModal === 'breakdown' && activeTask && <BreakdownModal task={activeTask} onClose={() => setActiveModal(null)} onSave={async (subtasks) => { try { await api.addSubtasks(activeTask.id, subtasks); await refresh(); setExpandedTasks((current) => new Set(current).add(activeTask.id)); setActiveModal(null); showNotice('Subtasks added'); } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not save subtasks', 'error'); } }} />}
      {activeModal === 'plan' && <PlanModal tasks={tasks} onClose={() => setActiveModal(null)} onApply={applyPlan} />}
      {notice && <div className={`toast ${notice.tone}`}><span className="toast-dot" />{notice.message}<button onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={15} /></button></div>}
    </div>
  );
}

function TaskCard({ task, expanded, newSubtask, onExpand, onToggle, onStatus, onImprove, onBreakdown, onDelete, onNewSubtask, onAddSubtask, onToggleSubtask, onDeleteSubtask }: {
  task: Task; expanded: boolean; newSubtask: string; onExpand: () => void; onToggle: () => void;
  onStatus: (status: Status) => void; onImprove: () => void; onBreakdown: () => void; onDelete: () => void;
  onNewSubtask: (value: string) => void; onAddSubtask: () => void; onToggleSubtask: (id: string, checked: boolean) => void; onDeleteSubtask: (id: string) => void;
}) {
  const completeSubtasks = task.subtasks.filter((subtask) => subtask.isCompleted).length;
  const due = task.dueDate ? new Date(`${task.dueDate}T00:00:00`) : null;
  const overdue = Boolean(due && due < new Date(new Date().toDateString()) && task.status !== 'done');
  return (
    <article className={`task-card ${task.status === 'done' ? 'is-done' : ''}`}>
      <div className="task-card-main">
        <button className={`task-check ${task.status === 'done' ? 'checked' : ''}`} onClick={onToggle} aria-label={task.status === 'done' ? 'Mark task as not done' : 'Mark task as done'}>{task.status === 'done' ? <Check size={15} /> : <span />}</button>
        <div className="task-copy"><button className="task-title-button" onClick={onExpand}>{task.title}</button>{task.description && <p className="task-description">{task.description}</p>}<div className="task-meta"><span className={`priority-chip ${task.priority}`}><span />{priorityLabel[task.priority]}</span>{due && <span className={`due-date ${overdue ? 'overdue' : ''}`}><CalendarDays size={13} />{overdue ? 'Overdue · ' : ''}{due.toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>}{task.subtasks.length > 0 && <button className="subtask-progress" onClick={onExpand}><Square size={12} />{completeSubtasks}/{task.subtasks.length} steps</button>}</div></div>
        <div className="task-controls"><select aria-label={`Status for ${task.title}`} className={`status-select ${task.status}`} value={task.status} onChange={(event) => onStatus(event.target.value as Status)}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select><div className="task-actions"><button onClick={onImprove} title="Improve writing" aria-label="Improve task writing"><WandSparkles size={15} /></button><button onClick={onBreakdown} title="Break into steps" aria-label="Break task into subtasks"><ListTodo size={15} /></button><button onClick={onDelete} title="Delete task" aria-label="Delete task"><Trash2 size={15} /></button></div><button className="expand-button" onClick={onExpand} aria-label={expanded ? 'Collapse subtasks' : 'Expand subtasks'}>{expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button></div>
      </div>
      {expanded && <div className="subtasks-panel"><div className="subtasks-heading"><span>STEPS</span><span>{completeSubtasks} of {task.subtasks.length} complete</span></div>{task.subtasks.map((subtask) => <div className={`subtask-row ${subtask.isCompleted ? 'completed' : ''}`} key={subtask.id}><button className={`subtask-check ${subtask.isCompleted ? 'checked' : ''}`} onClick={() => onToggleSubtask(subtask.id, !subtask.isCompleted)} aria-label={subtask.isCompleted ? 'Mark subtask incomplete' : 'Complete subtask'}>{subtask.isCompleted && <Check size={11} />}</button><span>{subtask.title}</span><button className="subtask-delete" onClick={() => onDeleteSubtask(subtask.id)} aria-label="Delete subtask"><X size={13} /></button></div>)}<form className="subtask-add" onSubmit={(event) => { event.preventDefault(); onAddSubtask(); }}><Plus size={14} /><input placeholder="Add a step" value={newSubtask} onChange={(event) => onNewSubtask(event.target.value)} /><button type="submit" disabled={!newSubtask.trim()}>Add</button></form></div>}
    </article>
  );
}


function timelineTimestamp(task: Task): number {
  const source = task.status === 'done' && task.completedAt
    ? task.completedAt
    : task.dueDate
      ? `${task.dueDate}T12:00:00`
      : task.createdAt;
  const timestamp = new Date(source).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayHeading(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return 'Today';
  if (dayKey(date) === dayKey(tomorrow)) return 'Tomorrow';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

function TimelineView({ tasks, onStatus }: { tasks: Task[]; onStatus: (id: string, status: Status) => void }) {
  const groups = useMemo(() => {
    const grouped = new Map<string, { date: Date; tasks: Task[] }>();
    tasks.forEach((task) => {
      const date = new Date(timelineTimestamp(task));
      const key = dayKey(date);
      const group = grouped.get(key) ?? { date, tasks: [] };
      group.tasks.push(task);
      grouped.set(key, group);
    });
    return [...grouped.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [tasks]);

  return <div className="timeline-list">
    {groups.map((group) => <section className="timeline-day" key={dayKey(group.date)}>
      <div className="timeline-date-rail"><span className="timeline-date-dot"/><div><strong>{dayHeading(group.date)}</strong><span>{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(group.date)}</span></div></div>
      <div className="timeline-day-items">{group.tasks.map((task) => {
        const isCompleted = task.status === 'done';
        const isDue = task.status !== 'done' && Boolean(task.dueDate);
        const completeSteps = task.subtasks.filter((item) => item.isCompleted).length;
        return <article className={`timeline-item timeline-${task.status}`} key={task.id}>
          <span className={`timeline-marker ${task.status}`} />
          <div className="timeline-item-body">
            <div className="timeline-item-top"><span className={`timeline-status ${task.status}`}>{task.status === 'todo' ? 'To do' : task.status === 'in_progress' ? 'In progress' : 'Done'}</span><span className="timeline-event-label">{isCompleted ? 'Completed' : isDue ? 'Due date' : 'Added to your list'}</span></div>
            <h3>{task.title}</h3>
            {task.description && <p>{task.description}</p>}
            <div className="timeline-item-foot"><span className={`priority-chip ${task.priority}`}><span/>{priorityLabel[task.priority]} priority</span>{task.subtasks.length > 0 && <span className="timeline-step-count"><CheckCircle2 size={13}/>{completeSteps}/{task.subtasks.length} steps</span>}<select aria-label={`Change status for ${task.title}`} className={`status-select ${task.status}`} value={task.status} onChange={(event) => onStatus(task.id, event.target.value as Status)}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></div>
          </div>
        </article>;
      })}</div>
    </section>)}
  </div>;
}

function MiniCalendar() {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => new Date());
  const today = new Date();
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(month);
  const selectedLabel = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(selected);

  return <div className="mini-calendar-wrap">
    <button className="calendar-trigger" aria-expanded={open} aria-label="Open calendar" onClick={() => setOpen((value) => !value)}><CalendarDays size={16}/><span>{selectedLabel}</span><ChevronDown size={13}/></button>
    {open && <div className="calendar-popover" role="dialog" aria-label="Calendar">
      <div className="calendar-popover-head"><button aria-label="Previous month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}><ChevronLeft size={16}/></button><strong>{monthLabel}</strong><button aria-label="Next month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}><ChevronRight size={16}/></button></div>
      <div className="calendar-grid calendar-weekdays">{['Su','Mo','Tu','We','Th','Fr','Sa'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{Array.from({ length: firstDay }, (_, index) => <span className="calendar-blank" key={`blank-${index}`}/>)}{Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
        const isToday = dayKey(date) === dayKey(today);
        const isSelected = dayKey(date) === dayKey(selected);
        return <button key={index + 1} className={`${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`} aria-label={date.toDateString()} onClick={() => { setSelected(date); setOpen(false); }}>{index + 1}</button>;
      })}</div>
      <div className="calendar-popover-foot"><span><i/> Today</span><button onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today); }}>Go to today</button></div>
    </div>}
  </div>;
}

function ModalFrame({ title, eyebrow, onClose, children, footer }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-card" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><div className="modal-eyebrow">{eyebrow}</div><h3>{title}</h3></div><button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button></div><div className="modal-content">{children}</div>{footer && <div className="modal-footer">{footer}</div>}</div></div>;
}

function ImproveModal({ task, onClose, onSave }: { task: Task; onClose: () => void; onSave: (title: string, description: string, priority: Priority, dueDate: string | null) => Promise<void> }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggested, setSuggested] = useState(false);
  const improve = async () => {
    setLoading(true); setError('');
    try { const result = await api.improve(title, description); setTitle(result.title); setDescription(result.description); setSuggested(true); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'AI suggestion unavailable. You can still edit and save manually.'); }
    finally { setLoading(false); }
  };
  return <ModalFrame title="Edit task details" eyebrow="TASK EDITOR + AI WRITING" onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!title.trim()} onClick={() => void onSave(title.trim(), description, priority, dueDate || null)}>Save changes <ArrowRight size={15} /></button></>}>
    <p className="modal-intro">Turn a rough note into a clear, action-oriented task. Your wording stays editable.</p><label className="field-label">TASK TITLE<input className="text-field" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} /></label><label className="field-label">DETAILS <span className="optional-label">OPTIONAL</span><textarea className="text-area" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder="Add context or a useful detail…" /></label><div className="field-grid"><label className="field-label">PRIORITY<select className="text-field" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label className="field-label">DUE DATE<input className="text-field" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label></div>{suggested && <div className="success-hint"><CheckCircle2 size={15} /> AI suggestion ready — review and edit before saving.</div>}{error && <div className="inline-error"><span>{error}</span><span>You can still edit and save manually.</span></div>}<button className="ai-secondary-button" onClick={() => void improve()} disabled={loading || !title.trim()}>{loading ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{loading ? 'Thinking…' : 'Improve with AI'}</button>
  </ModalFrame>;
}

function BreakdownModal({ task, onClose, onSave }: { task: Task; onClose: () => void; onSave: (subtasks: string[]) => Promise<void> }) {
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(false);
  const [manual, setManual] = useState('');
  const generate = async () => {
    setLoading(true); setError('');
    try { const result = await api.breakdown(task.title, task.description); setSubtasks(result.subtasks); setGenerated(true); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'AI is unavailable. Add steps manually below.'); if (!subtasks.length) setSubtasks(['']); }
    finally { setLoading(false); }
  };
  const addManual = () => { if (manual.trim()) { setSubtasks((current) => [...current, manual.trim()]); setManual(''); } };
  return <ModalFrame title="Break it into steps" eyebrow="AI TASK PLANNER" onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!subtasks.some((item) => item.trim())} onClick={() => void onSave(subtasks.map((item) => item.trim()).filter(Boolean))}>Add {subtasks.filter((item) => item.trim()).length} steps <ArrowRight size={15} /></button></>}>
    <div className="task-context"><span>FOR TASK</span><strong>{task.title}</strong></div><p className="modal-intro">Get a practical checklist, then edit the steps so they match the way you work.</p>{subtasks.length > 0 && <div className="editable-steps">{subtasks.map((step, index) => <div className="editable-step" key={index}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><input value={step} onChange={(event) => setSubtasks((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="Describe one step" /><button onClick={() => setSubtasks((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove step"><X size={14} /></button></div>)}</div>}{error && <div className="inline-error">{error}</div>}{generated && <div className="success-hint"><CheckCircle2 size={15} /> Draft steps generated. Make them yours before adding.</div>}<div className="manual-step-row"><input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Add your own step…" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addManual(); } }} /><button className="secondary-button" onClick={addManual} disabled={!manual.trim()}><Plus size={14} /> Add</button></div><button className="ai-secondary-button" onClick={() => void generate()} disabled={loading}>{loading ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{loading ? 'Creating steps…' : 'Generate steps with AI'}</button>
  </ModalFrame>;
}

function PlanModal({ tasks, onClose, onApply }: { tasks: Task[]; onClose: () => void; onApply: (items: PrioritySuggestion[]) => Promise<void> }) {
  const [suggestions, setSuggestions] = useState<PrioritySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(false);
  const openTasks = tasks.filter((task) => task.status !== 'done');
  const initialRun = useRef(false);
  const runPlan = async () => {
    if (!openTasks.length) {
      setSuggestions([]);
      setGenerated(false);
      setError('');
      return;
    }
    setLoading(true); setError(''); setGenerated(false);
    try { const result = await api.prioritize(tasks); setSuggestions(result.items); setGenerated(true); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'AI planning is unavailable. You can still set priorities manually.'); setSuggestions(openTasks.map((task) => ({ taskId: task.id, priority: task.priority, reason: 'Keep your current priority, or adjust it below.' }))); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (initialRun.current) return;
    initialRun.current = true;
    void runPlan();
  }, []);
  const updatePriority = (id: string, priority: Priority) => setSuggestions((current) => current.map((item) => item.taskId === id ? { ...item, priority } : item));
  const ordered = [...suggestions].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - ({ high: 0, medium: 1, low: 2 }[b.priority])));
  return <ModalFrame title="A clearer plan for today" eyebrow="YOUR AI FOCUS PLAN" onClose={onClose} footer={<><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={() => void onApply(ordered)} disabled={!suggestions.length || loading}>Apply priorities <ArrowRight size={15} /></button></>}>
    <p className="modal-intro">A suggested order based on due dates, impact, and the priorities you already set. Nothing changes until you apply it.</p>{openTasks.length > 30 && <div className="inline-error">AI plans the first 30 unfinished tasks. Remaining tasks stay unchanged.</div>}{loading && <div className="ai-loading"><div className="loading-orb"><Sparkles size={19} /></div><strong>Finding your focus</strong><span>Looking at due dates and task priorities…</span></div>}{error && <div className="inline-error">{error}</div>}{!loading && openTasks.length === 0 && <div className="state-mini">You're all caught up. Enjoy the breathing room.</div>}{!loading && ordered.map((item, index) => { const task = tasks.find((candidate) => candidate.id === item.taskId); if (!task) return null; return <div className="plan-item" key={item.taskId}><span className="plan-order">{String(index + 1).padStart(2, '0')}</span><div className="plan-item-copy"><strong>{task.title}</strong><span>{generated ? item.reason : 'Set this priority to shape your focus.'}</span></div><select aria-label={`Suggested priority for ${task.title}`} value={item.priority} onChange={(event) => updatePriority(item.taskId, event.target.value as Priority)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>; })}{!loading && openTasks.length > 0 && <button className="ai-secondary-button plan-refresh" onClick={() => void runPlan()}><Sparkles size={15} /> Refresh AI suggestions</button>}
  </ModalFrame>;
}
