import { Hono } from "hono";
import Layout from "../components/Layout";

const home = new Hono();

home.get("/", (c) => {
	const user = c.get("user");
	return c.html(
		<Layout title="Home" currentPath="/" isAdmin={c.get("isAdmin")}>
			<h1>Hallo, {user.username}!</h1>
			<div id="result" />
		</Layout>,
	);
});

export default home;
