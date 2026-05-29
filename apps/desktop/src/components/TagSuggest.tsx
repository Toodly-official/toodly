import type { Todo } from '../types';
import { getSuggestions } from '../utils/tag';

export function TagSuggest({ value, tags, todos, onPick }: { value: string; tags: string[]; todos: Todo[]; onPick: (tag: string) => void }) {
  return (
    <div className="tag-suggest">
      <div className="tag-suggest-label">태그 추천</div>
      <div className="tag-chips">
        {getSuggestions(value, tags, todos).map((tag) => <button className="tag-chip" key={tag} onClick={() => onPick(tag)} type="button">{tag}</button>)}
      </div>
      <div className="tag-help">선택 없이 저장하면 입력한 값이 새 태그로 저장됩니다.</div>
    </div>
  );
}
