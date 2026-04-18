import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { compress } from "hono/compress";
import { csrf } from "hono/csrf";
import { etag } from "hono/etag";
import { secureHeaders } from "hono/secure-headers";

import { adminMiddleware, authMiddleware } from "./middleware/auth";
import admin from "./routes/admin";
import chat, { chatStream } from "./routes/chat";
import files from "./routes/files";
import home from "./routes/home";
import llm, { llmStream } from "./routes/llm";
import login from "./routes/login";
import logout from "./routes/logout";
import profile from "./routes/profile";

const app = new Hono();

// SSE stream must be mounted before compress/etag (they buffer the response)
app.use("/chat/:id/stream", authMiddleware);
app.route("/", chatStream);

// LLM streaming endpoint (also before compress/etag)
app.use("/llm/stream", authMiddleware);
app.route("/", llmStream);

// Global middlewares — order matters
app.use(compress());
app.use(secureHeaders());
app.use(etag());
app.use(
	csrf({
		// Allow same-origin form posts; block cross-origin requests
		origin: (origin, c) => {
			const host = c.req.header("host");
			return !origin || new URL(origin).host === host;
		},
	}),
);

// Static assets — immutable cache for vendored files, short cache for sw.js
app.use(
	"/public/*",
	serveStatic({
		root: "./src",
		onFound: (path, c) => {
			if (path.endsWith("/sw.js")) {
				c.header("Cache-Control", "public, max-age=0, must-revalidate");
			} else {
				c.header("Cache-Control", "public, max-age=31536000, immutable");
			}
		},
	}),
);

// Public auth routes
app.route("/", login);
app.route("/", logout);

// Protected routes
app.use("/*", authMiddleware);
app.route("/", home);
app.route("/", profile);
app.route("/", files);
app.route("/", chat);
app.route("/", llm);

// Admin-only routes
app.use("/admin/*", adminMiddleware);
app.route("/", admin);

export default app;
