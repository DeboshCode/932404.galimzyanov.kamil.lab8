const elements = Object.fromEntries([
    "add-log", "add-empty", "anchor-date", "previous-period", "next-period", "today",
    "period-heading", "message", "loading-status", "report", "total-pages", "reading-days",
    "books-count", "entries-count", "calendar-month", "calendar-days", "books-list", "books-empty",
    "journal-heading", "clear-day", "list-caption", "logs-list", "logs-empty", "log-dialog",
    "dialog-heading", "close-dialog", "log-form", "book-title", "pages-read", "log-date",
    "log-notes", "book-total", "form-error", "save-log", "cancel-dialog", "delete-dialog",
    "delete-description", "delete-error", "confirm-delete", "cancel-delete"
].map((id) => [id, document.getElementById(id)]));

const numberFormat = new Intl.NumberFormat("ru-RU");
const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
const state = { period: "month", anchor: todayISO(), selectedDay: null, data: null, editingId: null, deletingLog: null, saving: false, deleting: false, requestId: 0 };

function todayISO() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

function dateObject(value) {
    return new Date(value + "T00:00:00Z");
}

function formatDate(value) {
    return dateFormat.format(dateObject(value));
}

function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function showMessage(text, error = false) {
    elements.message.textContent = text;
    elements.message.classList.toggle("error", error);
}

async function request(url, options = {}) {
    let response;

    try {
        response = await fetch(url, options);
    } catch {
        throw new Error("Не удалось связаться с сервером. Проверьте подключение и повторите попытку.");
    }

    if (response.status === 204) return null;

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось выполнить запрос.");
    return data;
}

function jsonOptions(method, value) {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) };
}

async function loadOverview() {
    const requestId = ++state.requestId;
    elements.report.setAttribute("aria-busy", "true");
    elements["loading-status"].textContent = "Загрузка дневника…";

    try {
        const query = new URLSearchParams({ period: state.period, date: state.anchor });
        const data = await request("/api/reading-logs?" + query);
        if (requestId !== state.requestId) return;
        state.data = data;
        renderOverview(data);
        if (elements.message.classList.contains("error")) showMessage("");
        elements["loading-status"].textContent = "Дневник обновлён.";
    } catch (error) {
        if (requestId === state.requestId) {
            showMessage(error.message + (state.data ? " Показаны ранее загруженные данные." : ""), true);
            elements["loading-status"].textContent = "Не удалось загрузить дневник.";
        }
    } finally {
        if (requestId === state.requestId) elements.report.setAttribute("aria-busy", "false");
    }
}

function renderOverview(data) {
    if (state.selectedDay && (state.selectedDay < data.period.start || state.selectedDay > data.period.end)) state.selectedDay = null;
    elements["period-heading"].textContent = data.period.type === "month"
        ? monthFormat.format(dateObject(data.period.anchor))
        : formatDate(data.period.start) + " — " + formatDate(data.period.end);
    elements["total-pages"].textContent = numberFormat.format(data.stats.total_pages);
    elements["reading-days"].textContent = numberFormat.format(data.stats.reading_days);
    elements["books-count"].textContent = numberFormat.format(data.stats.books_count);
    elements["entries-count"].textContent = numberFormat.format(data.stats.entries_count);
    elements["previous-period"].setAttribute("aria-label", state.period === "week" ? "Предыдущая неделя" : "Предыдущий месяц");
    elements["next-period"].setAttribute("aria-label", state.period === "week" ? "Следующая неделя" : "Следующий месяц");
    renderCalendar(data);
    renderBooks(data);
    renderEntries(data);
}

