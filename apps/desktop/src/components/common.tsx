export function FieldInput(props: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="field input-field"><span>{props.label}</span><input type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder} /></label>;
}

export function FieldTextArea(props: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field input-field"><span>{props.label}</span><textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder="메모" /></label>;
}

export function RepeatSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="field input-field"><span>반복</span><select value={value} onChange={(event) => onChange(event.target.value)}><option>없음</option><option>매일</option><option>매주</option><option>매월</option></select></label>;
}
