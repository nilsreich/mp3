import { Database } from "bun:sqlite";

const DATA_DIR = process.env.DATA_DIR || ".";
export const db = new Database(`${DATA_DIR}/app.db`, { create: true });

db.run("PRAGMA journal_mode=WAL");
db.run("PRAGMA foreign_keys=ON");

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    NOT NULL UNIQUE,
    password  TEXT    NOT NULL,
    is_admin  INTEGER NOT NULL DEFAULT 0
  )
`);

// Migration: add is_admin column to existing databases that predate this column
try {
	db.run("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
} catch {
	// Column already exists — ignore
}

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS files (
    id          TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename    TEXT    NOT NULL,
    size        INTEGER NOT NULL,
    uploaded_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

// All SQL in one place — import stmts everywhere instead of writing raw queries
export const stmts = {
	getUserByUsername: db.query<
		{ id: number; password: string; is_admin: number },
		[string]
	>("SELECT id, password, is_admin FROM users WHERE username = ?"),
	getUserById: db.query<
		{ id: number; username: string; is_admin: number },
		[number]
	>("SELECT id, username, is_admin FROM users WHERE id = ?"),
	userExists: db.query<{ id: number }, [string]>(
		"SELECT id FROM users WHERE username = ?",
	),
	createUser: db.query<void, [string, string]>(
		"INSERT INTO users (username, password) VALUES (?, ?)",
	),
	createAdminUser: db.query<void, [string, string]>(
		"INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)",
	),
	getAllUsers: db.query<{ id: number; username: string; is_admin: number }, []>(
		"SELECT id, username, is_admin FROM users ORDER BY id",
	),
	deleteUser: db.query<void, [number]>("DELETE FROM users WHERE id = ?"),
	renameUser: db.query<void, [string, number]>(
		"UPDATE users SET username = ? WHERE id = ?",
	),
	updatePassword: db.query<void, [string, number]>(
		"UPDATE users SET password = ? WHERE id = ?",
	),
	getSession: db.query<{ id: string; user_id: number }, [string]>(
		"SELECT id, user_id FROM sessions WHERE id = ?",
	),
	insertSession: db.query<void, [string, number]>(
		"INSERT INTO sessions (id, user_id) VALUES (?, ?)",
	),
	deleteSession: db.query<void, [string]>("DELETE FROM sessions WHERE id = ?"),
	deleteUserSessions: db.query<void, [number]>(
		"DELETE FROM sessions WHERE user_id = ?",
	),
	insertFile: db.query<void, [string, number, string, number]>(
		"INSERT INTO files (id, user_id, filename, size) VALUES (?, ?, ?, ?)",
	),
	getFileById: db.query<
		{
			id: string;
			user_id: number;
			filename: string;
			size: number;
			uploaded_at: number;
		},
		[string]
	>("SELECT id, user_id, filename, size, uploaded_at FROM files WHERE id = ?"),
	getFilesByUser: db.query<
		{ id: string; filename: string; size: number; uploaded_at: number },
		[number]
	>(
		"SELECT id, filename, size, uploaded_at FROM files WHERE user_id = ? ORDER BY uploaded_at DESC",
	),
	getAllFiles: db.query<
		{
			id: string;
			user_id: number;
			username: string;
			filename: string;
			size: number;
			uploaded_at: number;
		},
		[]
	>(
		`SELECT f.id, f.user_id, u.username, f.filename, f.size, f.uploaded_at
     FROM files f JOIN users u ON u.id = f.user_id
     ORDER BY f.uploaded_at DESC`,
	),
	deleteFile: db.query<void, [string]>("DELETE FROM files WHERE id = ?"),
};

// Seed a default admin user on first start (password: "changeme")
const existing = db
	.query("SELECT id FROM users WHERE is_admin = 1 LIMIT 1")
	.get();
if (!existing) {
	const hash = Bun.password.hashSync("changeme");
	stmts.createAdminUser.run("admin", hash);
}

// Purge sessions older than 7 days on every startup
db.run("DELETE FROM sessions WHERE created_at < unixepoch() - 604800");

// Graceful shutdown — flush WAL and close DB cleanly
const shutdown = () => {
	db.close();
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
