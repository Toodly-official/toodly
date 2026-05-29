import { useState } from 'react';
import { today } from '../constants';
import type { RememberTag, Tab, ToodlyData, UpdateData } from '../types';
import { startOfMonth } from '../utils/date';
import { CalendarView } from './CalendarView';
import { MonthlyView } from './MonthlyView';
import { WeeklyView } from './WeeklyView';
import { WorkSummaryCard } from './WorkSummaryCard';

export function MainView({ data, updateData, rememberTag }: { data: ToodlyData; updateData: UpdateData; rememberTag: RememberTag }) {
  const [tab, setTab] = useState<Tab>('calendar');
  const [viewMonth, setViewMonth] = useState(startOfMonth(today));
  return <main className="stage"><section className="panel full"><header className="topbar"><div><div className="caption">전체화면</div><div className="title">TODO와 작업내역</div></div><div className="top-actions"><nav className="tabs"><button className={`tab ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>달력</button><button className={`tab ${tab === 'week' ? 'active' : ''}`} onClick={() => setTab('week')}>주간 정리</button><button className={`tab ${tab === 'month' ? 'active' : ''}`} onClick={() => setTab('month')}>월간 정리</button></nav></div></header>{tab === 'calendar' && <><div className="content-grid"><CalendarView data={data} updateData={updateData} rememberTag={rememberTag} viewMonth={viewMonth} setViewMonth={setViewMonth} /><WorkSummaryCard data={data} /></div><div className="ai-card"><b>데이터 흐름 메모</b><p>TODO는 입력 즉시 오늘 항목으로 저장합니다. 체크되지 않은 항목은 다음날 화면에도 이어서 노출하고, 완료 체크 시 완료일 기준으로 주간/월간 작업내역에 집계합니다.</p></div></>}{tab === 'week' && <div className="screen-stack single"><WeeklyView data={data} updateData={updateData} /></div>}{tab === 'month' && <div className="screen-stack single"><MonthlyView data={data} updateData={updateData} /></div>}</section></main>;
}
