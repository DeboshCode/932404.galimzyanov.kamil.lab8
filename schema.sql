CREATE TABLE IF NOT EXISTS reading_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_title TEXT NOT NULL CHECK (length(trim(book_title)) > 0),
    pages_read INTEGER NOT NULL CHECK (typeof(pages_read) = 'integer' AND pages_read > 0),
    date TEXT NOT NULL CHECK (length(date) = 10),
    notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS reading_logs_date_idx ON reading_logs(date DESC, id DESC);
CREATE INDEX IF NOT EXISTS reading_logs_book_idx ON reading_logs(book_title);

CREATE TABLE IF NOT EXISTS book_goals (
    book_title TEXT PRIMARY KEY CHECK (length(trim(book_title)) > 0),
    total_pages INTEGER NOT NULL CHECK (typeof(total_pages) = 'integer' AND total_pages > 0)
);
