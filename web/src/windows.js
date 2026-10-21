// Date windows for the background picker.
// A window is: null (always) · 'any' (milestone, year-round) · {start:'MM-DD', end:'MM-DD'} inclusive,
// end may wrap past Dec. 31 · {rule:'easter', daysBefore, daysAfter} · {rule:'dogParentWeeks', weekEndingOn:[...]}.

const DAY = 86400000;

function ymd(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mmddToDate(year, mmdd) {
  const [m, d] = mmdd.split('-').map(Number);
  return new Date(year, m - 1, d);
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// nth Sunday of a month (1-based), e.g. Mother's Day = 2nd Sunday of May.
function nthSunday(year, month, n) {
  const first = new Date(year, month - 1, 1);
  const offset = (7 - first.getDay()) % 7;
  return new Date(year, month - 1, 1 + offset + 7 * (n - 1));
}

export function mothersDay(year) { return nthSunday(year, 5, 2); }
export function fathersDay(year) { return nthSunday(year, 6, 3); }

function between(today, start, end) {
  const t = today.getTime();
  return t >= start.getTime() && t <= end.getTime() + DAY - 1;
}

export function inWindow(window, today = new Date()) {
  if (window === null || window === undefined) return true;
  if (window === 'any') return true;
  const y = today.getFullYear();
  if (window.rule === 'easter') {
    for (const yr of [y, y + 1]) {
      const e = easterSunday(yr);
      const start = new Date(e.getTime() - (window.daysBefore || 0) * DAY);
      const end = new Date(e.getTime() + (window.daysAfter || 0) * DAY);
      if (between(today, start, end)) return true;
    }
    return false;
  }
  if (window.rule === 'dogParentWeeks') {
    const days = (window.weekEndingOn || []).map((w) => (w === 'mothersDay' ? mothersDay(y) : fathersDay(y)));
    return days.some((d) => between(today, new Date(d.getTime() - 6 * DAY), d));
  }
  if (window.start && window.end) {
    const s = mmddToDate(y, window.start);
    let e = mmddToDate(y, window.end);
    if (e < s) {
      // wraps the year end: in window if after start this year or before end this year
      return today >= s || today <= new Date(e.getTime() + DAY - 1);
    }
    return between(today, s, e);
  }
  return true;
}

export function windowLabel(window) {
  if (window === null || window === undefined) return 'Always';
  if (window === 'any') return 'Any day';
  if (window.rule === 'easter') return 'Easter';
  if (window.rule === 'dogParentWeeks') return 'Mother’s and Father’s Day weeks';
  const mon = ['', 'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
  const f = (s) => { const [m, d] = s.split('-').map(Number); return `${mon[m]} ${d}`; };
  return `${f(window.start)}–${f(window.end)}`;
}

export { ymd };