function renderCalendar(data) {
    const days = new Map(data.calendar.map((day) => [day.date, day]));
    const first = dateObject(data.period.calendar_start);
    const fragment = document.createDocumentFragment();
    elements["calendar-month"].textContent = monthFormat.format(dateObject(data.period.month_start));
    elements["calendar-days"].setAttribute("aria-label", "Календарь: " + elements["calendar-month"].textContent);

    for (let index = 0; index < 42; index++) {
        const date = new Date(first.getTime() + index * 86400000);
        const value = isoDate(date);
        const day = days.get(value);
        const button = node("button", "calendar-day");
        button.type = "button";
        button.dataset.date = value;
        button.classList.toggle("outside-month", value.slice(0, 7) !== data.period.anchor.slice(0, 7));
        button.classList.toggle("in-period", value >= data.period.start && value <= data.period.end);
        button.classList.toggle("has-reading", Boolean(day));
        button.setAttribute("aria-pressed", String(value === state.selectedDay));
        button.setAttribute("aria-label", formatDate(value) + (day ? ", прочитано страниц: " + day.pages_read : ", нет записей"));
        if (value === todayISO()) button.setAttribute("aria-current", "date");
        button.append(node("span", "", String(date.getUTCDate())));
        button.append(node("span", "day-pages", day ? numberFormat.format(day.pages_read) : "\u00a0"));
        button.addEventListener("click", () => selectDay(value));
        fragment.append(button);
    }

    elements["calendar-days"].replaceChildren(fragment);
}

function selectDay(value) {
    state.selectedDay = value;

    if (!state.data || value < state.data.period.start || value > state.data.period.end) {
        state.anchor = value;
        elements["anchor-date"].value = value;
        loadOverview();
    } else {
        renderCalendar(state.data);
        renderEntries(state.data);
    }
}

function createGoalForm(book) {
    const details = node("details");
    details.append(node("summary", "", book.total_pages ? "Изменить объём книги" : "Указать объём книги"));
    const form = node("form", "goal-form");
    const label = node("label", "", "Всего страниц в книге");
    const input = node("input");
    input.type = "number";
    input.min = "1";
    input.max = String(Number.MAX_SAFE_INTEGER);
    input.step = "1";
    input.required = true;
    input.setAttribute("aria-label", "Объём книги «" + book.book_title + "»");
    input.value = book.total_pages || "";
    label.append(input);
    const save = node("button", "", "Сохранить");
    save.type = "submit";
    const error = node("p", "goal-error");
    error.setAttribute("role", "alert");
    form.append(label, save);

    if (book.total_pages) {
        const clear = node("button", "secondary", "Убрать цель");
        clear.type = "button";
        clear.addEventListener("click", () => saveGoal(book.book_title, null, form, error));
        form.append(clear);
    }

    form.append(error);
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const pages = Number(input.value);
        if (!Number.isSafeInteger(pages) || pages <= 0) {
            error.textContent = "Введите положительное целое число страниц.";
            return;
        }
        saveGoal(book.book_title, pages, form, error);
    });
    details.append(form);
    return details;
}

async function saveGoal(bookTitle, totalPages, form, errorElement) {
    const buttons = [...form.querySelectorAll("button")];
    buttons.forEach((button) => { button.disabled = true; });
    errorElement.textContent = "";

    try {
        if (totalPages === null) {
            await request("/api/book-goals?" + new URLSearchParams({ book_title: bookTitle }), { method: "DELETE" });
        } else {
            await request("/api/book-goals", jsonOptions("PUT", { book_title: bookTitle, total_pages: totalPages }));
        }
        showMessage(totalPages === null ? "Объём книги сброшен." : "Объём книги сохранён.");
        await loadOverview();
        const updatedCard = [...elements["books-list"].children].find((card) => card.dataset.bookTitle === bookTitle);
        if (updatedCard) updatedCard.querySelector("summary").focus({ preventScroll: true });
    } catch (error) {
        errorElement.textContent = error.message;
    } finally {
        buttons.forEach((button) => { button.disabled = false; });
    }
}

function renderBooks(data) {
    const fragment = document.createDocumentFragment();
    elements["books-empty"].hidden = data.books.length !== 0;

    for (const book of data.books) {
        const card = node("article", "book-card");
        card.dataset.bookTitle = book.book_title;
        card.append(node("h3", "", book.book_title));
        card.append(node("p", "book-period", "За период: " + numberFormat.format(book.period_pages) + " стр."));
        const progress = node("progress", "book-progress");
        progress.max = book.total_pages || 1;
        progress.value = book.total_pages ? Math.min(book.total_read, book.total_pages) : 0;
        progress.setAttribute("aria-label", "Прогресс по книге «" + book.book_title + "»");
        const caption = book.total_pages
            ? numberFormat.format(book.total_read) + " из " + numberFormat.format(book.total_pages) + " стр. · " + Math.min(100, Math.round(book.total_read / book.total_pages * 100)) + "%"
            : "Всего прочитано: " + numberFormat.format(book.total_read) + " стр. Объём книги не задан.";
        progress.setAttribute("aria-valuetext", caption);
        card.append(progress, node("p", "progress-caption", caption), createGoalForm(book));
        fragment.append(card);
    }

    elements["books-list"].replaceChildren(fragment);
}

