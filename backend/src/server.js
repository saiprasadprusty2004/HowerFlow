import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const app = express();
const port = Number(process.env.PORT || 4000);
const appUrl = process.env.APP_URL || 'http://localhost:5173';
const jwtSecret = process.env.JWT_SECRET || 'howerflow-dev-secret';
const encryptionSecret = process.env.TOKEN_ENCRYPTION_SECRET || 'howerflow-token-secret';

app.use(cors({ origin: appUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const quadrantLabels = {
  Q1: 'Urgent + Important',
  Q2: 'Not Urgent + Important',
  Q3: 'Urgent + Not Important',
  Q4: 'Not Urgent + Not Important'
};

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    settings: {
      theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
      focusMinutes: { type: Number, default: 25 },
      reminderTone: { type: String, enum: ['gentle', 'bright', 'quiet'], default: 'gentle' }
    },
    onboarding: {
      completed: { type: Boolean, default: false },
      step: { type: Number, default: 0 }
    },
    google: {
      connected: { type: Boolean, default: false },
      email: String,
      refreshTokenEncrypted: String,
      accessTokenEncrypted: String,
      tokenExpiresAt: Date
    }
  },
  { timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    rawInput: String,
    description: String,
    dueAt: Date,
    reminderAt: Date,
    estimatedMinutes: { type: Number, default: 25 },
    quadrant: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], default: 'Q2' },
    aiSuggestedQuadrant: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], default: 'Q2' },
    aiQuadrantReason: String,
    status: { type: String, enum: ['INBOX', 'PLANNED', 'SCHEDULED', 'FOCUSING', 'DONE'], default: 'INBOX' },
    priority: { type: Number, default: 2 },
    reminderLevel: { type: String, enum: ['none', 'gentle', 'escalating'], default: 'gentle' },
    schedule: {
      startAt: Date,
      endAt: Date,
      source: { type: String, enum: ['google', 'focus', 'manual'], default: 'manual' },
      googleEventId: String
    },
    completedAt: Date
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
const Task = mongoose.model('Task', taskSchema);

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, jwtSecret, { expiresIn: '14d' });
}

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Login required' });
  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Login required' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Session expired. Please login again.' });
  }
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    settings: user.settings,
    onboarding: user.onboarding,
    google: { connected: Boolean(user.google?.connected), email: user.google?.email || null }
  };
}

function encryptionKey() {
  return crypto.createHash('sha256').update(encryptionSecret).digest();
}

function encryptToken(token) {
  if (!token) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptToken(payload) {
  if (!payload) return null;
  const [ivText, tagText, encryptedText] = payload.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]).toString('utf8');
}

function parseDate(raw) {
  const text = raw.toLowerCase();
  const now = new Date();
  const due = new Date(now);
  if (text.includes('tomorrow')) due.setDate(now.getDate() + 1);
  else if (text.includes('next week')) due.setDate(now.getDate() + 7);
  else if (text.includes('today')) due.setDate(now.getDate());
  else due.setDate(now.getDate() + 2);

  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] || 0);
    if (timeMatch[3] === 'pm' && hours < 12) hours += 12;
    if (timeMatch[3] === 'am' && hours === 12) hours = 0;
    due.setHours(hours, minutes, 0, 0);
  } else {
    due.setHours(18, 0, 0, 0);
  }
  return due;
}

