import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { type Context, Hono } from "hono";
import Layout from "../components/Layout";
import { stmts } from "../db";

const UPLOAD_DIR = process.env.DATA_DIR
	? join(process.env.DATA_DIR, "uploads")
	: join(import.meta.dir, "../../uploads");
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

type FileRow = {
	id: string;
	filename: string;
	size: number;
	uploaded_at: number;
};

type FileRowAdmin = FileRow & { user_id: number; username: string };

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(unix: number) {
	return new Date(unix * 1000).toLocaleString("de-DE");
}

const FilesPage = ({
	files,
	isAdmin,
	error,
	success,
}: {
	files: (FileRow | FileRowAdmin)[];
	isAdmin: boolean;
	error?: string;
	success?: string;
}) => (
	<Layout title="Dateien" currentPath="/files" isAdmin={isAdmin}>
		<h1>Dateien</h1>

		{error && <p class="text-error">{error}</p>}
		{success && <p class="text-success">{success}</p>}

		<section>
			<h2>Datei hochladen</h2>
			<form
				method="post"
				action="/files/upload"
				enctype="multipart/form-data"
				hx-boost="false"
			>
				<label>
					Datei (max. 5 MB)
					<input type="file" name="file" required />
				</label>
				<button type="submit">Hochladen</button>
			</form>
		</section>

		<section>
			<h2>{isAdmin ? "Alle Dateien" : "Meine Dateien"}</h2>
			{files.length === 0 ? (
				<p>Keine Dateien vorhanden.</p>
			) : (
				<table>
					<thead>
						<tr>
							{isAdmin && <th>Nutzer</th>}
							<th>Dateiname</th>
							<th>Größe</th>
							<th>Hochgeladen am</th>
							<th>Aktionen</th>
						</tr>
					</thead>
					<tbody>
						{files.map((f) => (
							<tr key={f.id}>
								{isAdmin && <td>{(f as FileRowAdmin).username}</td>}
								<td>{f.filename}</td>
								<td>{formatBytes(f.size)}</td>
								<td>{formatDate(f.uploaded_at)}</td>
								<td>
									<button
										type="button"
										hx-get={`/files/${f.id}/download`}
										hx-swap="download"
									>
										Herunterladen
									</button>

									<form
										method="post"
										action={`/files/${f.id}/delete`}
										class="inline-block"
									>
										<button
											type="submit"
											_={`on click
                        if not confirm('Datei "${f.filename}" wirklich löschen?')
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
			)}
		</section>
	</Layout>
);

const filesRoute = new Hono();

const renderFilesPage = (c: Context, error?: string) => {
	const isAdmin = c.get("isAdmin");
	const user = c.get("user");
	const files = isAdmin
		? stmts.getAllFiles.all()
		: stmts.getFilesByUser.all(user.id);
	return c.html(
		<FilesPage files={files} isAdmin={isAdmin} error={error} />,
		error ? 400 : undefined,
	);
};

// List files
filesRoute.get("/files", (c) => renderFilesPage(c));

// Upload
filesRoute.post("/files/upload", async (c) => {
	const body = await c.req.parseBody();
	const file = body.file;

	if (!(file instanceof File)) {
		return renderFilesPage(c, "Keine Datei ausgewählt.");
	}

	if (file.size > MAX_SIZE) {
		return renderFilesPage(c, "Datei ist größer als 5 MB.");
	}

	// Sanitise original filename (strip path components)
	const originalName = file.name.replace(/[^\w.-]/g, "_").replace(/^\.+/, "_");
	const fileId = Bun.randomUUIDv7();
	const diskPath = join(UPLOAD_DIR, fileId);

	const user = c.get("user");
	await Bun.write(diskPath, file);
	stmts.insertFile.run(fileId, user.id, originalName, file.size);

	return c.redirect("/files");
});

// Download
filesRoute.get("/files/:id/download", async (c) => {
	const fileId = c.req.param("id");
	const record = stmts.getFileById.get(fileId);

	if (!record) return c.text("Nicht gefunden", 404);
	if (record.user_id !== c.get("user").id && !c.get("isAdmin")) {
		return c.text("Zugriff verweigert", 403);
	}

	const diskPath = join(UPLOAD_DIR, record.id);
	const bunFile = Bun.file(diskPath);
	if (!(await bunFile.exists())) return c.text("Datei nicht gefunden", 404);

	// Serve as attachment using the original filename
	const safeFilename = encodeURIComponent(record.filename);
	c.header(
		"Content-Disposition",
		`attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
	);
	c.header("Content-Type", "application/octet-stream");
	c.header("Content-Length", String(record.size));
	return c.body(bunFile.stream() as ReadableStream);
});

// Delete
filesRoute.post("/files/:id/delete", async (c) => {
	const fileId = c.req.param("id");
	const record = stmts.getFileById.get(fileId);

	if (!record) return c.redirect("/files");
	if (record.user_id !== c.get("user").id && !c.get("isAdmin")) {
		return c.text("Zugriff verweigert", 403);
	}

	stmts.deleteFile.run(record.id);
	const diskPath = join(UPLOAD_DIR, record.id);
	try {
		await unlink(diskPath);
	} catch {
		// File already removed — ignore
	}

	return c.redirect("/files");
});

export default filesRoute;
