export type Quadrant = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type Theme = 'dark' | 'light';

export type User = {
  id: string;
  name: string;
  email: string;
  settings: {
    theme: Theme;
    focusMinutes: number;
    reminderTone: 'gentle' | 'bright' | 'quiet';
  };
  onboarding: {
    completed: boolean;
    step: number;
  };
  google: {
    connected: boolean;
    email: string | null;
  };
};

export type ScheduleBlock = {
  startAt: string;
  endAt: string;
};

export type ParsedDraft = {
  title: string;
  rawInput: string;
  description: string;
  dueAt: string;
  reminderAt: string | null;
  estimatedMinutes: number;
  suggestedQuadrant: Quadrant;
  quadrantReason: string;
  suggestedScheduleBlocks: ScheduleBlock[];
};

export type Task = {
  id: string;
  title: string;
  rawInput?: string;
  description?: string;
  dueAt?: string;
  reminderAt?: string | null;
  estimatedMinutes: number;
  quadrant: Quadrant;
  quadrantLabel: string;
  aiSuggestedQuadrant?: Quadrant;
  aiQuadrantReason?: string;
  status: 'INBOX' | 'PLANNED' | 'SCHEDULED' | 'FOCUSING' | 'DONE';
  priority: number;
  reminderLevel: 'none' | 'gentle' | 'escalating';
  schedule?: {
    startAt?: string;
    endAt?: string;
    source?: 'google' | 'focus' | 'manual';
    googleEventId?: string;
  };
};