function parseReminder(raw, dueAt) {
  const text = raw.toLowerCase();
  const reminderMatch = text.match(/remind(?: me)?(?: at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (!reminderMatch) return null;
  const reminder = new Date(dueAt);
  let hours = Number(reminderMatch[1]);
  if (reminderMatch[3] === 'pm' && hours < 12) hours += 12;
  if (reminderMatch[3] === 'am' && hours === 12) hours = 0;
  reminder.setHours(hours, Number(reminderMatch[2] || 0), 0, 0);
  return reminder;
}

function estimateMinutes(raw) {
  const explicit = raw.match(/(\d{1,3})\s*(min|mins|minutes|hr|hour|hours)/i);
  if (!explicit) return raw.length > 70 ? 45 : 25;
  const value = Number(explicit[1]);
  return explicit[2].toLowerCase().startsWith('h') ? value * 60 : value;
}

function suggestQuadrant(raw, dueAt) {
  const text = raw.toLowerCase();
  const daysUntilDue = Math.ceil((dueAt.getTime() - Date.now()) / 86400000);
  const important = /(assignment|exam|rent|bill|project|health|client|deadline|career|study|cn\b|interview)/.test(text);
  const urgent = /(today|tomorrow|urgent|asap|tonight|deadline|overdue|pay)/.test(text) || daysUntilDue <= 1;
  if (urgent && important) return ['Q1', 'Urgent and important: it has a near deadline and meaningful consequences.'];
  if (!urgent && important) return ['Q2', 'Important, not urgent: protect time before it becomes a fire.'];
  if (urgent && !important) return ['Q3', 'Urgent, not important: handle quickly or delegate if possible.'];
  return ['Q4', 'Low urgency and low importance: park it unless it helps you recover.'];
}

function cleanTitle(raw) {
  return raw
    .replace(/remind(?: me)?(?: at)?\s+\d{1,2}(?::\d{2})?\s*(am|pm)/gi, '')
    .replace(/\b(today|tomorrow|next week|tonight|urgent|asap)\b/gi, '')
    .replace(/[,\s]+$/g, '')
    .replace(/\s*,\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^and\s+/i, '')
    .trim()
    .replace(/^./, c => c.toUpperCase());
}

function scheduleBlocks(dueAt, estimatedMinutes) {
  const options = [];
  const templates = [
    { dayOffset: 0, hour: 19, minute: 0 },
    { dayOffset: 1, hour: 10, minute: 0 },
    { dayOffset: 1, hour: 16, minute: 30 }
  ];
  for (const slot of templates) {
    const start = new Date();
    start.setDate(start.getDate() + slot.dayOffset);
    start.setHours(slot.hour, slot.minute, 0, 0);
    if (start < new Date()) start.setDate(start.getDate() + 1);
    if (start > dueAt) start.setTime(dueAt.getTime() - estimatedMinutes * 60000);
    const end = new Date(start.getTime() + estimatedMinutes * 60000);
    options.push({ startAt: start, endAt: end });
  }
  return options;
}

function parseInbox(raw) {
  return raw
    .split(/\balso\b|;|\n/gi)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const dueAt = parseDate(part);
      const estimatedMinutes = Math.max(15, Math.min(180, estimateMinutes(part)));
      const [quadrant, reason] = suggestQuadrant(part, dueAt);
      return {
        title: cleanTitle(part) || 'Untitled task',
        rawInput: part,
        description: '',
        dueAt,
        reminderAt: parseReminder(part, dueAt),
        estimatedMinutes,
        suggestedQuadrant: quadrant,
        quadrantReason: reason,
        suggestedScheduleBlocks: scheduleBlocks(dueAt, estimatedMinutes)
      };
    });
}

function reminderLevelFor(quadrant) {
  if (quadrant === 'Q1') return 'escalating';
  if (quadrant === 'Q2') return 'gentle';
  return 'none';
}

async function enforceQ1Limit(userId, quadrant, dueAt, ignoreTaskId) {
  if (quadrant !== 'Q1') return;
  const day = dueAt ? new Date(dueAt) : new Date();
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const query = { user: userId, quadrant: 'Q1', dueAt: { $gte: start, $lt: end }, status: { $ne: 'DONE' } };
  if (ignoreTaskId) query._id = { $ne: ignoreTaskId };
  const count = await Task.countDocuments(query);
  if (count >= 3) {
    const error = new Error('Q1 is capped at 3 items per day. Pick the real fires.');
    error.status = 409;
    throw error;
  }
}

function serializeTask(task) {
  return {
    id: task._id,
    title: task.title,
    rawInput: task.rawInput,
    description: task.description,
    dueAt: task.dueAt,
    reminderAt: task.reminderAt,
    estimatedMinutes: task.estimatedMinutes,
    quadrant: task.quadrant,
    quadrantLabel: quadrantLabels[task.quadrant],
    aiSuggestedQuadrant: task.aiSuggestedQuadrant,
    aiQuadrantReason: task.aiQuadrantReason,
    status: task.status,
    priority: task.priority,
    reminderLevel: task.reminderLevel,
    schedule: task.schedule,
    completedAt: task.completedAt,
    createdAt: task.createdAt
  };
}

