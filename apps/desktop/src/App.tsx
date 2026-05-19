import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Todo = { id: number; title: string; done: boolean; createdAt: string; completedAt?: string; tag?: string };
type Schedule = { id: number; scheduledAt: string; title: string; startTime?: string; endTime?: string; memo?: string; repeat?: string; tag?: string };
type CalendarEvent = Schedule & { occurrenceAt: string; isRepeatInstance?: boolean };
type AiSummary = { id: string; range: 'week' | 'month'; provider: string; createdAt: string; doneLines: string[]; nextLines: string[] };
type AiAuth = { connected: boolean; provider?: string; expiresAt?: string; storage?: string; pending?: boolean; error?: string };
type ToodlyData = { todos: Todo[]; schedules: Schedule[]; tags: string[]; ai?: { auth: AiAuth; summaries: Partial<Record<'week' | 'month', AiSummary>> } };
type Draft = { title: string; scheduledAt: string; startTime: string; endTime: string; memo: string; repeat: string; tag: string };
type TagGroup = { tag: string; tasks: string[] };
type Tab = 'calendar' | 'week' | 'month';
type UpdateStatus = { state: 'idle' | 'disabled' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'latest' | 'error'; message: string; version?: string; progress?: number };

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

const STORAGE_KEY = 'toodly-state-v2';
const today = new Date();
const todayIso = toIsoDate(today);
const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
const initialData: ToodlyData = {
  todos: [
    { id: 1, title: '어제 못 끝낸 기획 정리', done: false, createdAt: '2026-05-17', tag: '기획' },
    { id: 2, title: 'Toodly 화면 구조 잡기', done: false, createdAt: '2026-05-18', tag: '기획' },
    { id: 3, title: '앱 이름 확정', done: true, createdAt: '2026-05-18', completedAt: '2026-05-18', tag: '기록' },
  ],
  schedules: [
    { id: 1, scheduledAt: '2026-05-05', title: '어린이날', tag: '휴일', repeat: '없음' },
    { id: 2, scheduledAt: '2026-05-14', title: '회의', tag: '회의', startTime: '10:00', endTime: '11:00', repeat: '없음' },
    { id: 3, scheduledAt: '2026-05-18', title: 'Toodly 설계', tag: '기획', startTime: '14:00', endTime: '15:00', memo: '전체화면/고정핀 구조 정리', repeat: '없음' },
    { id: 4, scheduledAt: '2026-05-22', title: '리뷰', tag: '회고', repeat: '없음' },
  ],
  tags: ['기획', '기술검토', '기록', '회의', '회사', '회고', '휴일', 'TODO'],
  ai: { auth: { connected: false }, summaries: {} },
};

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHeaderDate(date: Date) {
  return `${toIsoDate(date)} (${weekdayLabels[date.getDay()]})`;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const diff = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - diff);
  return result;
}

function endOfWeek(date: Date) {
  const result = startOfWeek(date);
  result.setDate(result.getDate() + 6);
  return result;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function isBetweenIso(value: string | undefined, start: Date, end: Date) {
  if (!value) return false;
  const date = parseIsoDate(value);
  return date >= start && date <= end;
}

function isSameDayOfMonth(a: Date, b: Date) {
  return a.getDate() === b.getDate();
}

function scheduleOccursOn(schedule: Schedule, iso: string) {
  const date = parseIsoDate(iso);
  const start = parseIsoDate(schedule.scheduledAt);
  if (date < start) return false;
  const repeat = schedule.repeat ?? '없음';
  if (repeat === '없음') return schedule.scheduledAt === iso;
  if (repeat === '매일') return true;
  if (repeat === '매주') return date.getDay() === start.getDay();
  if (repeat === '매월') return isSameDayOfMonth(date, start);
  return schedule.scheduledAt === iso;
}

function expandSchedulesBetween(schedules: Schedule[], start: Date, end: Date): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const schedule of schedules) {
    const cursor = new Date(start);
    while (cursor <= end) {
      const iso = toIsoDate(cursor);
      if (scheduleOccursOn(schedule, iso)) {
        events.push({ ...schedule, occurrenceAt: iso, isRepeatInstance: (schedule.repeat ?? '없음') !== '없음' && schedule.scheduledAt !== iso });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return events;
}

function formatMonth(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function buildCalendarDays(viewMonth: Date) {
  const first = startOfMonth(viewMonth);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, iso: toIsoDate(date), muted: date.getMonth() !== viewMonth.getMonth() };
  });
}

