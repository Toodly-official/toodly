import { useState } from 'react';
import { today } from '../constants';
import type { ToodlyData, UpdateData } from '../types';
import { addMonths, endOfMonth, formatMonth, startOfMonth } from '../utils/date';
import { buildLocalAiSummary } from '../utils/summary';
import { todoOverlaps } from '../utils/todo';
import { groupByTag } from '../utils/tag';
import { TagTaskList } from './TagTaskList';

export function MonthlyView({ data, updateData }: { data: ToodlyData; updateData: UpdateData }) {
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const nextMonthStart = addMonths(monthStart, 1);
  const nextMonthEnd = endOfMonth(nextMonthStart);
  const doneItems = data.todos.filter((todo) => (todo.done || todo.status === 'ended') && todoOverlaps(todo, monthStart, monthEnd)).map((todo) => ({ title: todo.title, tag: todo.tag }));
  const nextItems = data.todos.filter((todo) => !todo.done && todo.status !== 'ended' && todoOverlaps(todo, nextMonthStart, nextMonthEnd)).map((todo) => ({ title: todo.title, tag: todo.tag }));
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
  return <section className="card"><div className="section-head spaced"><div><div className="caption">{formatMonth(today)}</div><div className="title">월간 정리</div></div><div className="badge green">M</div></div><div className="report-block"><div className="report-section"><h3>이번 달 완료한 작업</h3><TagTaskList groups={doneGroups} /></div><div className="report-section"><h3>다음 달 작업 예정</h3><TagTaskList groups={nextGroups} /></div></div></section>;
}
