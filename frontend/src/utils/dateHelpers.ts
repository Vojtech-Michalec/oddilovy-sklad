export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toIsoDate(d);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function formatCz(dateStr: string | null | undefined): string {
  if (!dateStr) return 'neurčito';
  const [y, m, d] = dateStr.split('-');
  if (y && m && d) return `${parseInt(d, 10)}.${parseInt(m, 10)}.${y}`;
  return new Date(dateStr).toLocaleDateString('cs-CZ');
}
