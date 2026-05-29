import type { TagGroup } from '../types';

export function TagTaskList({ groups }: { groups: TagGroup[] }) {
  if (!groups.length) return <div className="empty-text">아직 표시할 작업이 없습니다.</div>;
  return <ul className="title-list">{groups.map((group) => <li key={group.tag}><strong>{group.tag}</strong>{group.tasks.map((task) => <span className="sub-task" key={task}>- {task}</span>)}</li>)}</ul>;
}
