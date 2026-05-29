import type { AiSummary, TagGroup } from '../types';

export function buildLocalAiSummary(range: 'week' | 'month', doneGroups: TagGroup[], nextGroups: TagGroup[]): AiSummary {
  return {
    id: `${range}-${Date.now()}`,
    range,
    provider: 'local',
    createdAt: new Date().toISOString(),
    doneLines: doneGroups.length ? doneGroups.map((group) => `${group.tag}: ${group.tasks.join(', ')} 작업을 정리했습니다.`) : ['완료된 작업이 없습니다.'],
    nextLines: nextGroups.length ? nextGroups.map((group) => `${group.tag}: ${group.tasks.join(', ')} 작업을 이어갑니다.`) : ['예정 작업이 없습니다.'],
  };
}
