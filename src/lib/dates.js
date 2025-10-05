// src/lib/dates.js
// Date range parsing utilities

export function parseRange({ from, to, window = '7d' }) {
  const now = new Date();
  let start, end;
  if (from || to) {
    start = from ? new Date(from) : new Date(now.getTime() - 7 * 86400_000);
    end = to ? new Date(to) : now;
  } else {
    const m = String(window || '7d').match(/^(\d+)([dDwW])$/);
    const days = m ? Number(m[1]) * (m[2].toLowerCase() === 'w' ? 7 : 1) : 7;
    start = new Date(now.getTime() - days * 86400_000);
    end = now;
  }
  // clamp invalid
  if (isNaN(start.getTime())) start = new Date(now.getTime() - 7 * 86400_000);
  if (isNaN(end.getTime())) end = now;
  return { start, end };
}
