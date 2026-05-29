import { today, todayIso } from '../constants';
import type { ToodlyData } from '../types';
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from '../utils/date';
import { isTodoDone, todoOverlaps } from '../utils/todo';

export function WorkSummaryCard({ data }: { data: ToodlyData }) {
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const weekTodos = data.todos.filter((todo) => todoOverlaps(todo, weekStart, weekEnd));
  const monthTodos = data.todos.filter((todo) => todoOverlaps(todo, monthStart, monthEnd));
  const weekDone = weekTodos.filter(isTodoDone).length;
  const monthDone = monthTodos.filter(isTodoDone).length;
  const weekPending = weekTodos.filter((todo) => !isTodoDone(todo)).length;
  const monthPending = monthTodos.filter((todo) => !isTodoDone(todo)).length;
  const weekCarry = weekTodos.filter((todo) => !isTodoDone(todo) && todo.startDate < todayIso).length;
  const weekRate = Math.round((weekDone / Math.max(weekTodos.length, 1)) * 100);
  const monthRate = Math.round((monthDone / Math.max(monthTodos.length, 1)) * 100);
  return <aside><section className="card"><div className="section-head"><div><div className="title">작업내역</div></div></div><div className="summary-list"><div className="summary-item"><div className="badge blue">W</div><div><strong>이번 주 완료 {weekDone}/{weekTodos.length}개</strong><span>이월 {weekCarry}개 · 진행중 {weekPending}개</span></div><b>{weekRate}%</b></div><div className="summary-item"><div className="badge green">M</div><div><strong>이번 달 완료 {monthDone}/{monthTodos.length}개</strong><span>진행중 {monthPending}개 · 전체 TODO {monthTodos.length}개</span></div><b>{monthRate}%</b></div></div></section></aside>;
}
