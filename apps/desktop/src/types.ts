export type Todo = { id: number; title: string; done: boolean; startDate: string; endDate?: string; status?: 'active' | 'ended'; completedAt?: string; tag?: string; memo?: string };
export type CalendarTodo = Todo & { occurrenceAt: string; rangePosition?: 'single' | 'start' | 'middle' | 'end'; lane?: number };
export type AiSummary = { id: string; range: 'week' | 'month'; provider: string; createdAt: string; doneLines: string[]; nextLines: string[] };
export type AiAuth = { connected: boolean; provider?: string; expiresAt?: string; storage?: string; pending?: boolean; error?: string };
export type ToodlyData = { todos: Todo[]; tags: string[]; ai?: { auth: AiAuth; summaries: Partial<Record<'week' | 'month', AiSummary>> } };
export type PersistedToodlyData = Partial<ToodlyData> & { todos?: Array<Partial<Todo> & { createdAt?: string }> };
export type Draft = { title: string; startDate: string; endDate: string; status: 'active' | 'ended'; tag: string };
export type TagGroup = { tag: string; tasks: string[] };
export type Tab = 'calendar' | 'week' | 'month';
export type UpdateStatus = { state: 'idle' | 'disabled' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'latest' | 'error'; message: string; version?: string; progress?: number };
export type UpdateData = (updater: (current: ToodlyData) => ToodlyData) => void;
export type RememberTag = (tag?: string) => void;

declare global {
  interface Window {
    toodly?: {
      openMainWindow: () => Promise<boolean>;
      getPinAlwaysOnTop: () => Promise<boolean>;
      setPinAlwaysOnTop: (enabled: boolean) => Promise<boolean>;
      getData: () => Promise<ToodlyData>;
      setData: (data: ToodlyData) => Promise<ToodlyData>;
      getUpdateStatus: () => Promise<UpdateStatus>;
      checkForUpdates: () => Promise<UpdateStatus>;
      installUpdate: () => Promise<UpdateStatus>;
      getAuth: () => Promise<AiAuth>;
      loginAi: () => Promise<AiAuth>;
      logoutAi: () => Promise<AiAuth>;
      summarizeAi: (range: 'week' | 'month', payload: { doneGroups: TagGroup[]; nextGroups: TagGroup[] }) => Promise<AiSummary>;
      onDataUpdated: (callback: (data: ToodlyData) => void) => () => void;
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
    };
  }
}