async function createGoogleEvent(user, task, startAt, endAt) {
  const hasGoogleConfig = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI;
  if (!user.google?.connected || !hasGoogleConfig) {
    return `local-${crypto.randomUUID()}`;
  }

  const refreshToken = decryptToken(user.google.refreshTokenEncrypted);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!tokenResponse.ok) throw new Error('Google token refresh failed');
  const tokenData = await tokenResponse.json();

  const calendarResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${tokenData.access_token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      summary: task.title,
      description: task.description || task.rawInput || 'Scheduled from HowerFlow',
      start: { dateTime: new Date(startAt).toISOString() },
      end: { dateTime: new Date(endAt).toISOString() }
    })
  });
  if (!calendarResponse.ok) throw new Error('Google Calendar event creation failed');
  const event = await calendarResponse.json();
  return event.id;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, stack: 'MERN', database: 'MongoDB' }));

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ message: 'Name, email, and 6+ char password required.' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'An account already exists for this email.' });
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
      return res.status(401).json({ message: 'Email or password is wrong.' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.patch('/api/settings', auth, async (req, res, next) => {
  try {
    const current = req.user.settings?.toObject?.() || req.user.settings || {};
    req.user.settings = { ...current, ...req.body };
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/onboarding', auth, async (req, res, next) => {
  try {
    const current = req.user.onboarding?.toObject?.() || req.user.onboarding || {};
    req.user.onboarding = { ...current, ...req.body };
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/tasks', auth, async (req, res, next) => {
  try {
    const tasks = await Task.find({ user: req.user._id }).sort({ dueAt: 1, createdAt: -1 });
    res.json({ tasks: tasks.map(serializeTask) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/tasks/parse', auth, (req, res) => {
  const raw = String(req.body.text || '').trim();
  if (!raw) return res.status(400).json({ message: 'Type one messy thought first.' });
  res.json({ drafts: parseInbox(raw) });
});

app.post('/api/tasks', auth, async (req, res, next) => {
  try {
    const dueAt = req.body.dueAt ? new Date(req.body.dueAt) : null;
    await enforceQ1Limit(req.user._id, req.body.quadrant, dueAt);
    const task = await Task.create({
      user: req.user._id,
      title: req.body.title,
      rawInput: req.body.rawInput,
      description: req.body.description,
      dueAt,
      reminderAt: req.body.reminderAt ? new Date(req.body.reminderAt) : null,
      estimatedMinutes: req.body.estimatedMinutes || 25,
      quadrant: req.body.quadrant || 'Q2',
      aiSuggestedQuadrant: req.body.aiSuggestedQuadrant || req.body.quadrant || 'Q2',
      aiQuadrantReason: req.body.aiQuadrantReason,
      status: req.body.status || 'PLANNED',
      priority: req.body.priority || 2,
      reminderLevel: reminderLevelFor(req.body.quadrant || 'Q2')
    });
    res.status(201).json({ task: serializeTask(task) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/tasks/:id', auth, async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    const nextQuadrant = req.body.quadrant || task.quadrant;
    const nextDueAt = Object.hasOwn(req.body, 'dueAt') ? (req.body.dueAt ? new Date(req.body.dueAt) : null) : task.dueAt;
    await enforceQ1Limit(req.user._id, nextQuadrant, nextDueAt, task._id);
    const updates = { ...req.body, quadrant: nextQuadrant, reminderLevel: reminderLevelFor(nextQuadrant) };
    if (Object.hasOwn(req.body, 'dueAt')) updates.dueAt = nextDueAt;
    if (Object.hasOwn(req.body, 'reminderAt')) updates.reminderAt = req.body.reminderAt ? new Date(req.body.reminderAt) : null;
    if (req.body.status === 'DONE') updates.completedAt = new Date();
    Object.assign(task, updates);
    await task.save();
    res.json({ task: serializeTask(task) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/tasks/:id', auth, async (req, res, next) => {
  try {
    await Task.deleteOne({ _id: req.params.id, user: req.user._id });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/tasks/:id/schedule/suggestions', auth, async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    res.json({ suggestions: scheduleBlocks(task.dueAt || new Date(Date.now() + 86400000), task.estimatedMinutes) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/tasks/:id/schedule', auth, async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    const startAt = new Date(req.body.startAt);
    const endAt = new Date(req.body.endAt);
    const googleEventId = await createGoogleEvent(req.user, task, startAt, endAt);
    task.schedule = { startAt, endAt, source: req.user.google?.connected ? 'google' : 'manual', googleEventId };
    task.status = 'SCHEDULED';
    await task.save();
    res.json({ task: serializeTask(task) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/tasks/:id/start-now', auth, async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    const minutes = Math.min(Math.max(Number(req.body.minutes || req.user.settings.focusMinutes || 25), 15), 25);
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + minutes * 60000);
    const googleEventId = await createGoogleEvent(req.user, task, startAt, endAt);
    task.schedule = { startAt, endAt, source: 'focus', googleEventId };
    task.status = 'FOCUSING';
    await task.save();
    res.json({ task: serializeTask(task) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/overview/daily', auth, async (req, res, next) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const openTasks = await Task.find({ user: req.user._id, status: { $ne: 'DONE' } }).sort({ dueAt: 1 });
    res.json({
      today: openTasks.filter(task => task.dueAt && task.dueAt >= start && task.dueAt < end).map(serializeTask),
      overdue: openTasks.filter(task => task.dueAt && task.dueAt < start).map(serializeTask),
      q2Focus: openTasks.filter(task => task.quadrant === 'Q2').slice(0, 1).map(serializeTask)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reviews/weekly', auth, async (req, res, next) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const tasks = await Task.find({ user: req.user._id, createdAt: { $gte: weekAgo } }).sort({ updatedAt: -1 });
    const completed = tasks.filter(task => task.status === 'DONE').map(serializeTask);
    const slipped = tasks.filter(task => task.status !== 'DONE' && task.dueAt && task.dueAt < new Date()).map(serializeTask);
    const q2Minutes = tasks
      .filter(task => task.quadrant === 'Q2' && (task.status === 'DONE' || task.status === 'FOCUSING' || task.schedule?.startAt))
      .reduce((sum, task) => sum + task.estimatedMinutes, 0);
    res.json({ completed, slipped, q2Minutes });
  } catch (error) {
    next(error);
  }
});

app.get('/api/integrations/google/status', auth, (req, res) => {
  res.json({ connected: Boolean(req.user.google?.connected), email: req.user.google?.email || null });
});

app.get('/api/integrations/google/connect-url', auth, (req, res) => {
  const missing = !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI;
  if (missing) {
    return res.json({
      url: null,
      demo: true,
      message: 'Google OAuth is not configured yet. Add env keys to enable real calendar sync.'
    });
  }
  const state = signToken(req.user);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'openid email https://www.googleapis.com/auth/calendar.events',
    state
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

app.get('/api/integrations/google/callback', async (req, res, next) => {
  try {
    const payload = jwt.verify(req.query.state, jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) throw new Error('User not found');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    if (!tokenResponse.ok) throw new Error('Google OAuth exchange failed');
    const tokenData = await tokenResponse.json();
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = profileResponse.ok ? await profileResponse.json() : {};
    user.google = {
      connected: true,
      email: profile.email,
      refreshTokenEncrypted: encryptToken(tokenData.refresh_token),
      accessTokenEncrypted: encryptToken(tokenData.access_token),
      tokenExpiresAt: new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000)
    };
    await user.save();
    res.send('<script>window.close()</script><p>Google Calendar connected. You can close this tab.</p>');
  } catch (error) {
    next(error);
  }
});

app.delete('/api/integrations/google', auth, async (req, res, next) => {
  try {
    req.user.google = { connected: false };
    await req.user.save();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ message: error.message || 'Something went sideways.' });
});

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/howerflow');
app.listen(port, () => {
  console.log(`HowerFlow MERN API running on http://localhost:${port}`);
});
