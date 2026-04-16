import { Hono } from "hono";
import { validator } from "hono/validator";
import Layout from "../components/Layout";
import { stmts } from "../db";

const AdminPage = ({
	users,
	error,
	success,
}: {
	users: { id: number; username: string; is_admin: number }[];
	error?: string;
	success?: string;
}) => (
	<Layout title="Admin – Nutzerverwaltung" currentPath="/admin" isAdmin>
		<h1>Nutzerverwaltung</h1>

		{error && <p class="text-error">{error}</p>}
		{success && <p class="text-success">{success}</p>}

		<section>
			<h2>Neuen Nutzer anlegen</h2>
			<form method="post" action="/admin/users/create">
				<label>
					Benutzername
					<input type="text" name="username" autocomplete="off" required />
				</label>
				<label>
					Passwort
					<input
						type="password"
						name="password"
						autocomplete="new-password"
						required
					/>
				</label>
				<button type="submit">Anlegen</button>
			</form>
		</section>

		<section>
			<h2>Nutzer</h2>
			<table>
				<thead>
					<tr>
						<th>ID</th>
						<th>Benutzername</th>
						<th>Rolle</th>
						<th>Aktionen</th>
					</tr>
				</thead>
				<tbody>
					{users.map((u) => (
						<tr key={u.id}>
							<td>{u.id}</td>
							<td>{u.username}</td>
							<td>{u.is_admin ? "Admin" : "Nutzer"}</td>
							<td>
								{/* Umbenennen */}
								<form
									method="post"
									action={`/admin/users/${u.id}/rename`}
									class="inline-block"
								>
									<input
										type="text"
										name="username"
										defaultValue={u.username}
										required
										class="input-fixed"
									/>
									<button type="submit">Umbenennen</button>
								</form>

								{/* Passwort zurücksetzen */}
								<form
									method="post"
									action={`/admin/users/${u.id}/reset-password`}
									class="inline-block ml-2"
								>
									<input
										type="password"
										name="password"
										placeholder="Neues Passwort"
										required
										class="input-fixed"
									/>
									<button type="submit">Passwort setzen</button>
								</form>

								{/* Löschen */}
								<form
									method="post"
									action={`/admin/users/${u.id}/delete`}
									class="inline-block ml-2"
								>
									<button
										type="submit"
										_={`on click
                      if not confirm('Nutzer "${u.username}" wirklich löschen?')
                        halt the event
                      end`}
									>
										Löschen
									</button>
								</form>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	</Layout>
);

const admin = new Hono();

admin.get("/admin", (c) => {
	const users = stmts.getAllUsers.all();
	return c.html(<AdminPage users={users} />);
});

// Create user
admin.post(
	"/admin/users/create",
	validator("form", (value, c) => {
		const username = String(value.username ?? "").trim();
		const password = String(value.password ?? "");
		if (!username || !password) {
			const users = stmts.getAllUsers.all();
			return c.html(
				<AdminPage
					users={users}
					error="Benutzername und Passwort erforderlich."
				/>,
				400,
			);
		}
		return { username, password };
	}),
	async (c) => {
		const { username, password } = c.req.valid("form");
		if (stmts.userExists.get(username)) {
			const users = stmts.getAllUsers.all();
			return c.html(
				<AdminPage users={users} error="Benutzername bereits vergeben." />,
				409,
			);
		}
		const hash = await Bun.password.hash(password);
		stmts.createUser.run(username, hash);
		return c.redirect("/admin");
	},
);

// Rename user
admin.post(
	"/admin/users/:id/rename",
	validator("form", (value, c) => {
		const username = String(value.username ?? "").trim();
		if (!username) {
			const users = stmts.getAllUsers.all();
			return c.html(
				<AdminPage users={users} error="Benutzername darf nicht leer sein." />,
				400,
			);
		}
		return { username };
	}),
	(c) => {
		const id = Number(c.req.param("id"));
		const { username } = c.req.valid("form");
		if (!Number.isInteger(id) || id <= 0) {
			return c.text("Ungültige ID", 400);
		}
		if (stmts.userExists.get(username)) {
			const users = stmts.getAllUsers.all();
			return c.html(
				<AdminPage users={users} error="Benutzername bereits vergeben." />,
				409,
			);
		}
		stmts.renameUser.run(username, id);
		return c.redirect("/admin");
	},
);

// Reset password
admin.post(
	"/admin/users/:id/reset-password",
	validator("form", (value, c) => {
		const password = String(value.password ?? "");
		if (!password) {
			const users = stmts.getAllUsers.all();
			return c.html(
				<AdminPage
					users={users}
					error="Neues Passwort darf nicht leer sein."
				/>,
				400,
			);
		}
		return { password };
	}),
	async (c) => {
		const id = Number(c.req.param("id"));
		const { password } = c.req.valid("form");
		if (!Number.isInteger(id) || id <= 0) {
			return c.text("Ungültige ID", 400);
		}
		const hash = await Bun.password.hash(password);
		stmts.updatePassword.run(hash, id);
		// Invalidate all sessions for the affected user so the new password takes effect immediately
		stmts.deleteUserSessions.run(id);
		return c.redirect("/admin");
	},
);

// Delete user
admin.post("/admin/users/:id/delete", (c) => {
	const id = Number(c.req.param("id"));
	if (!Number.isInteger(id) || id <= 0) {
		return c.text("Ungültige ID", 400);
	}
	const currentUser = c.get("user");
	if (currentUser.id === id) {
		const users = stmts.getAllUsers.all();
		return c.html(
			<AdminPage
				users={users}
				error="Du kannst dein eigenes Konto nicht löschen."
			/>,
			400,
		);
	}
	stmts.deleteUser.run(id);
	return c.redirect("/admin");
});

export default admin;
