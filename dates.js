const dayMilliseconds = 86400000;

export function isISODate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
        return false;
    }

    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayISO() {
    const date = new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function shiftDate(value, days) {
    return new Date(Date.parse(value + "T00:00:00Z") + days * dayMilliseconds).toISOString().slice(0, 10);
}

export function getPeriod(type, anchor) {
    const date = new Date(anchor + "T00:00:00Z");
    const monthStart = anchor.slice(0, 7) + "-01";
    const lastDay = new Date(date.getTime());
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
    const monthEnd = lastDay.toISOString().slice(0, 10);
    const weekday = (date.getUTCDay() + 6) % 7;
    const start = type === "week" ? shiftDate(anchor, -weekday) : monthStart;
    const end = type === "week" ? shiftDate(start, 6) : monthEnd;
    const firstWeekday = (new Date(monthStart + "T00:00:00Z").getUTCDay() + 6) % 7;
    const calendarStart = shiftDate(monthStart, -firstWeekday);

    return {
        type,
        anchor,
        start,
        end,
        month_start: monthStart,
        calendar_start: calendarStart,
        calendar_end: shiftDate(calendarStart, 41)
    };
}