function getSuggestions(value: string, tags: string[]) {
  const keyword = value.trim().toLowerCase();
  if (!keyword) return tags.slice(0, 3);
  return tags.filter((tag) => tag.toLowerCase().includes(keyword) || keyword.includes(tag[0]?.toLowerCase() ?? '')).slice(0, 3);
}

function groupByTag(items: Array<{ tag?: string; title: string }>): TagGroup[] {
  const map = new Map<string, string[]>();
  items.forEach((item) => {
    const key = `#${item.tag?.trim() || '태그없음'}`;
    map.set(key, [...(map.get(key) ?? []), item.title]);
  });
  return Array.from(map.entries()).map(([tag, tasks]) => ({ tag, tasks }));
}


function normalizeData(data: ToodlyData): ToodlyData {
  return { ...data, ai: data.ai ?? { auth: { connected: false }, summaries: {} } };
}

function buildLocalAiSummary(range: 'week' | 'month', doneGroups: TagGroup[], nextGroups: TagGroup[]): AiSummary {
  return {
    id: `${range}-${Date.now()}`,
    range,
    provider: 'local',
    createdAt: new Date().toISOString(),
    doneLines: doneGroups.length ? doneGroups.map((group) => `${group.tag}: ${group.tasks.join(', ')} 작업을 정리했습니다.`) : ['완료된 작업이 없습니다.'],
    nextLines: nextGroups.length ? nextGroups.map((group) => `${group.tag}: ${group.tasks.join(', ')} 작업을 이어갑니다.`) : ['예정 작업이 없습니다.'],
  };
}

function localLoad() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeData(JSON.parse(saved) as ToodlyData) : initialData;
  } catch {
    return initialData;
  }
}

function useToodlyData() {
  const [data, setData] = useState<ToodlyData>(localLoad);

  useEffect(() => {
    void window.toodly?.getData().then(setData).catch(() => undefined);
    return window.toodly?.onDataUpdated((next) => setData(next));
  }, []);

  const updateData = (updater: (current: ToodlyData) => ToodlyData) => {
    setData((current) => {
      const next = normalizeData(updater(current));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      void window.toodly?.setData(next).catch(() => undefined);
      return next;
    });
  };

  const rememberTag = (tag?: string) => {
    const clean = tag?.trim();
    if (!clean) return;
    updateData((current) => current.tags.includes(clean) ? current : { ...current, tags: [...current.tags, clean] });
  };

  return { data: normalizeData(data), updateData, rememberTag };
}

function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', message: '업데이트 확인 전' });

  useEffect(() => {
    void window.toodly?.getUpdateStatus().then(setStatus).catch(() => undefined);
    return window.toodly?.onUpdateStatus(setStatus);
  }, []);

  const check = async () => {
    const next = await window.toodly?.checkForUpdates().catch(() => ({ state: 'error', message: '업데이트 확인에 실패했습니다.' } as UpdateStatus));
    if (next) setStatus(next);
  };

  const install = async () => {
    const next = await window.toodly?.installUpdate().catch(() => ({ state: 'error', message: '업데이트 설치에 실패했습니다.' } as UpdateStatus));
    if (next) setStatus(next);
  };

  return { status, check, install };
}

function TagSuggest({ value, tags, onPick }: { value: string; tags: string[]; onPick: (tag: string) => void }) {
  return (
    <div className="tag-suggest">
      <div className="tag-suggest-label">태그 추천</div>
      <div className="tag-chips">
        {getSuggestions(value, tags).map((tag) => <button className="tag-chip" key={tag} onClick={() => onPick(tag)} type="button">{tag}</button>)}
      </div>
      <div className="tag-help">선택 없이 저장하면 입력한 값이 새 태그로 저장됩니다.</div>
    </div>
  );
}

