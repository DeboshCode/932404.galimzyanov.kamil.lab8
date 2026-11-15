import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export function createReadingStore(filename) {
    if (filename !== ":memory:") {
        mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    }

    const database = new Database(filename);
    database.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));

    const byId = database.prepare("SELECT id, book_title, pages_read, date, notes FROM reading_logs WHERE id = ?");
    const inPeriod = database.prepare("SELECT id, book_title, pages_read, date, notes FROM reading_logs WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC");
    const insert = database.prepare("INSERT INTO reading_logs (book_title, pages_read, date, notes) VALUES (?, ?, ?, ?)");
    const update = database.prepare("UPDATE reading_logs SET book_title = ?, pages_read = ?, date = ?, notes = ? WHERE id = ?");
    const remove = database.prepare("DELETE FROM reading_logs WHERE id = ?");
    const hasBook = database.prepare("SELECT 1 FROM reading_logs WHERE book_title = ? LIMIT 1");
    const saveGoal = database.prepare("INSERT INTO book_goals (book_title, total_pages) VALUES (?, ?) ON CONFLICT (book_title) DO UPDATE SET total_pages = excluded.total_pages");
    const removeGoal = database.prepare("DELETE FROM book_goals WHERE book_title = ?");
    const statistics = database.prepare(`
        SELECT COALESCE(SUM(pages_read), 0) AS total_pages,
            COUNT(*) AS entries_count,
            COUNT(DISTINCT date) AS reading_days,
            COUNT(DISTINCT book_title) AS books_count
        FROM reading_logs WHERE date BETWEEN ? AND ?
    `);
    const books = database.prepare(`
        WITH period_books AS (
            SELECT book_title, SUM(pages_read) AS period_pages
            FROM reading_logs WHERE date BETWEEN ? AND ? GROUP BY book_title
        ), totals AS (
            SELECT book_title, SUM(pages_read) AS total_read FROM reading_logs GROUP BY book_title
        )
        SELECT period_books.book_title, period_books.period_pages, totals.total_read, book_goals.total_pages
        FROM period_books JOIN totals USING (book_title)
        LEFT JOIN book_goals USING (book_title)
        ORDER BY period_books.period_pages DESC, period_books.book_title
    `);
    const calendar = database.prepare(`
        SELECT date, SUM(pages_read) AS pages_read, COUNT(*) AS entries_count
        FROM reading_logs WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date
    `);

    function getLog(id) {
        return byId.get(id) || null;
    }

    const createLog = database.transaction((log) => {
        const result = insert.run(log.book_title, log.pages_read, log.date, log.notes);

        if (log.total_pages !== undefined) {
            saveGoal.run(log.book_title, log.total_pages);
        }

        return getLog(Number(result.lastInsertRowid));
    });

    const updateLog = database.transaction((id, log) => {
        const result = update.run(log.book_title, log.pages_read, log.date, log.notes, id);

        if (result.changes === 0) {
            return null;
        }

        if (log.total_pages !== undefined) {
            saveGoal.run(log.book_title, log.total_pages);
        }

        return getLog(id);
    });

    const getOverview = database.transaction((period) => ({
        period,
        entries: inPeriod.all(period.start, period.end),
        stats: statistics.get(period.start, period.end),
        books: books.all(period.start, period.end),
        calendar: calendar.all(period.calendar_start, period.calendar_end)
    }));

    function setBookGoal(goal) {
        if (!hasBook.get(goal.book_title)) {
            return null;
        }

        saveGoal.run(goal.book_title, goal.total_pages);
        return goal;
    }

    function deleteBookGoal(bookTitle) {
        if (!hasBook.get(bookTitle)) {
            return false;
        }

        removeGoal.run(bookTitle);
        return true;
    }

    return {
        getLog,
        getOverview,
        createLog,
        updateLog,
        deleteLog: (id) => remove.run(id).changes > 0,
        setBookGoal,
        deleteBookGoal,
        close: () => database.close()
    };
}
