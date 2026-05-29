import { useEffect, useState } from 'react';
import type { RememberTag, ToodlyData, UpdateData } from '../types';
import { formatHeaderDate, toIsoDate } from '../utils/date';
import { FieldInput } from './common';
import { TagSuggest } from './TagSuggest';

export function PinView({ embedded = false, data, updateData, rememberTag }: { embedded?: boolean; data: ToodlyData; updateData: UpdateData; rememberTag: RememberTag }) {
  const [quickTitle, setQuickTitle] = useState('');
  const [selectedId, setSelectedId] = useState(0);
  const selected = data.todos.find((todo) => todo.id === selectedId);
  const [editTitle, setEditTitle] = useState(selected?.title ?? '');
  const [editTag, setEditTag] = useState(selected?.tag ?? '');
  const [pinAlwaysOnTop, setPinAlwaysOnTop] = useState(true);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const currentIso = toIsoDate(currentDate);
  const visibleTodos = data.todos.filter((todo) => !todo.done || todo.completedAt === currentIso);
  const canAddQuickTodo = quickTitle.trim().length > 0;

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
    const nextTodo = { id: Date.now(), title, done: false, startDate: currentIso, status: 'active' as const, tag: 'TODO' };
    rememberTag('TODO');
    updateData((current) => ({ ...current, todos: [nextTodo, ...current.todos] }));
    setQuickTitle('');
  };

  const toggleDone = (id: number) => {
    updateData((current) => ({ ...current, todos: current.todos.map((item) => {
      if (item.id !== id) return item;
      const done = !item.done;
      return { ...item, done, status: done ? 'ended' : 'active', endDate: done ? currentIso : item.endDate, completedAt: done ? currentIso : undefined };
    }) }));
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

  const carryCount = visibleTodos.filter((todo) => !todo.done && todo.startDate < currentIso).length;

  return (
    <aside className={`panel pin ${embedded ? '' : 'pin-standalone'}`}>
      <div className="pin-header"><div><div className="caption">{formatHeaderDate(currentDate)}</div><div className="title">Toodly</div></div><div className="pin-actions"><button className={`icon-btn pin-toggle ${pinAlwaysOnTop ? '' : 'off'}`} aria-label={pinAlwaysOnTop ? '고정핀 해제' : '고정핀 고정'} onClick={togglePinAlwaysOnTop} type="button">📌</button><button className="icon-btn" aria-label="전체화면 열기" onClick={() => void window.toodly?.openMainWindow()} type="button">↗</button></div></div>
      <form className="quick-input" onSubmit={(event) => { event.preventDefault(); addTodo(); }}><input placeholder="할 일을 바로 입력" value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} /><button disabled={!canAddQuickTodo} type="submit">추가</button></form>
      <section className="todo-list">
        {!visibleTodos.length && <div className="empty-card">아직 TODO가 없습니다.</div>}
        {visibleTodos.map((todo) => <div className="todo-block" key={todo.id}><div className={`todo ${!todo.done && todo.startDate < currentIso ? 'carry' : ''} ${selected?.id === todo.id ? 'selected' : ''}`}><input aria-label={`${todo.title} 완료`} type="checkbox" checked={todo.done} onChange={() => toggleDone(todo.id)} /><button className={`todo-text ${todo.done ? 'done' : ''}`} onClick={() => setSelectedId(selected?.id === todo.id ? 0 : todo.id)} type="button"><strong>{todo.title}</strong><span>{todo.done ? '완료됨' : `#${todo.tag ?? 'TODO'}`}</span></button></div>{selected?.id === todo.id && <div className="todo-edit-popover"><div className="caption">TODO 텍스트 클릭</div><div className="title small-title">TODO 수정</div><div className="todo-form"><FieldInput label="내용" value={editTitle} onChange={setEditTitle} /><div className="field">시작일: {selected.startDate}</div><FieldInput label="태그" value={editTag} onChange={setEditTag} placeholder="태그 입력" /><TagSuggest value={editTag} tags={data.tags} todos={data.todos} onPick={setEditTag} /><div className="todo-edit-actions"><button className="secondary-btn" onClick={saveTodo} type="button">저장</button><button className="danger-btn" onClick={deleteTodo} type="button">삭제</button></div></div></div>}</div>)}
      </section>
      <div className="pin-footer"><div className="mini-stat"><b>{data.todos.filter((todo) => !todo.done).length}</b><span>오늘 할 일</span></div><div className="mini-stat"><b>{carryCount}</b><span>이월된 일</span></div></div>
    </aside>
  );
}
