import type { FC, PropsWithChildren } from "hono/jsx";
import Nav from "./Nav";

type LayoutProps = PropsWithChildren<{
	title?: string;
	currentPath?: string;
	isAdmin?: boolean;
	showNav?: boolean;
}>;

const Layout: FC<LayoutProps> = ({
	title = "App",
	currentPath,
	isAdmin,
	showNav = true,
	children,
}) => {
	return (
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<meta name="view-transition" content="same-origin" />
				<title>{title}</title>
				{/* HTMX 4 config — morph is the optimal default swap (built-in, no extension needed) */}
				<meta
					name="htmx-config"
					content='{"defaultSwap":"morph","defaultSettleDelay":0}'
				/>
				<link rel="manifest" href="/public/manifest.json" />
				<link rel="icon" href="/public/icon.svg" type="image/svg+xml" />
				<link rel="stylesheet" href="/public/global.css" />
			</head>
			<body hx-boost="true">
				{showNav && currentPath && (
					<Nav current={currentPath} isAdmin={isAdmin} />
				)}
				<main class="container">{children}</main>
				<script src="/public/htmx.min.js" defer />
				<script src="/public/hx-preload.js" defer />
				<script src="/public/hx-download.js" defer />
				<script src="/public/_hyperscript.min.js" defer />
				<script
					dangerouslySetInnerHTML={{
						__html: `if('serviceWorker' in navigator) navigator.serviceWorker.register('/public/sw.js');`,
					}}
				/>
			</body>
		</html>
	);
};

export default Layout;