function renderEntries(data) {
    const entries = state.selectedDay ? data.entries.filter((entry) => entry.date === state.selectedDay) : data.entries;
    elements["journal-heading"].textContent = state.selectedDay ? "Записи за " + formatDate(state.selectedDay) : "Записи за период";
    elements["list-caption"].textContent = "Записей: " + entries.length + (state.selectedDay ? ". Статистика выше относится ко всему периоду." : ". Сначала новые.");
    elements["clear-day"].hidden = state.selectedDay === null;
    elements["logs-empty"].hidden = entries.length !== 0;
    const fragment = document.createDocumentFragment();

    for (const entry of entries) {
        const item = node("li");
        const article = node("article", "log-card");
        article.dataset.id = String(entry.id);
        const heading = node("div", "log-heading");
        const title = node("div");
        const date = node("time", "log-date", formatDate(entry.date));
        date.dateTime = entry.date;
        title.append(node("h3", "", entry.book_title), date);
        heading.append(title, node("span", "pages-badge", "+" + numberFormat.format(entry.pages_read) + " стр."));
        article.append(heading);
        if (entry.notes) article.append(node("p", "log-notes", entry.notes));
        const actions = node("div", "actions");
        const edit = node("button", "secondary", "Изменить");
        edit.type = "button";
        edit.setAttribute("aria-label", "Изменить запись «" + entry.book_title + "» за " + formatDate(entry.date));
        edit.addEventListener("click", () => openEditor(entry));
        const remove = node("button", "secondary", "Удалить");
        remove.type = "button";
        remove.setAttribute("aria-label", "Удалить запись «" + entry.book_title + "» за " + formatDate(entry.date));
        remove.addEventListener("click", () => openDelete(entry));
        actions.append(edit, remove);
        article.append(actions);
        item.append(article);
        fragment.append(item);
    }

    elements["logs-list"].replaceChildren(fragment);
}

function openEditor(entry = null) {
    state.editingId = entry ? entry.id : null;
    elements["log-form"].reset();
    elements["form-error"].textContent = "";
    elements["book-title"].setCustomValidity("");
    elements["dialog-heading"].textContent = entry ? "Редактирование записи" : "Новая запись";
    elements["save-log"].textContent = entry ? "Сохранить изменения" : "Добавить запись";
    elements["book-title"].value = entry ? entry.book_title : "";
    elements["pages-read"].value = entry ? entry.pages_read : "";
    elements["log-date"].value = entry ? entry.date : state.selectedDay || todayISO();
    elements["log-notes"].value = entry ? entry.notes : "";
    const book = entry && state.data ? state.data.books.find((item) => item.book_title === entry.book_title) : null;
    elements["book-total"].value = book && book.total_pages ? book.total_pages : "";
    elements["log-dialog"].showModal();
    elements["book-title"].focus();
}

