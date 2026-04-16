import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { stmts } from "../db";

type User = { id: number; username: string; is_admin: number };

declare module "hono" {
	interface ContextVariableMap {
		user: User;
		isAdmin: boolean;
	}
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
	const sessionId = getCookie(c, "session_id");

	// Helfer-Funktion für saubere Redirects in HTMX
	const reject = () => {
		if (c.req.header("HX-Request")) {
			c.header("HX-Redirect", "/login");
			return c.text("Unauthorized", 401);
		}
		return c.redirect("/login");
	};

	if (!sessionId) return reject();
	const session = stmts.getSession.get(sessionId);
	if (!session) return reject();

	const user = stmts.getUserById.get(session.user_id);
	if (!user) return reject();

	c.set("user", user);
	c.set("isAdmin", user.is_admin === 1);
	c.header("Cache-Control", "no-store");
	await next();
};

export const adminMiddleware: MiddlewareHandler = async (c, next) => {
	if (!c.get("isAdmin")) {
		return c.text("Forbidden", 403);
	}
	await next();
};
