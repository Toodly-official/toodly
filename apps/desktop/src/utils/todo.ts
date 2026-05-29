import type { CalendarTodo, Todo } from '../types';
import { endOfMonth, isBetweenIso, parseIsoDate, startOfMonth, toIsoDate, formatShortDate } from './date';

export function getTodoStartIso(todo: Pick<Todo, 'startDate'>) {
  return todo.startDate;
}

export function getTodoEndIso(todo: Todo) {
  return todo.endDate ?? todo.startDate;
}

export function getRangePosition(startIso: string, endIso: string, currentIso: string): CalendarTodo['rangePosition'] {
  const day = parseIsoDate(currentIso).getDay();
  const isSegmentStart = currentIso === startIso || day === 0;
  const isSegmentEnd = currentIso === endIso || day === 6;
  if (isSegmentStart && isSegmentEnd) return 'single';
  if (isSegmentStart) return 'start';
  if (isSegmentEnd) return 'end';
  return 'middle';
}

export function getTodoDurationDays(todo: Todo) {
  const start = parseIsoDate(getTodoStartIso(todo)).getTime();
  const end = parseIsoDate(getTodoEndIso(todo)).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function getCalendarWeekStartIso(iso: string) {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() - date.getDay());
  return toIsoDate(date);
}

export function getTodoSegmentStartIso(todo: CalendarTodo) {
  const weekStartIso = getCalendarWeekStartIso(todo.occurrenceAt);
  return todo.startDate > weekStartIso ? todo.startDate : weekStartIso;
}

export function getCalendarWeekEndIso(iso: string) {
  const date = parseIsoDate(getCalendarWeekStartIso(iso));
  date.setDate(date.getDate() + 6);
  return toIsoDate(date);
}

export function getTodoSegmentEndIso(todo: CalendarTodo) {
  const weekEndIso = getCalendarWeekEndIso(todo.occurrenceAt);
  const endIso = getTodoEndIso(todo);
  return endIso < weekEndIso ? endIso : weekEndIso;
}

export function rangesOverlap(a: { start: string; end: string }, b: { start: string; end: string }) {
  return a.start <= b.end && b.start <= a.end;
}

export function assignCalendarTodoLanes(items: CalendarTodo[]) {
  const segmentsByWeek = new Map<string, Array<{ key: string; start: string; end: string; title: string; duration: number }>>();
  items.forEach((item) => {
    const weekStart = getCalendarWeekStartIso(item.occurrenceAt);
    const key = `${item.id}-${weekStart}`;
    if (segmentsByWeek.get(weekStart)?.some((segment) => segment.key === key)) return;
    segmentsByWeek.set(weekStart, [...(segmentsByWeek.get(weekStart) ?? []), { key, start: getTodoSegmentStartIso(item), end: getTodoSegmentEndIso(item), title: item.title, duration: getTodoDurationDays(item) }]);
  });

  const laneBySegment = new Map<string, number>();
  segmentsByWeek.forEach((segments) => {
    const lanes: Array<Array<{ start: string; end: string }>> = [];
    segments
      .sort((a, b) => b.duration - a.duration || a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
      .forEach((segment) => {
        const lane = lanes.findIndex((itemsInLane) => itemsInLane.every((item) => !rangesOverlap(item, segment)));
        const nextLane = lane === -1 ? lanes.length : lane;
        lanes[nextLane] = [...(lanes[nextLane] ?? []), segment];
        laneBySegment.set(segment.key, nextLane);
      });
  });

  return items.map((item) => ({ ...item, lane: laneBySegment.get(`${item.id}-${getCalendarWeekStartIso(item.occurrenceAt)}`) ?? 0 }));
}

export function shouldShowRangeTitle(todo: CalendarTodo) {
  return todo.rangePosition === 'single' || todo.rangePosition === 'start';
}

export function todoOccursOn(todo: Todo, iso: string) {
  const date = parseIsoDate(iso);
  const start = parseIsoDate(getTodoStartIso(todo));
  const end = parseIsoDate(getTodoEndIso(todo));
  return date >= start && date <= end;
}

export function todoOverlaps(todo: Todo, start: Date, end: Date) {
  return isBetweenIso(todo.startDate, start, end) || isBetweenIso(getTodoEndIso(todo), start, end) || (todo.startDate <= toIsoDate(start) && getTodoEndIso(todo) >= toIsoDate(end));
}

export function isTodoDone(todo: Todo) {
  return todo.done || todo.status === 'ended';
}

export function expandTodosBetween(todos: Todo[], start: Date, end: Date): CalendarTodo[] {
  const events: CalendarTodo[] = [];
  for (const todo of todos) {
    const cursor = new Date(start);
    while (cursor <= end) {
      const iso = toIsoDate(cursor);
      if (todoOccursOn(todo, iso)) {
        const startIso = getTodoStartIso(todo);
        const endIso = getTodoEndIso(todo);
        events.push({ ...todo, occurrenceAt: iso, rangePosition: getRangePosition(startIso, endIso, iso) });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return events;
}

export function buildCalendarDays(viewMonth: Date) {
  const first = startOfMonth(viewMonth);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, iso: toIsoDate(date), muted: date.getMonth() !== viewMonth.getMonth() };
  });
}

export function formatTodoPeriod(todo: Todo) {
  return `(${formatShortDate(todo.startDate)}~${formatShortDate(getTodoEndIso(todo))})`;
}