async function submitLog(event) {
    event.preventDefault();
    if (state.saving) return;
    const bookTitle = elements["book-title"].value.trim();

    if (!bookTitle) {
        elements["form-error"].textContent = "Введите название книги.";
        elements["book-title"].focus();
        return;
    }

    const pagesRead = Number(elements["pages-read"].value);
    const totalValue = elements["book-total"].value;
    const totalPages = totalValue === "" ? undefined : Number(totalValue);

    if (!Number.isSafeInteger(pagesRead) || pagesRead <= 0 || (totalPages !== undefined && (!Number.isSafeInteger(totalPages) || totalPages <= 0))) {
        elements["form-error"].textContent = "Число страниц должно быть положительным целым числом.";
        return;
    }

    const log = { book_title: bookTitle, pages_read: pagesRead, date: elements["log-date"].value, notes: elements["log-notes"].value };
    if (totalPages !== undefined) log.total_pages = totalPages;
    const isEditing = state.editingId !== null;
    state.saving = true;
    elements["form-error"].textContent = "";
    elements["log-dialog"].querySelectorAll("button").forEach((button) => { button.disabled = true; });

    try {
        const saved = await request("/api/reading-logs" + (isEditing ? "/" + state.editingId : ""), jsonOptions(isEditing ? "PUT" : "POST", log));
        elements["log-dialog"].close();
        showMessage(isEditing ? "Изменения сохранены." : "Запись добавлена.");
        await loadOverview();
        const savedCard = [...elements["logs-list"].querySelectorAll("article")].find((card) => card.dataset.id === String(saved.id));
        if (savedCard) savedCard.querySelector("button").focus({ preventScroll: true });
        else elements["journal-heading"].focus({ preventScroll: true });
    } catch (error) {
        elements["form-error"].textContent = error.message;
    } finally {
        state.saving = false;
        elements["log-dialog"].querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
}

function openDelete(entry) {
    state.deletingLog = entry;
    elements["delete-description"].textContent = "«" + entry.book_title + "», " + formatDate(entry.date) + ", " + numberFormat.format(entry.pages_read) + " стр. Запись будет удалена из дневника.";
    elements["delete-error"].textContent = "";
    elements["delete-dialog"].showModal();
    elements["cancel-delete"].focus();
}

async function confirmDelete() {
    if (state.deleting || !state.deletingLog) return;
    state.deleting = true;
    elements["delete-dialog"].querySelectorAll("button").forEach((button) => { button.disabled = true; });

    try {
        await request("/api/reading-logs/" + state.deletingLog.id, { method: "DELETE" });
        elements["delete-dialog"].close();
        showMessage("Запись удалена.");
        await loadOverview();
        elements["journal-heading"].focus({ preventScroll: true });
    } catch (error) {
        elements["delete-error"].textContent = error.message;
    } finally {
        state.deleting = false;
        elements["delete-dialog"].querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
}

function movePeriod(direction) {
    const date = dateObject(state.anchor);
    if (state.period === "week") date.setUTCDate(date.getUTCDate() + direction * 7);
    else {
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + direction);
    }
    state.anchor = isoDate(date);
    state.selectedDay = null;
    elements["anchor-date"].value = state.anchor;
    loadOverview();
}

function keepDialogFocus(event) {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled])")]
        .filter((control) => control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function start() {
    elements["anchor-date"].value = state.anchor;
    elements["add-log"].addEventListener("click", () => openEditor());
    elements["add-empty"].addEventListener("click", () => openEditor());
    elements["log-form"].addEventListener("submit", submitLog);
    elements["close-dialog"].addEventListener("click", () => elements["log-dialog"].close());
    elements["cancel-dialog"].addEventListener("click", () => elements["log-dialog"].close());
    elements["log-dialog"].addEventListener("cancel", (event) => { if (state.saving) event.preventDefault(); });
    elements["delete-dialog"].addEventListener("cancel", (event) => { if (state.deleting) event.preventDefault(); });
    elements["log-dialog"].addEventListener("keydown", keepDialogFocus);
    elements["delete-dialog"].addEventListener("keydown", keepDialogFocus);
    elements["confirm-delete"].addEventListener("click", confirmDelete);
    elements["cancel-delete"].addEventListener("click", () => elements["delete-dialog"].close());
    elements["previous-period"].addEventListener("click", () => movePeriod(-1));
    elements["next-period"].addEventListener("click", () => movePeriod(1));
    elements["today"].addEventListener("click", () => {
        state.anchor = todayISO();
        state.selectedDay = null;
        elements["anchor-date"].value = state.anchor;
        loadOverview();
    });
    elements["anchor-date"].addEventListener("change", () => {
        if (!elements["anchor-date"].value || !elements["anchor-date"].checkValidity()) return;
        state.anchor = elements["anchor-date"].value;
        state.selectedDay = null;
        loadOverview();
    });
    document.querySelectorAll('input[name="period"]').forEach((input) => input.addEventListener("change", () => {
        state.period = input.value;
        state.selectedDay = null;
        loadOverview();
    }));
    elements["clear-day"].addEventListener("click", () => {
        state.selectedDay = null;
        if (state.data) {
            renderCalendar(state.data);
            renderEntries(state.data);
        }
    });
    loadOverview();
}

if (Object.values(elements).every(Boolean)) start();
else console.error("Не найдены элементы дневника чтения");
