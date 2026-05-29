import type { ToodlyData } from './types';
import { toIsoDate } from './utils/date';

export const STORAGE_KEY = 'toodly-state-v2';
export const today = new Date();
export const todayIso = toIsoDate(today);
export const initialData: ToodlyData = {
  todos: [],
  tags: ['기획', '기술검토', '기록', '회의', '회사', '회고', '휴일', 'TODO'],
  ai: { auth: { connected: false }, summaries: {} },
};
