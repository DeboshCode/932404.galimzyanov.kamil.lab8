import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReadingStore } from "./database.js";
import { ValidationError, validateLog, validateGoal, validateBookTitle, validatePeriod, parseId } from "./validation.js";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createApp(databasePath = path.join(projectDirectory, "data", "reading.sqlite")) {
    const app = express();
    const store = createReadingStore(databasePath);
    app.disable("x-powered-by");
    app.use("/api", (request, response, next) => {
        response.set("Cache-Control", "no-store");
        next();
    });
    app.use(express.json({ limit: "128kb" }));

    app.get("/api/reading-logs", (request, response) => {
        response.json(store.getOverview(validatePeriod(request.query)));
    });

    app.get("/api/reading-logs/:id", (request, response) => {
        const id = parseId(request.params.id);
        const log = id === null ? null : store.getLog(id);

        if (!log) {
            return response.status(404).json({ error: "Запись не найдена" });
        }

        response.json(log);
    });

    app.post("/api/reading-logs", (request, response) => {
        const log = store.createLog(validateLog(request.body));
        response.status(201).location("/api/reading-logs/" + log.id).json(log);
    });

    app.put("/api/reading-logs/:id", (request, response) => {
        const id = parseId(request.params.id);

        if (id === null || !store.getLog(id)) {
            return response.status(404).json({ error: "Запись не найдена" });
        }

        response.json(store.updateLog(id, validateLog(request.body)));
    });

    app.delete("/api/reading-logs/:id", (request, response) => {
        const id = parseId(request.params.id);

        if (id === null || !store.deleteLog(id)) {
            return response.status(404).json({ error: "Запись не найдена" });
        }

        response.status(204).end();
    });

    app.put("/api/book-goals", (request, response) => {
        const goal = store.setBookGoal(validateGoal(request.body));

        if (!goal) {
            return response.status(404).json({ error: "Сначала добавьте запись по этой книге" });
        }

        response.json(goal);
    });

    app.delete("/api/book-goals", (request, response) => {
        const bookTitle = validateBookTitle(request.query.book_title);

        if (!store.deleteBookGoal(bookTitle)) {
            return response.status(404).json({ error: "Книга не найдена" });
        }

        response.status(204).end();
    });

    app.use(express.static(path.join(projectDirectory, "public")));
    app.use((request, response) => response.status(404).json({ error: "Страница не найдена" }));
    app.use((error, request, response, next) => {
        if (error instanceof ValidationError) {
            return response.status(400).json({ error: error.message });
        }

        if (error.type === "entity.parse.failed") {
            return response.status(400).json({ error: "Некорректный JSON" });
        }

        if (error.type === "entity.too.large") {
            return response.status(413).json({ error: "Слишком большой запрос" });
        }

        console.error(error.message);
        response.status(500).json({ error: "Не удалось выполнить запрос. Попробуйте ещё раз." });
    });

    return { app, store };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port = Number(process.env.PORT || 3000);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        console.error("Некорректный номер порта");
        process.exitCode = 1;
    } else {
        const { app, store } = createApp(process.env.DATABASE_PATH || path.join(projectDirectory, "data", "reading.sqlite"));
        const server = app.listen(port, "127.0.0.1", () => console.log("Server started on http://localhost:" + port));
        server.on("error", (error) => {
            console.error(error.code === "EADDRINUSE" ? "Порт " + port + " уже занят" : error.message);
            store.close();
            process.exitCode = 1;
        });
        const shutdown = () => server.close(() => store.close());
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
    }
}
