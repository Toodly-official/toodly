const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatHeaderDate(date: Date) {
  return `${toIsoDate(date)} (${weekdayLabels[date.getDay()]})`;
}

export function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

export function startOfWeek(date: Date) {
  const result = new Date(date);
  const diff = result.getDay();
  result.setDate(result.getDate() - diff);
  return result;
}

export function endOfWeek(date: Date) {
  const result = startOfWeek(date);
  result.setDate(result.getDate() + 6);
  return result;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function isBetweenIso(value: string | undefined, start: Date, end: Date) {
  if (!value) return false;
  const date = parseIsoDate(value);
  return date >= start && date <= end;
}

export function formatMonth(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

export function formatShortDate(iso: string) {
  const [, month, day] = iso.split('-');
  return `${month}/${day}`;
}
