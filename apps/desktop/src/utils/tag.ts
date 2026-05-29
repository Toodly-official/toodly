import { today } from '../constants';
import type { TagGroup, Todo } from '../types';
import { todoOverlaps } from './todo';

export function getRecentTagCounts(todos: Todo[]) {
  const recentStart = new Date(today);
  recentStart.setMonth(recentStart.getMonth() - 1);
  const counts = new Map<string, number>();
  todos.forEach((todo) => {
    const tag = todo.tag?.trim();
    if (!tag || !todoOverlaps(todo, recentStart, today)) return;
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  });
  return counts;
}

export function getSuggestions(value: string, tags: string[], todos: Todo[]) {
  const keyword = value.trim().toLowerCase();
  const recentCounts = getRecentTagCounts(todos);
  return tags
    .map((tag, index) => ({ tag, index, count: recentCounts.get(tag) ?? 0 }))
    .filter(({ tag }) => !keyword || tag.toLowerCase().includes(keyword) || keyword.includes(tag[0]?.toLowerCase() ?? ''))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, 3)
    .map(({ tag }) => tag);
}

export function groupByTag(items: Array<{ tag?: string; title: string }>): TagGroup[] {
  const map = new Map<string, string[]>();
  items.forEach((item) => {
    const key = `#${item.tag?.trim() || '태그없음'}`;
    map.set(key, [...(map.get(key) ?? []), item.title]);
  });
  return Array.from(map.entries()).map(([tag, tasks]) => ({ tag, tasks }));
}
