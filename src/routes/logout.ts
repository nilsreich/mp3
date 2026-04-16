import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { stmts } from "../db";

const logout = new Hono();

logout.post("/logout", (c) => {
	const sessionId = getCookie(c, "session_id");
	if (sessionId) stmts.deleteSession.run(sessionId);
	deleteCookie(c, "session_id", { path: "/" });

	if (c.req.header("HX-Request")) {
		c.header("HX-Redirect", "/login");
		return c.text("ok");
	}
	return c.redirect("/login");
});

export default logout;
