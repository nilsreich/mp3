import { Hono } from "hono";
import { setCookie } from "hono/cookie";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

import { validator } from "hono/validator";
import Layout from "../components/Layout";
import { stmts } from "../db";

const LoginForm = ({ error }: { error?: string }) => (
	<Layout title="Login" showNav={false}>
		<form
			method="post"
			action="/login"
			_={`
        on submit
          if #login-username's value is '' or #login-password's value is ''
            halt the event
            set #form-error's innerHTML to 'Username and password are required.'
            remove .hidden from #form-error
          end
      `}
		>
			<h1>Login</h1>
			<p id="form-error" class="hidden text-error">
				{error}
			</p>
			<label>
				Username
				<input
					id="login-username"
					type="text"
					name="username"
					autocomplete="username"
				/>
			</label>
			<label>
				Password
				<input
					id="login-password"
					type="password"
					name="password"
					autocomplete="current-password"
				/>
			</label>
			<button type="submit">Sign in</button>
		</form>
	</Layout>
);

const login = new Hono();

login.get("/login", (c) => c.html(<LoginForm />));

login.post(
	"/login",
	validator("form", (value, c) => {
		const username = String(value.username ?? "").trim();
		const password = String(value.password ?? "");
		if (!username || !password) {
			return c.html(
				<LoginForm error="Username and password are required." />,
				400,
			);
		}
		return { username, password };
	}),
	async (c) => {
		const { username, password } = c.req.valid("form");
		const user = stmts.getUserByUsername.get(username);
		if (!user || !(await Bun.password.verify(password, user.password))) {
			return c.html(<LoginForm error="Invalid credentials." />, 401);
		}
		const sessionId = Bun.randomUUIDv7();
		stmts.insertSession.run(sessionId, user.id);
		setCookie(c, "session_id", sessionId, {
			httpOnly: true,
			sameSite: "Lax",
			path: "/",
			maxAge: SESSION_MAX_AGE_SECONDS,
		});
		return c.redirect("/");
	},
);

export default login;
