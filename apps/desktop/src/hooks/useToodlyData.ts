import { useEffect, useState } from 'react';
import { initialData, STORAGE_KEY, todayIso } from '../constants';
import type { PersistedToodlyData, Todo, ToodlyData } from '../types';

function normalizeTodo(todo: Partial<Todo> & { createdAt?: string }): Todo {
  const startDate = todo.startDate ?? todo.createdAt ?? todayIso;
  return {
    id: todo.id ?? Date.now(),
    title: todo.title ?? '',
    done: todo.done ?? false,
    startDate,
    endDate: todo.endDate,
    status: todo.status ?? (todo.done ? 'ended' : 'active'),
    completedAt: todo.completedAt,
    tag: todo.tag,
    memo: todo.memo,
  };
}

function normalizeData(data: PersistedToodlyData): ToodlyData {
  const todos = (data.todos ?? []).map(normalizeTodo);
  return { todos, tags: data.tags ?? initialData.tags, ai: data.ai ?? { auth: { connected: false }, summaries: {} } };
}

function localLoad() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeData(JSON.parse(saved) as PersistedToodlyData) : initialData;
  } catch {
    return initialData;
  }
}

export function useToodlyData() {
  const [data, setData] = useState<ToodlyData>(localLoad);

  useEffect(() => {
    void window.toodly?.getData().then(setData).catch(() => undefined);
    return window.toodly?.onDataUpdated((next) => setData(next));
  }, []);

  const updateData = (updater: (current: ToodlyData) => ToodlyData) => {
    setData((current) => {
      const next = normalizeData(updater(current));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      void window.toodly?.setData(next).catch((error) => console.error('Toodly data save failed', error));
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
