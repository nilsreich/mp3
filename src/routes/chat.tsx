import { Hono } from "hono";
import Layout from "../components/Layout";

const chat = new Hono();

// ── In-memory state ─────────────────────────────────────────
type Room = { id: number; name: string };

let nextRoomId = 1;
const rooms = new Map<number, Room>();

// SSE connection registry (room_id → set of controllers)
const roomClients = new Map<number, Set<ReadableStreamDefaultController>>();

function broadcast(roomId: number, event: string, data: string) {
	const clients = roomClients.get(roomId);
	if (!clients) return;
	const payload = `event: ${event}\ndata: ${data}\n\n`;
	for (const ctrl of clients) {
		try {
			ctrl.enqueue(new TextEncoder().encode(payload));
		} catch {
			clients.delete(ctrl);
		}
	}
}

// ── Room list ───────────────────────────────────────────────
chat.get("/chat", (c) => {
	const isAdmin = c.get("isAdmin");
	const allRooms = [...rooms.values()].sort((a, b) =>
		a.name.localeCompare(b.name),
	);

	return c.html(
		<Layout title="Chat" currentPath="/chat" isAdmin={isAdmin}>
			<h1>Chat</h1>

			{isAdmin && (
				<section>
					<h2>Raum erstellen</h2>
					<form method="post" action="/chat/rooms">
						<input
							type="text"
							name="name"
							placeholder="Raumname…"
							required
							autocomplete="off"
						/>
						<button type="submit">Erstellen</button>
					</form>
				</section>
			)}

			<section>
				<h2>Räume</h2>
				{allRooms.length === 0 ? (
					<p>Noch keine Räume vorhanden.</p>
				) : (
					<ul class="room-list">
						{allRooms.map((room) => (
							<li key={room.id} class="room-item">
								<a href={`/chat/${room.id}`} hx-boost="false">
									{room.name}
								</a>
								{isAdmin && (
									<form
										method="post"
										action={`/chat/rooms/${room.id}/delete`}
										class="inline-block"
									>
										<button
											type="submit"
											class="btn-danger-small"
											_={`on click
												if not confirm('Raum "${room.name}" wirklich löschen?')
													halt the event
												end`}
										>
											Löschen
										</button>
									</form>
								)}
							</li>
						))}
					</ul>
				)}
			</section>
		</Layout>,
	);
});

// ── Admin: create room ──────────────────────────────────────
chat.post("/chat/rooms", async (c) => {
	if (!c.get("isAdmin")) return c.text("Forbidden", 403);
	const body = await c.req.parseBody();
	const name = (body.name as string)?.trim();
	if (!name) return c.redirect("/chat");

	// Prevent duplicate names
	const exists = [...rooms.values()].some((r) => r.name === name);
	if (!exists) {
		const id = nextRoomId++;
		rooms.set(id, { id, name });
	}
	return c.redirect("/chat");
});

// ── Admin: delete room ──────────────────────────────────────
chat.post("/chat/rooms/:id/delete", (c) => {
	if (!c.get("isAdmin")) return c.text("Forbidden", 403);
	const id = Number(c.req.param("id"));
	if (!rooms.has(id)) return c.redirect("/chat");

	rooms.delete(id);

	// Close all SSE connections for that room
	const clients = roomClients.get(id);
	if (clients) {
		for (const ctrl of clients) {
			try {
				ctrl.close();
			} catch {
				/* noop */
			}
		}
		roomClients.delete(id);
	}
	return c.redirect("/chat");
});

// ── Chat room view ──────────────────────────────────────────
chat.get("/chat/:id", (c) => {
	const isAdmin = c.get("isAdmin");
	const user = c.get("user");
	const roomId = Number(c.req.param("id"));
	const room = rooms.get(roomId);
	if (!room) return c.text("Raum nicht gefunden", 404);

	return c.html(
		<Layout title={`Chat – ${room.name}`} currentPath="/chat" isAdmin={isAdmin}>
			<div class="chat-room">
				<div class="chat-header">
					<a href="/chat" class="chat-back" hx-boost="false">
						&larr; Zurück
					</a>
					<h1>{room.name}</h1>
				</div>

				<div class="chat-messages" id="chat-messages" />

				<form id="chat-form" class="chat-input-bar">
					<input
						type="text"
						id="chat-input"
						name="content"
						placeholder="Nachricht…"
						required
						autocomplete="off"
					/>
					<button type="submit">Senden</button>
				</form>
			</div>

			<script
				dangerouslySetInnerHTML={{
					__html: `
(function() {
  var roomId = ${roomId};
  var userId = ${user.id};
  var msgBox = document.getElementById('chat-messages');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');

  function addMsg(data) {
    var div = document.createElement('div');
    div.className = 'chat-msg' + (data.user_id === userId ? ' chat-msg-own' : '');
    var author = document.createElement('span');
    author.className = 'chat-author';
    author.textContent = data.username;
    var text = document.createElement('span');
    text.className = 'chat-text';
    text.textContent = data.content;
    var time = document.createElement('span');
    time.className = 'chat-time';
    time.textContent = data.time;
    div.appendChild(author);
    div.appendChild(text);
    div.appendChild(time);
    msgBox.appendChild(div);
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  var es;
  function connect() {
    es = new EventSource('/chat/' + roomId + '/stream');
    es.addEventListener('message', function(e) {
      addMsg(JSON.parse(e.data));
    });
    es.onerror = function() {
      es.close();
      setTimeout(connect, 2000);
    };
  }
  connect();

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var content = input.value.trim();
    if (!content) return;
    input.value = '';
    fetch('/chat/' + roomId + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content })
    });
  });

  document.addEventListener('htmx:beforeRequest', function cleanup() {
    if (es) es.close();
    document.removeEventListener('htmx:beforeRequest', cleanup);
  });
})();
`,
				}}
			/>
		</Layout>,
	);
});

// ── SSE stream endpoint (exported separately, must bypass compress/etag) ──
export const chatStream = new Hono();

chatStream.get("/chat/:id/stream", (c) => {
	const roomId = Number(c.req.param("id"));
	if (!rooms.has(roomId)) return c.text("Not found", 404);

	if (!roomClients.has(roomId)) {
		roomClients.set(roomId, new Set());
	}
	const clients = roomClients.get(
		roomId,
	) as Set<ReadableStreamDefaultController>;

	let controller: ReadableStreamDefaultController;
	const stream = new ReadableStream({
		start(ctrl) {
			controller = ctrl;
			clients.add(ctrl);
		},
		cancel() {
			clients.delete(controller);
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
});

// ── Post message ────────────────────────────────────────────
chat.post("/chat/:id/messages", async (c) => {
	const user = c.get("user");
	const roomId = Number(c.req.param("id"));
	if (!rooms.has(roomId)) return c.text("Not found", 404);

	const body = await c.req.json<{ content?: string }>();
	const content = body.content?.trim();
	if (!content) return c.json({ error: "empty" }, 400);

	const sanitized = content.slice(0, 2000);

	const hh = String(new Date().getHours()).padStart(2, "0");
	const mm = String(new Date().getMinutes()).padStart(2, "0");

	broadcast(
		roomId,
		"message",
		JSON.stringify({
			user_id: user.id,
			username: user.username,
			content: sanitized,
			time: `${hh}:${mm}`,
		}),
	);

	return c.json({ ok: true });
});

export default chat;