function FieldInput(props: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="field input-field"><span>{props.label}</span><input type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder} /></label>;
}

function FieldTextArea(props: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field input-field"><span>{props.label}</span><textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder="메모" /></label>;
}

function RepeatSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="field input-field"><span>반복</span><select value={value} onChange={(event) => onChange(event.target.value)}><option>없음</option><option>매일</option><option>매주</option><option>매월</option></select></label>;
}

function PinView({ embedded = false, data, updateData, rememberTag }: { embedded?: boolean; data: ToodlyData; updateData: (updater: (current: ToodlyData) => ToodlyData) => void; rememberTag: (tag?: string) => void }) {
  const [quickTitle, setQuickTitle] = useState('');
  const [selectedId, setSelectedId] = useState(0);
  const selected = data.todos.find((todo) => todo.id === selectedId);
  const [editTitle, setEditTitle] = useState(selected?.title ?? '');
  const [editTag, setEditTag] = useState(selected?.tag ?? '');
  const [pinAlwaysOnTop, setPinAlwaysOnTop] = useState(true);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const currentIso = toIsoDate(currentDate);
  const visibleTodos = data.todos.filter((todo) => !todo.done || todo.completedAt === currentIso);

  useEffect(() => {
    setEditTitle(selected?.title ?? '');
    setEditTag(selected?.tag ?? '');
  }, [selected?.id, selected?.title, selected?.tag]);

  useEffect(() => {
    void window.toodly?.getPinAlwaysOnTop().then(setPinAlwaysOnTop).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDate(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const togglePinAlwaysOnTop = async () => {
    const next = !pinAlwaysOnTop;
    setPinAlwaysOnTop(next);
    const saved = await window.toodly?.setPinAlwaysOnTop(next).catch(() => next);
    setPinAlwaysOnTop(saved ?? next);
  };

  const addTodo = () => {
    const title = quickTitle.trim();
    if (!title) return;
    const nextTodo = { id: Date.now(), title, done: false, createdAt: currentIso, tag: 'TODO' };
    rememberTag('TODO');
    updateData((current) => ({ ...current, todos: [nextTodo, ...current.todos] }));
    setQuickTitle('');
  };

  const toggleDone = (id: number) => {
    updateData((current) => ({ ...current, todos: current.todos.map((item) => item.id === id ? { ...item, done: !item.done, completedAt: item.done ? undefined : currentIso } : item) }));
  };
  const saveTodo = () => {
    if (!selected || !editTitle.trim()) return;
    rememberTag(editTag);
    updateData((current) => ({ ...current, todos: current.todos.map((item) => item.id === selected.id ? { ...item, title: editTitle.trim(), tag: editTag.trim() || undefined } : item) }));
    setSelectedId(0);
  };
  const deleteTodo = () => {
    if (!selected || !window.confirm('이 TODO를 삭제할까요?')) return;
    updateData((current) => ({ ...current, todos: current.todos.filter((item) => item.id !== selected.id) }));
    setSelectedId(0);
  };

  const carryCount = visibleTodos.filter((todo) => !todo.done && todo.createdAt < currentIso).length;

  return (
    <aside className={`panel pin ${embedded ? '' : 'pin-standalone'}`}>
      <div className="pin-header"><div><div className="caption">{formatHeaderDate(currentDate)}</div><div className="title">Toodly</div></div><div className="pin-actions"><button className={`icon-btn pin-toggle ${pinAlwaysOnTop ? '' : 'off'}`} aria-label={pinAlwaysOnTop ? '고정핀 해제' : '고정핀 고정'} onClick={togglePinAlwaysOnTop} type="button">📌</button><button className="icon-btn" aria-label="전체화면 열기" onClick={() => void window.toodly?.openMainWindow()} type="button">↗</button></div></div>
      <form className="quick-input" onSubmit={(event) => { event.preventDefault(); addTodo(); }}><input placeholder="할 일을 바로 입력" value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} /><button>추가</button></form>
      <section className="todo-list">
        {!visibleTodos.length && <div className="empty-card">아직 TODO가 없습니다.</div>}
        {visibleTodos.map((todo) => <div className="todo-block" key={todo.id}><div className={`todo ${!todo.done && todo.createdAt < currentIso ? 'carry' : ''} ${selected?.id === todo.id ? 'selected' : ''}`}><input aria-label={`${todo.title} 완료`} type="checkbox" checked={todo.done} onChange={() => toggleDone(todo.id)} /><button className={`todo-text ${todo.done ? 'done' : ''}`} onClick={() => setSelectedId(selected?.id === todo.id ? 0 : todo.id)} type="button"><strong>{todo.title}</strong><span>{todo.done ? '완료됨' : `#${todo.tag ?? 'TODO'}`}</span></button></div>{selected?.id === todo.id && <div className="todo-edit-popover"><div className="caption">TODO 텍스트 클릭</div><div className="title small-title">TODO 수정</div><div className="schedule-form"><FieldInput label="내용" value={editTitle} onChange={setEditTitle} /><div className="field">생성일: {selected.createdAt}</div><FieldInput label="태그" value={editTag} onChange={setEditTag} placeholder="태그 입력" /><TagSuggest value={editTag} tags={data.tags} onPick={setEditTag} /><div className="todo-edit-actions"><button className="secondary-btn" onClick={saveTodo} type="button">저장</button><button className="danger-btn" onClick={deleteTodo} type="button">삭제</button></div></div></div>}</div>)}
      </section>
      <div className="pin-footer"><div className="mini-stat"><b>{data.todos.filter((todo) => !todo.done).length}</b><span>오늘 할 일</span></div><div className="mini-stat"><b>{carryCount}</b><span>이월된 일</span></div></div>
    </aside>
  );
}

function CalendarView({ data, updateData, rememberTag, viewMonth, setViewMonth }: { data: ToodlyData; updateData: (updater: (current: ToodlyData) => ToodlyData) => void; rememberTag: (tag?: string) => void; viewMonth: Date; setViewMonth: (date: Date) => void }) {
  const [popover, setPopover] = useState<{ mode: 'add' | 'edit'; source?: 'todo' | 'schedule'; iso: string; todoId?: number; scheduleId?: number; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Draft>({ title: '', scheduledAt: todayIso, startTime: '', endTime: '', memo: '', repeat: '없음', tag: '' });
  const calendarDays = useMemo(() => buildCalendarDays(viewMonth), [viewMonth]);
  const scheduleByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const first = calendarDays[0]?.date ?? startOfMonth(viewMonth);
    const last = calendarDays[calendarDays.length - 1]?.date ?? endOfMonth(viewMonth);
    expandSchedulesBetween(data.schedules, first, last).forEach((item) => map.set(item.occurrenceAt, [...(map.get(item.occurrenceAt) ?? []), item]));
    return map;
  }, [calendarDays, data.schedules, viewMonth]);
  const todoByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    data.todos.forEach((todo) => map.set(todo.createdAt, [...(map.get(todo.createdAt) ?? []), todo]));
    return map;
  }, [data.todos]);

  useEffect(() => {
    if (!popover) return;
    const closeOnOutsideClick = (event: globalThis.MouseEvent) => {
      const target = event.target as Element | null;
      const isCalendarArea = target?.closest('.calendar-grid');
      const isPopoverArea = target?.closest('.schedule-popover');
      if (!isCalendarArea && !isPopoverArea) setPopover(null);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [popover]);

  const getPopoverPosition = (event: MouseEvent<HTMLElement>) => {
    const anchor = event.currentTarget;
    const wrap = anchor.closest('.calendar-wrap');
    const anchorRect = anchor.getBoundingClientRect();
    const wrapRect = wrap?.getBoundingClientRect();
    if (!wrapRect) return { x: 124, y: 120 };
    return {
      x: Math.max(16, Math.min(anchorRect.left - wrapRect.left + 50, wrapRect.width - 320)),
      y: anchorRect.top - wrapRect.top + anchorRect.height + 10,
    };
  };

  const openAdd = (iso: string, event: MouseEvent<HTMLElement>) => {
    setPopover({ mode: 'add', iso, ...getPopoverPosition(event) });
    setDraft({ title: '', scheduledAt: iso, startTime: '', endTime: '', memo: '', repeat: '없음', tag: '' });
  };
  const openEditTodo = (todo: Todo, event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setPopover({ mode: 'edit', source: 'todo', iso: todo.createdAt, todoId: todo.id, ...getPopoverPosition(event) });
    setDraft({ title: todo.title, scheduledAt: todo.createdAt, startTime: '', endTime: '', memo: '', repeat: '없음', tag: todo.tag ?? '' });
  };
  const openEditSchedule = (schedule: CalendarEvent, event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setPopover({ mode: 'edit', source: 'schedule', iso: schedule.occurrenceAt, scheduleId: schedule.id, ...getPopoverPosition(event) });
    setDraft({ title: schedule.title, scheduledAt: schedule.scheduledAt, startTime: schedule.startTime ?? '', endTime: schedule.endTime ?? '', memo: schedule.memo ?? '', repeat: schedule.repeat ?? '없음', tag: schedule.tag ?? '' });
  };
  const saveTodoFromCalendar = () => {
    const title = draft.title.trim();
    if (!title) return;
    const tag = draft.tag.trim() || 'TODO';
    rememberTag(tag);
    if (popover?.mode === 'edit' && popover.source === 'todo' && popover.todoId) {
      updateData((current) => ({ ...current, todos: current.todos.map((item) => item.id === popover.todoId ? { ...item, title, createdAt: draft.scheduledAt, tag } : item) }));
    } else if (popover?.mode === 'edit' && popover.source === 'schedule' && popover.scheduleId) {
      updateData((current) => ({ ...current, schedules: current.schedules.map((item) => item.id === popover.scheduleId ? { ...item, title, scheduledAt: draft.scheduledAt, tag } : item) }));
    } else {
      const nextTodo: Todo = { id: Date.now(), title, done: false, createdAt: draft.scheduledAt, tag };
      updateData((current) => ({ ...current, todos: [nextTodo, ...current.todos] }));
    }
    setPopover(null);
  };
  const deleteTodoFromCalendar = () => {
    if (popover?.source === 'todo' && popover.todoId) {
      if (!window.confirm('이 TODO를 삭제할까요?')) return;
      updateData((current) => ({ ...current, todos: current.todos.filter((item) => item.id !== popover.todoId) }));
      setPopover(null);
      return;
    }
    if (popover?.source === 'schedule' && popover.scheduleId) {
      if (!window.confirm('이 항목을 삭제할까요?')) return;
      updateData((current) => ({ ...current, schedules: current.schedules.filter((item) => item.id !== popover.scheduleId) }));
      setPopover(null);
    }
  };

  return (
    <section className="card calendar-wrap">
      <div className="section-head"><div><div className="caption">{formatMonth(viewMonth)}</div><div className="title">이번 달 일정</div></div><div className="month-nav"><button onClick={() => setViewMonth(addMonths(viewMonth, -1))}>‹</button><button onClick={() => setViewMonth(startOfMonth(today))}>오늘</button><button onClick={() => setViewMonth(addMonths(viewMonth, 1))}>›</button></div></div>
      <div className="calendar-grid">
        {['일', '월', '화', '수', '목', '금', '토'].map((day) => <div className="day-name" key={day}>{day}</div>)}
        {calendarDays.map(({ date, iso, muted }) => {
          const events = scheduleByDate.get(iso) ?? [];
          const todos = todoByDate.get(iso) ?? [];
          return <button className={`date-cell ${muted ? 'muted' : ''} ${iso === todayIso ? 'today' : ''} ${popover?.iso === iso ? 'selected' : ''}`} key={iso} onClick={(event) => openAdd(iso, event)} type="button"><div className="num">{date.getDate()}</div>{todos.map((todo) => <span className={`event-pill todo-pill ${todo.done ? 'done-pill' : ''}`} key={`todo-${todo.id}`} onClick={(event) => openEditTodo(todo, event)}>{todo.title}</span>)}{events.map((event) => <span className="event-pill" key={`${event.id}-${event.occurrenceAt}`} onClick={(clickEvent) => openEditSchedule(event, clickEvent)}>{event.isRepeatInstance ? '↻ ' : ''}{event.title}</span>)}</button>;
        })}
      </div>
      {popover && <div className="schedule-popover todo-calendar-popover" style={{ left: popover.x, top: popover.y }}><div className="caption">{draft.scheduledAt}</div><div className="title popover-title">{popover.mode === 'add' ? '새 TODO 추가' : 'TODO 수정'}</div><div className="schedule-form"><FieldInput label="제목" value={draft.title} onChange={(title) => setDraft((current) => ({ ...current, title }))} placeholder="예) 미팅" /><FieldInput label="날짜" type="date" value={draft.scheduledAt} onChange={(scheduledAt) => setDraft((current) => ({ ...current, scheduledAt }))} /><FieldInput label="태그" value={draft.tag} onChange={(tag) => setDraft((current) => ({ ...current, tag }))} placeholder="태그 입력" /><TagSuggest value={draft.tag} tags={data.tags} onPick={(tag) => setDraft((current) => ({ ...current, tag }))} /><div className={popover.mode === 'add' ? '' : 'popover-actions'}><button className={popover.mode === 'add' ? 'primary-btn full-width' : 'secondary-btn'} onClick={saveTodoFromCalendar} type="button">{popover.mode === 'add' ? 'TODO 추가' : '저장'}</button>{popover.mode === 'edit' && <button className="danger-btn" onClick={deleteTodoFromCalendar} type="button">삭제</button>}</div></div></div>}
    </section>
  );
}

function AiControl({ data, updateData }: { data: ToodlyData; updateData: (updater: (current: ToodlyData) => ToodlyData) => void }) {
  const auth = data.ai?.auth ?? { connected: false };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setAuth = (nextAuth: AiAuth) => updateData((current) => ({ ...current, ai: { auth: nextAuth, summaries: current.ai?.summaries ?? {} } }));
  const login = async () => {
    setLoading(true);
    setError('');
    try {
      const fallback = { connected: true, provider: 'mock', storage: 'browser-preview' };
      const nextAuth = window.toodly ? await window.toodly.loginAi().catch(() => fallback) : fallback;
      setAuth(nextAuth);
    } catch {
      setError('AI 로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };
  const logout = async () => {
    setLoading(true);
    setError('');
    try {
      const fallback = { connected: false };
      const nextAuth = window.toodly ? await window.toodly.logoutAi().catch(() => fallback) : fallback;
      setAuth(nextAuth);
    } catch {
      setError('로그아웃에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };
  const status = auth.pending ? 'OAuth 로그인 대기중' : auth.connected ? 'AI 연결됨' : 'AI 미연결';
  const detail = error || auth.error || (auth.connected ? `${auth.provider ?? 'AI'} · ${auth.storage ?? 'secure-storage'}` : '로그인 없이도 기본 정리는 표시됩니다.');
  return <div className="ai-control"><div><strong>{status}</strong><span className={error || auth.error ? 'error-text' : ''}>{detail}</span></div><button className={auth.connected ? 'ghost-btn' : 'primary-btn compact'} disabled={loading || auth.pending} onClick={auth.connected ? logout : login} type="button">{loading ? '처리중' : auth.connected ? '로그아웃' : 'AI 로그인'}</button></div>;
}

function UpdateNotice() {
  const { status, check, install } = useUpdateStatus();
  const busy = status.state === 'checking' || status.state === 'downloading' || status.state === 'installing';
  const showInstall = status.state === 'ready';
  return <div className={`update-notice ${status.state}`}><div><strong>앱 업데이트</strong><span>{status.message}{status.version ? ` · v${status.version}` : ''}</span></div>{showInstall ? <button className="primary-btn compact" onClick={install} type="button">재시작 후 업데이트</button> : <button className="ghost-btn" disabled={busy} onClick={check} type="button">{busy ? '처리중' : '업데이트 확인'}</button>}</div>;
}

function WorkSummaryCard({ data }: { data: ToodlyData }) {
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const weekDone = data.todos.filter((todo) => todo.done && isBetweenIso(todo.completedAt, weekStart, weekEnd)).length;
  const monthScheduleCount = expandSchedulesBetween(data.schedules, monthStart, monthEnd).length;
  const monthDone = data.todos.filter((todo) => todo.done && isBetweenIso(todo.completedAt, monthStart, monthEnd)).length + monthScheduleCount;
  const pending = data.todos.filter((todo) => !todo.done).length;
  const carry = data.todos.filter((todo) => !todo.done && todo.createdAt < todayIso).length;
  const rate = Math.round((data.todos.filter((todo) => todo.done).length / Math.max(data.todos.length, 1)) * 100);
  return <aside><section className="card"><div className="section-head"><div><div className="caption">로컬 집계</div><div className="title">작업내역</div></div></div><div className="summary-list"><div className="summary-item"><div className="badge blue">W</div><div><strong>이번 주 완료 {weekDone}개</strong><span>이월 {carry}개 · 진행중 {pending}개</span></div><b>{rate}%</b></div><div className="summary-item"><div className="badge green">M</div><div><strong>이번 달 완료 {monthDone}개</strong><span>이월 {carry}개 · 일정 {monthScheduleCount}개</span></div><b>{rate}%</b></div></div></section></aside>;
}

function TagTaskList({ groups }: { groups: TagGroup[] }) {
  if (!groups.length) return <div className="empty-text">아직 표시할 작업이 없습니다.</div>;
  return <ul className="title-list">{groups.map((group) => <li key={group.tag}><strong>{group.tag}</strong>{group.tasks.map((task) => <span className="sub-task" key={task}>- {task}</span>)}</li>)}</ul>;
}

function WeeklyView({ data, updateData }: { data: ToodlyData; updateData: (updater: (current: ToodlyData) => ToodlyData) => void }) {
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  const nextWeekStart = new Date(weekStart); nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const nextWeekEnd = new Date(weekEnd); nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
  const doneGroups = groupByTag(data.todos.filter((todo) => todo.done && isBetweenIso(todo.completedAt, weekStart, weekEnd)).map((todo) => ({ title: todo.title, tag: todo.tag })));
  const nextGroups = groupByTag([...data.todos.filter((todo) => !todo.done).map((todo) => ({ title: todo.title, tag: todo.tag })), ...expandSchedulesBetween(data.schedules, nextWeekStart, nextWeekEnd).map((item) => ({ title: item.isRepeatInstance ? `${item.title} (${item.occurrenceAt})` : item.title, tag: item.tag }))]);
  const aiSummary = data.ai?.summaries.week;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestAiSummary = async () => {
    setLoading(true);
    setError('');
    const fallback = buildLocalAiSummary('week', doneGroups, nextGroups);
    try {
      const summary = window.toodly ? await window.toodly.summarizeAi('week', { doneGroups, nextGroups }).catch(() => fallback) : fallback;
      updateData((current) => ({ ...current, ai: { auth: current.ai?.auth ?? { connected: false }, summaries: { ...(current.ai?.summaries ?? {}), week: summary } } }));
    } catch {
      setError('AI 정리에 실패해서 기본 정리를 유지합니다.');
    } finally {
      setLoading(false);
    }
  };
  return <section className="card"><div className="screen-label">탭 화면 · 주간 정리</div><div className="section-head spaced"><div><div className="caption">{toIsoDate(weekStart)} ~ {toIsoDate(weekEnd)}</div><div className="title">주간 정리</div></div><div className="badge blue">W</div></div><div className="report-block"><div className="report-section"><h3>이번 주 완료한 작업</h3><TagTaskList groups={doneGroups} /></div><div className="report-section"><h3>다음 주 작업 예정</h3><TagTaskList groups={nextGroups} /></div></div></section>;
}

function MonthlyView({ data, updateData }: { data: ToodlyData; updateData: (updater: (current: ToodlyData) => ToodlyData) => void }) {
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const nextMonthStart = addMonths(monthStart, 1);
  const nextMonthEnd = endOfMonth(nextMonthStart);
  const doneItems = [...data.todos.filter((todo) => todo.done && isBetweenIso(todo.completedAt, monthStart, monthEnd)).map((todo) => ({ title: todo.title, tag: todo.tag })), ...expandSchedulesBetween(data.schedules, monthStart, monthEnd).map((schedule) => ({ title: schedule.isRepeatInstance ? `${schedule.title} (${schedule.occurrenceAt})` : schedule.title, tag: schedule.tag }))];
  const nextItems = [...data.todos.filter((todo) => !todo.done).map((todo) => ({ title: todo.title, tag: todo.tag })), ...expandSchedulesBetween(data.schedules, nextMonthStart, nextMonthEnd).map((schedule) => ({ title: schedule.isRepeatInstance ? `${schedule.title} (${schedule.occurrenceAt})` : schedule.title, tag: schedule.tag }))];
  const doneGroups = groupByTag(doneItems);
  const nextGroups = groupByTag(nextItems);
  const aiSummary = data.ai?.summaries.month;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestAiSummary = async () => {
    setLoading(true);
    setError('');
    const fallback = buildLocalAiSummary('month', doneGroups, nextGroups);
    try {
      const summary = window.toodly ? await window.toodly.summarizeAi('month', { doneGroups, nextGroups }).catch(() => fallback) : fallback;
      updateData((current) => ({ ...current, ai: { auth: current.ai?.auth ?? { connected: false }, summaries: { ...(current.ai?.summaries ?? {}), month: summary } } }));
    } catch {
      setError('AI 정리에 실패해서 기본 정리를 유지합니다.');
    } finally {
      setLoading(false);
    }
  };
  return <section className="card"><div className="screen-label">탭 화면 · 월간 정리</div><div className="section-head spaced"><div><div className="caption">{formatMonth(today)}</div><div className="title">월간 정리</div></div><div className="badge green">M</div></div><div className="report-block"><div className="report-section"><h3>이번 달 완료한 작업</h3><TagTaskList groups={doneGroups} /></div><div className="report-section"><h3>다음 달 작업 예정</h3><TagTaskList groups={nextGroups} /></div></div></section>;
}

function MainView({ data, updateData, rememberTag }: { data: ToodlyData; updateData: (updater: (current: ToodlyData) => ToodlyData) => void; rememberTag: (tag?: string) => void }) {
  const [tab, setTab] = useState<Tab>('calendar');
  const [viewMonth, setViewMonth] = useState(startOfMonth(today));
  return <main className="stage"><section className="panel full"><header className="topbar"><div><div className="caption">전체화면</div><div className="title">일정과 작업내역</div></div><div className="top-actions"><nav className="tabs"><button className={`tab ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>달력</button><button className={`tab ${tab === 'week' ? 'active' : ''}`} onClick={() => setTab('week')}>주간 정리</button><button className={`tab ${tab === 'month' ? 'active' : ''}`} onClick={() => setTab('month')}>월간 정리</button></nav></div></header>{tab === 'calendar' && <><div className="content-grid"><CalendarView data={data} updateData={updateData} rememberTag={rememberTag} viewMonth={viewMonth} setViewMonth={setViewMonth} /><WorkSummaryCard data={data} /></div><div className="ai-card"><b>데이터 흐름 메모</b><p>TODO는 입력 즉시 오늘 항목으로 저장합니다. 체크되지 않은 항목은 다음날 화면에도 이어서 노출하고, 완료 체크 시 완료일 기준으로 주간/월간 작업내역에 집계합니다.</p></div></>}{tab === 'week' && <div className="screen-stack single"><WeeklyView data={data} updateData={updateData} /></div>}{tab === 'month' && <div className="screen-stack single"><MonthlyView data={data} updateData={updateData} /></div>}</section></main>;
}

function App() {
  const { data, updateData, rememberTag } = useToodlyData();
  const view = new URLSearchParams(window.location.search).get('window');
  return view === 'pin' ? <PinView data={data} updateData={updateData} rememberTag={rememberTag} /> : <MainView data={data} updateData={updateData} rememberTag={rememberTag} />;
}

createRoot(document.getElementById('root')!).render(<App />);
