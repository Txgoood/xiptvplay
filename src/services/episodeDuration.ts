/**
 * Xtream providers expose episode runtime as HH:MM:SS, minutes, or seconds.
 * Missing and zero metadata are not real durations and must stay blank.
 */
export function normalizeEpisodeDuration(...values: Array<{ value: unknown; unit?: 'seconds' | 'minutes' }>): string | undefined {
  for (const candidate of values) {
    const raw = candidate.value;
    if (raw === null || raw === undefined || raw === '') continue;
    const text = String(raw).trim();
    if (!text || /^(?:0+(?::0+){0,2}|n\/a|null|unknown)$/i.test(text)) continue;
    const clock = text.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
    let seconds: number | undefined;
    if (clock) {
      const a = Number(clock[1]), b = Number(clock[2]), c = clock[3] === undefined ? undefined : Number(clock[3]);
      if (b > 59 || (c !== undefined && c > 59)) continue;
      seconds = c === undefined ? a * 60 + b : a * 3600 + b * 60 + c;
    } else if (/^\d+(?:\.\d+)?$/.test(text)) {
      const number = Number(text);
      seconds = candidate.unit === 'seconds' ? number : number * 60;
    } else {
      const minutes = text.match(/^(\d+(?:\.\d+)?)\s*(?:dk|dakika|min|minutes?)$/i);
      if (minutes) seconds = Number(minutes[1]) * 60;
    }
    if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) continue;
    const rounded = Math.round(seconds);
    const h = Math.floor(rounded / 3600), m = Math.floor((rounded % 3600) / 60), s = rounded % 60;
    return h > 0
      ? [h, m, s].map((v, i) => i ? String(v).padStart(2, '0') : String(v)).join(':')
      : [m, s].map(v => String(v).padStart(2, '0')).join(':');
  }
  return undefined;
}

export function formatRuntimeMinutes(value: unknown): string | undefined {
  const duration = normalizeEpisodeDuration({ value });
  if (!duration) return undefined;
  const seconds = duration.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  return seconds > 0 ? `${Math.max(1, Math.round(seconds / 60))} dk` : undefined;
}
