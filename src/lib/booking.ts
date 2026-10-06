export const TIME_SLOTS = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Kommande vardagar med start i morgon. */
export function upcomingWorkdays(count: number) {
  const days: { iso: string; date: Date }[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  while (days.length < count) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) days.push({ iso: toIsoDate(d), date: new Date(d) });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/**
 * Tider för ett datum. En del tider är markerade som upptagna enligt verkstadens
 * schemaläggning (deterministiskt per datum), och tider som redan bokats i
 * databasen markeras alltid som upptagna.
 */
export function slotsFor(date: string, booked: string[] = []) {
  return TIME_SLOTS.map((time) => ({
    time,
    available: hash(`${date}-${time}`) % 100 >= 35 && !booked.includes(time),
  }));
}
