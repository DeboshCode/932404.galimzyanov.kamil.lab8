import { isISODate, todayISO, getPeriod } from "./dates.js";

export class ValidationError extends Error {}

function validateObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ValidationError("Передайте объект с данными");
    }
}

export function validateBookTitle(value) {
    if (typeof value !== "string" || value.trim() === "" || value.trim().length > 200) {
        throw new ValidationError("Введите название книги длиной от 1 до 200 символов");
    }

    return value.trim();
}

function validatePages(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new ValidationError(label + " должно быть положительным целым числом");
    }

    return value;
}

export function validateLog(input) {
    validateObject(input);
    const bookTitle = validateBookTitle(input.book_title);
    const pagesRead = validatePages(input.pages_read, "Количество страниц");

    if (!isISODate(input.date)) {
        throw new ValidationError("Укажите существующую дату в формате ГГГГ-ММ-ДД");
    }

    const notes = input.notes === undefined ? "" : input.notes;

    if (typeof notes !== "string" || notes.length > 5000) {
        throw new ValidationError("Заметка должна быть строкой длиной не более 5000 символов");
    }

    const log = { book_title: bookTitle, pages_read: pagesRead, date: input.date, notes };

    if (input.total_pages !== undefined) {
        log.total_pages = validatePages(input.total_pages, "Общее число страниц книги");
    }

    return log;
}

export function validateGoal(input) {
    validateObject(input);
    return {
        book_title: validateBookTitle(input.book_title),
        total_pages: validatePages(input.total_pages, "Общее число страниц книги")
    };
}

export function validatePeriod(query) {
    const type = query.period === undefined ? "month" : query.period;
    const anchor = query.date === undefined ? todayISO() : query.date;

    if (type !== "week" && type !== "month") {
        throw new ValidationError("Период должен быть week или month");
    }

    if (!isISODate(anchor)) {
        throw new ValidationError("Укажите существующую дату в формате ГГГГ-ММ-ДД");
    }

    const period = getPeriod(type, anchor);

    if (![period.start, period.end, period.calendar_start, period.calendar_end].every(isISODate)) {
        throw new ValidationError("Для выбранной даты невозможно построить календарь");
    }

    return period;
}

export function parseId(value) {
    const id = /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}
