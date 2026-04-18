import type { FC } from "hono/jsx";

type NavProps = {
	current: string;
	isAdmin?: boolean;
};

const Nav: FC<NavProps> = ({ current, isAdmin }) => {
	const links = [
		{ href: "/", label: "Home" },
		{ href: "/chat", label: "Chat" },
		{ href: "/files", label: "Dateien" },
		{ href: "/llm", label: "LLM" },
		{ href: "/profile", label: "Profil" },
	];

	if (isAdmin) {
		links.push({ href: "/admin", label: "Nutzerverwaltung" });
	}

	return (
		<nav class="site-nav" aria-label="Hauptnavigation">
			<ul preload>
				{links.map((link) => (
					<li key={link.href}>
						<a
							href={link.href}
							class={current === link.href ? "active" : undefined}
							aria-current={current === link.href ? "page" : undefined}
							hx-target="main"
							hx-select="main"
							hx-swap="morph"
							hx-push-url="true"
						>
							{link.label}
						</a>
					</li>
				))}
			</ul>
			<form action="/logout" method="post">
				<button type="submit" class="nav-logout">
					Abmelden
				</button>
			</form>
		</nav>
	);
};

export default Nav;
