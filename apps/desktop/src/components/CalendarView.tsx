import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import { today, todayIso } from '../constants';
import type { CalendarTodo, Draft, RememberTag, Todo, ToodlyData, UpdateData } from '../types';
import { addMonths, endOfMonth, formatMonth, startOfMonth } from '../utils/date';
import { assignCalendarTodoLanes, buildCalendarDays, expandTodosBetween, shouldShowRangeTitle } from '../utils/todo';
import { FieldInput } from './common';
import { TagSuggest } from './TagSuggest';

export function CalendarView({ data, updateData, rememberTag, viewMonth, setViewMonth }: { data: ToodlyData; updateData: UpdateData; rememberTag: RememberTag; viewMonth: Date; setViewMonth: (date: Date) => void }) {
  const [popover, setPopover] = useState<{ mode: 'add' | 'edit'; iso: string; todoId?: number; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Draft>({ title: '', startDate: todayIso, endDate: '', status: 'active', tag: '' });
  const calendarDays = useMemo(() => buildCalendarDays(viewMonth), [viewMonth]);
  const todoByDate = useMemo(() => {
    const map = new Map<string, CalendarTodo[]>();
    const first = calendarDays[0]?.date ?? startOfMonth(viewMonth);
    const last = calendarDays[calendarDays.length - 1]?.date ?? endOfMonth(viewMonth);
    assignCalendarTodoLanes(expandTodosBetween(data.todos, first, last)).forEach((item) => map.set(item.occurrenceAt, [...(map.get(item.occurrenceAt) ?? []), item]));
    return map;
  }, [calendarDays, data.todos, viewMonth]);

  useEffect(() => {
    if (!popover) return;
    const closeOnOutsideClick = (event: globalThis.MouseEvent) => {
      const target = event.target as Element | null;
      const isCalendarArea = target?.closest('.calendar-grid');
      const isPopoverArea = target?.closest('.todo-popover');
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
    setDraft({ title: '', startDate: iso, endDate: '', status: 'active', tag: '' });
  };
  const openEditTodo = (todo: CalendarTodo, event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setPopover({ mode: 'edit', iso: todo.occurrenceAt, todoId: todo.id, ...getPopoverPosition(event) });
    setDraft({ title: todo.title, startDate: todo.startDate, endDate: todo.endDate ?? '', status: todo.status ?? 'active', tag: todo.tag ?? '' });
  };
  const saveTodoFromCalendar = () => {
    const title = draft.title.trim();
    if (!title) return;
    const tag = draft.tag.trim() || 'TODO';
    if (draft.endDate && draft.endDate < draft.startDate) {
      window.alert('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }
    rememberTag(tag);
    const endDate = draft.endDate || undefined;
    const done = draft.status === 'ended';
    const completedAt = done ? (endDate ?? draft.startDate) : undefined;
    if (popover?.mode === 'edit' && popover.todoId) {
      updateData((current) => ({ ...current, todos: current.todos.map((item) => item.id === popover.todoId ? { ...item, title, done, startDate: draft.startDate, endDate, status: draft.status, completedAt, tag } : item) }));
    } else {
      const nextTodo: Todo = { id: Date.now(), title, done, startDate: draft.startDate, endDate, status: draft.status, completedAt, tag };
      updateData((current) => ({ ...current, todos: [nextTodo, ...current.todos] }));
    }
    setPopover(null);
  };
  const deleteTodoFromCalendar = () => {
    if (!popover?.todoId) return;
    if (!window.confirm('이 TODO를 삭제할까요?')) return;
    updateData((current) => ({ ...current, todos: current.todos.filter((item) => item.id !== popover.todoId) }));
    setPopover(null);
  };
  const updateDraftStatus = (checked: boolean) => {
    setDraft((current) => ({ ...current, status: checked ? 'ended' : 'active' }));
  };

  return (
    <section className="card calendar-wrap">
      <div className="section-head"><div><div className="caption">{formatMonth(viewMonth)}</div><div className="title">이번 달 TODO</div></div><div className="month-nav"><button onClick={() => setViewMonth(addMonths(viewMonth, -1))}>‹</button><button onClick={() => setViewMonth(startOfMonth(today))}>오늘</button><button onClick={() => setViewMonth(addMonths(viewMonth, 1))}>›</button></div></div>
      <div className="calendar-grid">
        {['일', '월', '화', '수', '목', '금', '토'].map((day) => <div className="day-name" key={day}>{day}</div>)}
        {calendarDays.map(({ date, iso, muted }) => {
          const todos = [...(todoByDate.get(iso) ?? [])].sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0) || a.title.localeCompare(b.title));
          return <button className={`date-cell ${muted ? 'muted' : ''} ${iso === todayIso ? 'today' : ''} ${popover?.iso === iso ? 'selected' : ''}`} key={iso} onClick={(event) => openAdd(iso, event)} type="button"><div className="num">{date.getDate()}</div><div className="event-stack">{todos.map((todo) => <span aria-label={todo.title} className={`event-pill todo-range ${todo.rangePosition ?? 'single'} ${todo.status === 'ended' ? 'ended' : ''} ${todo.done ? 'done-pill' : ''} ${shouldShowRangeTitle(todo) ? '' : 'continuing'}`} key={`${todo.id}-${todo.occurrenceAt}`} onClick={(clickEvent) => openEditTodo(todo, clickEvent)} style={{ gridRow: (todo.lane ?? 0) + 1 }}>{shouldShowRangeTitle(todo) ? todo.title : ''}</span>)}</div></button>;
        })}
      </div>
      {popover && <div className="todo-popover todo-calendar-popover" style={{ left: popover.x, top: popover.y }}><div className="caption">{draft.endDate ? `${draft.startDate} ~ ${draft.endDate}` : draft.startDate}</div><div className="title popover-title">{popover.mode === 'add' ? '새 TODO 추가' : 'TODO 수정'}</div><div className="todo-form"><FieldInput label="제목" value={draft.title} onChange={(title) => setDraft((current) => ({ ...current, title }))} placeholder="예) 미팅" /><FieldInput label="시작일" type="date" value={draft.startDate} onChange={(startDate) => setDraft((current) => ({ ...current, startDate }))} /><FieldInput label="종료일" type="date" value={draft.endDate} onChange={(endDate) => setDraft((current) => ({ ...current, endDate }))} /><label className="status-check"><input type="checkbox" checked={draft.status === 'ended'} onChange={(event) => updateDraftStatus(event.target.checked)} /><span><b>종료됨</b><small>종료일은 직접 입력한 값을 사용합니다.</small></span></label><FieldInput label="태그" value={draft.tag} onChange={(tag) => setDraft((current) => ({ ...current, tag }))} placeholder="태그 입력" /><TagSuggest value={draft.tag} tags={data.tags} todos={data.todos} onPick={(tag) => setDraft((current) => ({ ...current, tag }))} /><div className={popover.mode === 'add' ? '' : 'popover-actions'}><button className={popover.mode === 'add' ? 'primary-btn full-width' : 'secondary-btn'} onClick={saveTodoFromCalendar} type="button">{popover.mode === 'add' ? 'TODO 추가' : '저장'}</button>{popover.mode === 'edit' && <button className="danger-btn" onClick={deleteTodoFromCalendar} type="button">삭제</button>}</div></div></div>}
    </section>
  );
}
