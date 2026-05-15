import { Canvas, useFrame } from '@react-three/fiber';
import {
  CalendarCheck,
  Check,
  Clock3,
  Flame,
  Focus,
  ListChecks,
  LogOut,
  Moon,
  Play,
  Plus,
  Sparkles,
  Sun,
  Wand2
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Mesh } from 'three';
import { api, getToken, setToken } from './api';
import type { ParsedDraft, Quadrant, ScheduleBlock, Task, Theme, User } from './types';

const quadrants: Record<Quadrant, { name: string; short: string; color: string }> = {
  Q1: { name: 'Urgent + Important', short: 'Fire first', color: '#ff356a' },
  Q2: { name: 'Not Urgent + Important', short: 'One win', color: '#28dca8' },
  Q3: { name: 'Urgent + Not Important', short: 'Fast pass', color: '#ffb000' },
  Q4: { name: 'Not Urgent + Not Important', short: 'Ignore by design', color: '#8b5cf6' }
};

const tutorialSteps = [
  {
    title: 'Login',
    body: 'Create your space. Your tasks stay synced in MongoDB.'
  },
  {
    title: 'Capture',
    body: 'Type the messy thought. AI pulls out task, due date, reminder, and estimate.'
  },
  {
    title: 'Choose quadrant',
    body: 'Review the AI nudge. You stay in control.'
  },
  {
    title: 'Connect Calendar',
    body: 'Google gives a refresh key. We encrypt it before storage, so it is safe with us.'
  },
  {
    title: 'Schedule',
    body: 'Pick one slot. HowerFlow creates the event and stores its eventId.'
  },
  {
    title: 'Daily flow',
    body: 'See today, overdue, and one Q2 win. Q1 caps at three.'
  }
];

function Scene() {
  return (
    <Canvas camera={{ position: [0, 0, 7], fov: 48 }} className="scene" gl={{ preserveDrawingBuffer: true, alpha: true }}>
      <ambientLight intensity={1.4} />
      <pointLight position={[4, 4, 4]} intensity={3} color="#6dfcff" />
      <pointLight position={[-4, -3, 4]} intensity={2.2} color="#ff5df2" />
      <PriorityShard position={[-3.2, 1.4, 0]} color="#ff356a" speed={0.75} />
      <PriorityShard position={[2.7, 1.1, -1]} color="#28dca8" speed={0.55} />
      <PriorityShard position={[0.4, -1.7, -0.5]} color="#ffe45c" speed={0.95} />
      <PriorityShard position={[3.8, -1.2, -1.5]} color="#8b5cf6" speed={0.65} />
    </Canvas>
  );
}

function PriorityShard({ position, color, speed }: { position: [number, number, number]; color: string; speed: number }) {
  const [mesh, setMesh] = useState<Mesh | null>(null);
  useFrame(({ clock }) => {
    if (!mesh) return;
    const t = clock.elapsedTime * speed;
    mesh.rotation.x = t * 0.7;
    mesh.rotation.y = t;
    mesh.position.y = position[1] + Math.sin(t * 1.8) * 0.25;
  });
  return (
    <mesh ref={setMesh} position={position}>
      <octahedronGeometry args={[0.72, 0]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.28} metalness={0.18} />
    </mesh>
  );
}

