import { Hono } from "hono";
import { validator } from "hono/validator";
import Layout from "../components/Layout";
import { stmts } from "../db";

const ProfilePage = ({
	error,
	success,
	isAdmin,
}: {
	error?: string;
	success?: string;
	isAdmin?: boolean;
}) => (
	<Layout
		title="Profil – Passwort ändern"
		currentPath="/profile"
		isAdmin={isAdmin}
	>
		<h1>Passwort ändern</h1>

		{error && <p class="text-error">{error}</p>}
		{success && <p class="text-success">{success}</p>}

		<form method="post" action="/profile/password">
			<label>
				Aktuelles Passwort
				<input
					type="password"
					name="current_password"
					autocomplete="current-password"
					required
				/>
			</label>
			<label>
				Neues Passwort
				<input
					type="password"
					name="new_password"
					autocomplete="new-password"
					required
				/>
			</label>
			<label>
				Neues Passwort bestätigen
				<input
					type="password"
					name="confirm_password"
					autocomplete="new-password"
					required
				/>
			</label>
			<button type="submit">Passwort ändern</button>
		</form>
	</Layout>
);

const profile = new Hono();

profile.get("/profile", (c) => {
	return c.html(<ProfilePage isAdmin={c.get("isAdmin")} />);
});

profile.post(
	"/profile/password",
	validator("form", (value, c) => {
		const current_password = String(value.current_password ?? "");
		const new_password = String(value.new_password ?? "");
		const confirm_password = String(value.confirm_password ?? "");
		if (!current_password || !new_password || !confirm_password) {
			return c.html(
				<ProfilePage
					error="Alle Felder sind erforderlich."
					isAdmin={c.get("isAdmin")}
				/>,
				400,
			);
		}
		if (new_password !== confirm_password) {
			return c.html(
				<ProfilePage
					error="Neue Passwörter stimmen nicht überein."
					isAdmin={c.get("isAdmin")}
				/>,
				400,
			);
		}
		return { current_password, new_password };
	}),
	async (c) => {
		const { current_password, new_password } = c.req.valid("form");
		const currentUser = c.get("user");

		const userRecord = stmts.getUserByUsername.get(currentUser.username);
		if (
			!userRecord ||
			!(await Bun.password.verify(current_password, userRecord.password))
		) {
			return c.html(
				<ProfilePage
					error="Aktuelles Passwort ist falsch."
					isAdmin={c.get("isAdmin")}
				/>,
				401,
			);
		}

		const hash = await Bun.password.hash(new_password);
		stmts.updatePassword.run(hash, currentUser.id);
		return c.html(
			<ProfilePage
				success="Passwort erfolgreich geändert."
				isAdmin={c.get("isAdmin")}
			/>,
		);
	},
);

export default profile;
