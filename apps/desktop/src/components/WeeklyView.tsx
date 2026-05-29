import { useState } from 'react';
import { today } from '../constants';
import type { ToodlyData, UpdateData } from '../types';
import { endOfWeek, isBetweenIso, startOfWeek, toIsoDate } from '../utils/date';
import { buildLocalAiSummary } from '../utils/summary';
import { formatTodoPeriod, todoOverlaps } from '../utils/todo';
import { groupByTag } from '../utils/tag';
import { TagTaskList } from './TagTaskList';

export function WeeklyView({ data, updateData }: { data: ToodlyData; updateData: UpdateData }) {
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekEnd); lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);
  const nextWeekStart = new Date(weekStart); nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const nextWeekEnd = new Date(weekEnd); nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
  const lastGroups = groupByTag(data.todos.filter((todo) => todo.done && isBetweenIso(todo.completedAt, lastWeekStart, lastWeekEnd)).map((todo) => ({ title: `${todo.title} ${formatTodoPeriod(todo)}`, tag: todo.tag })));
  const doneGroups = groupByTag(data.todos.filter((todo) => todo.done && isBetweenIso(todo.completedAt, weekStart, weekEnd)).map((todo) => ({ title: `${todo.title} ${formatTodoPeriod(todo)}`, tag: todo.tag })));
  const nextGroups = groupByTag(data.todos.filter((todo) => !todo.done && todo.status !== 'ended' && todoOverlaps(todo, nextWeekStart, nextWeekEnd)).map((todo) => ({ title: `${todo.title} ${formatTodoPeriod(todo)}`, tag: todo.tag })));
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
  return <section className="card"><div className="section-head spaced"><div><div className="caption">{toIsoDate(weekStart)} ~ {toIsoDate(weekEnd)}</div><div className="title">주간 정리</div></div><div className="badge blue">W</div></div><div className="report-block"><div className="report-section"><h3>지난주 완료한 작업</h3><TagTaskList groups={lastGroups} /></div><div className="report-section"><h3>이번 주 완료한 작업</h3><TagTaskList groups={doneGroups} /></div><div className="report-section"><h3>다음 주 작업 예정</h3><TagTaskList groups={nextGroups} /></div></div></section>;
}