function AppShell({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app-shell">
      <Scene />
      <div className="motion-grid" />
      {children}
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return 'No deadline';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function isoForInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function fromInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function AuthScreen({ onAuthed }: { onAuthed: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('HowerFlow Pilot');
  const [email, setEmail] = useState('demo@howerflow.app');
  const [password, setPassword] = useState('password');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const response =
        mode === 'register'
          ? await api.register({ name, email, password })
          : await api.login({ email, password });
      setToken(response.token);
      onAuthed(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not login.');
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-copy pop-in">
        <p className="eyebrow">HowerFlow</p>
        <h1>Task capture for bright, jumpy brains.</h1>
        <p>
          Dump the thought, pick the quadrant, schedule the next right move, and keep Q2 visible before life turns it into Q1.
        </p>
        <div className="hero-actions">
          <span><Sparkles size={18} /> AI structure</span>
          <span><CalendarCheck size={18} /> Calendar sync</span>
          <span><Focus size={18} /> Focus blocks</span>
        </div>
      </section>

      <form className="auth-panel pop-in delay-1" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>New</button>
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
        </div>
        {mode === 'register' && (
          <label>
            Name
            <input value={name} onChange={event => setName(event.target.value)} />
          </label>
        )}
        <label>
          Email
          <input value={email} onChange={event => setEmail(event.target.value)} type="email" />
        </label>
        <label>
          Password
          <input value={password} onChange={event => setPassword(event.target.value)} type="password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">
          <Play size={18} /> {mode === 'register' ? 'Create flow' : 'Login'}
        </button>
      </form>
    </main>
  );
}

function Tutorial({ user, onDone }: { user: User; onDone: (user: User) => void }) {
  const [step, setStep] = useState(user.onboarding.step || 0);

  async function move(next: number) {
    const clamped = Math.max(0, Math.min(tutorialSteps.length - 1, next));
    setStep(clamped);
    const response = await api.updateOnboarding({ step: clamped });
    onDone(response.user);
  }

  async function finish() {
    const response = await api.updateOnboarding({ completed: true, step: tutorialSteps.length - 1 });
    onDone(response.user);
  }

  return (
    <main className="tutorial-layout">
      <section className="tutorial-stage pop-in">
        <div className="step-counter">{step + 1}/{tutorialSteps.length}</div>
        <h1>{tutorialSteps[step].title}</h1>
        <p>{tutorialSteps[step].body}</p>
        <div className="tutorial-dots">
          {tutorialSteps.map((item, index) => (
            <button
              key={item.title}
              className={index === step ? 'active' : ''}
              onClick={() => move(index)}
              aria-label={`Tutorial step ${index + 1}`}
            />
          ))}
        </div>
        <div className="row-actions">
          <button className="ghost" onClick={() => move(step - 1)} disabled={step === 0}>Back</button>
          {step === tutorialSteps.length - 1 ? (
            <button className="primary" onClick={finish}><Check size={18} /> Start</button>
          ) : (
            <button className="primary" onClick={() => move(step + 1)}>Next</button>
          )}
        </div>
      </section>
    </main>
  );
}

function QuickCapture({ onCreated }: { onCreated: (task: Task) => void }) {
  const [mode, setMode] = useState<'quick' | 'template'>('quick');
  const [text, setText] = useState('pay rent tomorrow, remind me 6pm, also finish CN assignment');
  const [drafts, setDrafts] = useState<ParsedDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function parse() {
    setBusy(true);
    setError('');
    try {
      const response = await api.parse(
        mode === 'template'
          ? `Task: ${text}. Due tomorrow. Estimate 25 minutes.`
          : text
      );
      setDrafts(response.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse capture.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(draft: ParsedDraft) {
    const response = await api.createTask({
      title: draft.title,
      rawInput: draft.rawInput,
      description: draft.description,
      dueAt: draft.dueAt,
      reminderAt: draft.reminderAt,
      estimatedMinutes: draft.estimatedMinutes,
      quadrant: draft.suggestedQuadrant,
      aiSuggestedQuadrant: draft.suggestedQuadrant,
      aiQuadrantReason: draft.quadrantReason,
      status: 'PLANNED',
      priority: draft.suggestedQuadrant === 'Q1' ? 1 : draft.suggestedQuadrant === 'Q2' ? 2 : 3
    });
    onCreated(response.task);
    setDrafts(current => current.filter(item => item !== draft));
  }

  return (
    <section className="panel capture-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Quick Capture</p>
          <h2>One box. No friction.</h2>
        </div>
        <div className="segmented mini">
          <button className={mode === 'quick' ? 'active' : ''} onClick={() => setMode('quick')}>Quick</button>
          <button className={mode === 'template' ? 'active' : ''} onClick={() => setMode('template')}>Template</button>
        </div>
      </div>
      <textarea value={text} onChange={event => setText(event.target.value)} />
      {error && <p className="error">{error}</p>}
      <button className="primary wide" onClick={parse} disabled={busy}>
        <Wand2 size={18} /> {busy ? 'Structuring...' : 'Find tasks'}
      </button>
      <div className="draft-stack">
        {drafts.map(draft => (
          <article className="draft-card" key={`${draft.title}-${draft.dueAt}`}>
            <input value={draft.title} onChange={event => (draft.title = event.target.value)} />
            <div className="draft-grid">
              <label>
                Due
                <input type="datetime-local" defaultValue={isoForInput(draft.dueAt)} onChange={event => (draft.dueAt = fromInput(event.target.value) || draft.dueAt)} />
              </label>
              <label>
                Minutes
                <input type="number" min="15" max="180" defaultValue={draft.estimatedMinutes} onChange={event => (draft.estimatedMinutes = Number(event.target.value))} />
              </label>
            </div>
            <QuadrantPicker value={draft.suggestedQuadrant} onChange={value => (draft.suggestedQuadrant = value)} />
            <p className="nudge">{draft.quadrantReason}</p>
            <button className="secondary wide" onClick={() => saveDraft(draft)}><Plus size={17} /> Add to review</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function QuadrantPicker({ value, onChange }: { value: Quadrant; onChange: (value: Quadrant) => void }) {
  return (
    <div className="quadrant-picker">
      {(Object.keys(quadrants) as Quadrant[]).map(key => (
        <button key={key} className={value === key ? 'active' : ''} onClick={() => onChange(key)} style={{ '--accent': quadrants[key].color } as React.CSSProperties}>
          <strong>{key}</strong>
          <span>{quadrants[key].name}</span>
        </button>
      ))}
    </div>
  );
}

function TaskCard({ task, onChanged }: { task: Task; onChanged: (task: Task) => void }) {
  const [suggestions, setSuggestions] = useState<ScheduleBlock[]>([]);
  const [open, setOpen] = useState(false);

  async function loadSuggestions() {
    const response = await api.scheduleSuggestions(task.id);
    setSuggestions(response.suggestions);
    setOpen(true);
  }

  async function schedule(block: ScheduleBlock) {
    const response = await api.scheduleTask(task.id, block);
    onChanged(response.task);
    setOpen(false);
  }

  async function startNow() {
    const response = await api.startNow(task.id, 25);
    onChanged(response.task);
  }

  async function done() {
    const response = await api.updateTask(task.id, { status: 'DONE' });
    onChanged(response.task);
  }

  return (
    <article className={`task-card ${task.quadrant.toLowerCase()}`} style={{ '--accent': quadrants[task.quadrant].color } as React.CSSProperties}>
      <div className="task-top">
        <span className="pill">{task.quadrant} · {quadrants[task.quadrant].short}</span>
        <span className="mini-status">{task.status}</span>
      </div>
      <h3>{task.title}</h3>
      <p>{task.aiQuadrantReason || quadrants[task.quadrant].name}</p>
      <div className="task-meta">
        <span><Clock3 size={15} /> {formatDate(task.dueAt)}</span>
        <span><Focus size={15} /> {task.estimatedMinutes} min</span>
        <span><Flame size={15} /> {task.reminderLevel}</span>
      </div>
      {task.schedule?.startAt && <p className="scheduled">Scheduled {formatDate(task.schedule.startAt)} · eventId {task.schedule.googleEventId}</p>}
      <div className="task-actions">
        <button title="Start now" onClick={startNow}><Play size={17} /></button>
        <button title="Schedule" onClick={loadSuggestions}><CalendarCheck size={17} /></button>
        <button title="Done" onClick={done}><Check size={17} /></button>
      </div>
      {open && (
        <div className="slot-list">
          {suggestions.map(block => (
            <button key={`${block.startAt}-${block.endAt}`} onClick={() => schedule(block)}>
              {formatDate(block.startAt)} - {formatDate(block.endAt)}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function Dashboard({ user, setUser }: { user: User; setUser: (user: User | null) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [daily, setDaily] = useState<{ today: Task[]; overdue: Task[]; q2Focus: Task[] }>({ today: [], overdue: [], q2Focus: [] });
  const [weekly, setWeekly] = useState<{ completed: Task[]; slipped: Task[]; q2Minutes: number }>({ completed: [], slipped: [], q2Minutes: 0 });
  const [mode, setMode] = useState<'capture' | 'review'>('capture');
  const [notice, setNotice] = useState('');

  async function refresh() {
    const [taskData, dailyData, weeklyData] = await Promise.all([api.tasks(), api.daily(), api.weekly()]);
    setTasks(taskData.tasks);
    setDaily(dailyData);
    setWeekly(weeklyData);
  }

  useEffect(() => {
    refresh().catch(error => setNotice(error.message));
  }, []);

  async function toggleTheme() {
    const response = await api.updateSettings({ theme: user.settings.theme === 'dark' ? 'light' : 'dark' });
    setUser(response.user);
  }

  async function connectGoogle() {
    const response = await api.googleConnectUrl();
    if (response.url) {
      window.open(response.url, 'howerflow-google', 'width=520,height=700');
      setNotice('Google sign-in opened. Your refresh key is encrypted before storage.');
    } else {
      setNotice(response.message || 'Google OAuth needs env keys. Scheduling will create local event ids for now.');
    }
  }

  function upsertTask(task: Task) {
    setTasks(current => [task, ...current.filter(item => item.id !== task.id)]);
    refresh().catch(() => undefined);
  }

  const grouped = useMemo(() => {
    return (Object.keys(quadrants) as Quadrant[]).map(quadrant => ({
      quadrant,
      tasks: tasks.filter(task => task.quadrant === quadrant && task.status !== 'DONE')
    }));
  }, [tasks]);

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">HowerFlow</p>
          <h1>Welcome, {user.name.split(' ')[0]}</h1>
        </div>
        <nav className="nav-actions">
          <button className="icon-button" title="Toggle theme" onClick={toggleTheme}>
            {user.settings.theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <button className="icon-button" title="Logout" onClick={() => { setToken(null); setUser(null); }}>
            <LogOut size={19} />
          </button>
        </nav>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <section className="mode-strip">
        <button className={mode === 'capture' ? 'active' : ''} onClick={() => setMode('capture')}><Sparkles size={18} /> Quick Capture</button>
        <button className={mode === 'review' ? 'active' : ''} onClick={() => setMode('review')}><ListChecks size={18} /> Review Mode</button>
        <button className="calendar-button" onClick={connectGoogle}><CalendarCheck size={18} /> Google Calendar</button>
      </section>

      <section className="dashboard-grid">
        <div className="left-stack">
          {mode === 'capture' ? <QuickCapture onCreated={upsertTask} /> : (
            <section className="panel review-panel">
              <p className="eyebrow">Review Mode</p>
              <h2>Prioritize, then schedule.</h2>
              <div className="quadrant-board">
                {grouped.map(group => (
                  <div className="quadrant-lane" key={group.quadrant} style={{ '--accent': quadrants[group.quadrant].color } as React.CSSProperties}>
                    <h3>{group.quadrant}</h3>
                    <p>{quadrants[group.quadrant].name}</p>
                    <span>{group.tasks.length} open</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="task-list">
            {tasks.filter(task => task.status !== 'DONE').map(task => (
              <TaskCard task={task} onChanged={upsertTask} key={task.id} />
            ))}
          </section>
        </div>

        <aside className="right-stack">
          <section className="panel stat-panel urgent">
            <p className="eyebrow">Today</p>
            <h2>{daily.today.length}</h2>
            <span>to do today</span>
          </section>
          <section className="panel compact-list">
            <p className="eyebrow">Overdue</p>
            {daily.overdue.length ? daily.overdue.map(task => <span key={task.id}>{task.title}</span>) : <span>Clear</span>}
          </section>
          <section className="panel compact-list q2-focus">
            <p className="eyebrow">One Q2 win</p>
            {daily.q2Focus.length ? daily.q2Focus.map(task => <span key={task.id}>{task.title}</span>) : <span>Capture one important thing</span>}
          </section>
          <section className="panel compact-list">
            <p className="eyebrow">Weekly Review</p>
            <span>{weekly.completed.length} completed</span>
            <span>{weekly.slipped.length} slipped</span>
            <span>{weekly.q2Minutes} Q2 minutes</span>
          </section>
          <section className="panel compact-list settings-panel">
            <p className="eyebrow">Settings</p>
            <label>
              Focus minutes
              <input
                type="number"
                min="15"
                max="25"
                value={user.settings.focusMinutes}
                onChange={async event => {
                  const response = await api.updateSettings({ focusMinutes: Number(event.target.value) });
                  setUser(response.user);
                }}
              />
            </label>
            <span>Q1 cap: 3 per day</span>
            <span>Q4 reminders: ignored</span>
          </section>
        </aside>
      </section>
    </main>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api.me()
      .then(response => setUser(response.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const theme = user?.settings.theme || 'dark';

  return (
    <AppShell theme={theme}>
      {loading && <main className="loading">Loading HowerFlow...</main>}
      {!loading && !user && <AuthScreen onAuthed={setUser} />}
      {!loading && user && !user.onboarding.completed && <Tutorial user={user} onDone={setUser} />}
      {!loading && user && user.onboarding.completed && <Dashboard user={user} setUser={setUser} />}
    </AppShell>
  );
}
