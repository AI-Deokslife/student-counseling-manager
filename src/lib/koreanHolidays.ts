import KoreanLunarCalendar from "korean-lunar-calendar";

export interface KoreanHoliday {
  date: string;
  name: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return dateKey(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

function dayOfWeek(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function lunarDate(year: number, month: number, day: number) {
  const calendar = new KoreanLunarCalendar();
  if (!calendar.setLunarDate(year, month, day, false)) return null;
  const solar = calendar.getSolarCalendar();
  return dateKey(solar.year, solar.month, solar.day);
}

function nextWorkingDayAfter(date: string, holidays: Map<string, string>) {
  let candidate = shiftDate(date, 1);
  while (dayOfWeek(candidate) === 0 || holidays.has(candidate)) {
    candidate = shiftDate(candidate, 1);
  }
  return candidate;
}

/** Korea's statutory public holidays, including lunar and substitute holidays. */
export function koreanHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  const add = (date: string | null, name: string) => {
    if (date) holidays.set(date, name);
  };

  const fixedHolidays: Array<[number, number, string]> = [
    [1, 1, "신정"], [3, 1, "삼일절"], [5, 5, "어린이날"],
    [6, 6, "현충일"], [8, 15, "광복절"], [10, 3, "개천절"],
    [10, 9, "한글날"], [12, 25, "성탄절"],
  ];
  fixedHolidays.forEach(([month, day, name]) => add(dateKey(year, month, day), name));

  const lunarNewYear = lunarDate(year, 1, 1);
  const buddhaBirthday = lunarDate(year, 4, 8);
  const chuseok = lunarDate(year, 8, 15);
  add(lunarNewYear && shiftDate(lunarNewYear, -1), "설날 연휴");
  add(lunarNewYear, "설날");
  add(lunarNewYear && shiftDate(lunarNewYear, 1), "설날 연휴");
  add(buddhaBirthday, "부처님오신날");
  add(chuseok && shiftDate(chuseok, -1), "추석 연휴");
  add(chuseok, "추석");
  add(chuseok && shiftDate(chuseok, 1), "추석 연휴");

  for (const date of [
    dateKey(year, 3, 1), dateKey(year, 5, 5), buddhaBirthday,
    dateKey(year, 8, 15), dateKey(year, 10, 3), dateKey(year, 10, 9), dateKey(year, 12, 25),
  ].filter((value): value is string => Boolean(value))) {
    if (dayOfWeek(date) === 0) add(nextWorkingDayAfter(date, holidays), "대체공휴일");
  }

  for (const date of [lunarNewYear, chuseok].filter((value): value is string => Boolean(value))) {
    const period = [shiftDate(date, -1), date, shiftDate(date, 1)];
    if (period.some((day) => dayOfWeek(day) === 0)) {
      add(nextWorkingDayAfter(period[2], holidays), "대체공휴일");
    }
  }

  return holidays;
}
