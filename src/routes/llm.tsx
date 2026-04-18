import { Hono } from "hono";
import Layout from "../components/Layout";

const DEEPINFRA_URL = "https://api.deepinfra.com/v1/openai/chat/completions";
const DEEPINFRA_KEY = process.env.DEEPINFRA_API_KEY || "";
const MODEL = "google/gemma-4-31B-it";

type Message = { role: "system" | "user" | "assistant"; content: string };

// Per-user conversation history (in-memory, keyed by user id)
const conversations = new Map<number, Message[]>();

const llm = new Hono();

// ── LLM Chat page ───────────────────────────────────────────
llm.get("/llm", (c) => {
	const isAdmin = c.get("isAdmin");
	const user = c.get("user");
	const history = conversations.get(user.id) ?? [];

	return c.html(
		<Layout title="LLM Chat" currentPath="/llm" isAdmin={isAdmin}>
			<div class="chat-room">
				<div class="chat-header">
					<h1>LLM Chat</h1>
					{history.length > 0 && (
						<form method="post" action="/llm/clear" class="inline-block">
							<button type="submit" class="btn-danger-small">
								Verlauf löschen
							</button>
						</form>
					)}
				</div>

				<div class="chat-messages" id="llm-messages">
					{history.map((msg) => (
						<div
							class={`chat-msg ${msg.role === "user" ? "chat-msg-own" : "llm-msg-assistant"}`}
						>
							<span class="chat-author">
								{msg.role === "user" ? user.username : "Gemma"}
							</span>
							<span class="chat-text">{msg.content}</span>
						</div>
					))}
				</div>

				<form id="llm-form" class="chat-input-bar">
					<input
						type="text"
						id="llm-input"
						name="content"
						placeholder="Nachricht an LLM…"
						required
						autocomplete="off"
					/>
					<button type="submit" id="llm-send">Senden</button>
				</form>
			</div>

			<script
				dangerouslySetInnerHTML={{
					__html: `
(function() {
  var msgBox = document.getElementById('llm-messages');
  var form = document.getElementById('llm-form');
  var input = document.getElementById('llm-input');
  var sendBtn = document.getElementById('llm-send');
  var sending = false;

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function addMsg(role, text) {
    var div = document.createElement('div');
    div.className = 'chat-msg ' + (role === 'user' ? 'chat-msg-own' : 'llm-msg-assistant');
    var author = document.createElement('span');
    author.className = 'chat-author';
    author.textContent = role === 'user' ? '${user.username}' : 'Gemma';
    var content = document.createElement('span');
    content.className = 'chat-text';
    content.textContent = text;
    div.appendChild(author);
    div.appendChild(content);
    msgBox.appendChild(div);
    msgBox.scrollTop = msgBox.scrollHeight;
    return content;
  }

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (sending) return;
    var content = input.value.trim();
    if (!content) return;
    input.value = '';
    sending = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '…';

    addMsg('user', content);

    // Create placeholder for assistant response
    var assistantEl = addMsg('assistant', '');

    fetch('/llm/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content })
    }).then(function(res) {
      if (!res.ok) {
        assistantEl.textContent = 'Fehler: ' + res.status;
        sending = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Senden';
        return;
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var fullText = '';

      function read() {
        reader.read().then(function(result) {
          if (result.done) {
            sending = false;
            sendBtn.disabled = false;
            sendBtn.textContent = 'Senden';
            return;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\\n');
          buffer = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('data: ') !== 0) continue;
            var payload = line.slice(6);
            if (payload === '[DONE]') {
              sending = false;
              sendBtn.disabled = false;
              sendBtn.textContent = 'Senden';
              return;
            }
            try {
              var json = JSON.parse(payload);
              var delta = json.choices && json.choices[0] && json.choices[0].delta;
              if (delta && delta.content) {
                fullText += delta.content;
                assistantEl.textContent = fullText;
                msgBox.scrollTop = msgBox.scrollHeight;
              }
            } catch(ex) {}
          }
          read();
        });
      }
      read();
    }).catch(function(err) {
      assistantEl.textContent = 'Fehler: ' + err.message;
      sending = false;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Senden';
    });
  });

  // Scroll to bottom on load
  msgBox.scrollTop = msgBox.scrollHeight;
})();
`,
				}}
			/>
		</Layout>,
	);
});

// ── Streaming endpoint ──────────────────────────────────────
export const llmStream = new Hono();

llmStream.post("/llm/stream", async (c) => {
	const user = c.get("user");
	const body = await c.req.json<{ content?: string }>();
	const content = body.content?.trim();
	if (!content) return c.json({ error: "empty" }, 400);

	const userMsg = content.slice(0, 4000);

	// Get or create conversation history
	if (!conversations.has(user.id)) {
		conversations.set(user.id, []);
	}
	const history = conversations.get(user.id) ?? [];
	history.push({ role: "user", content: userMsg });

	// Build messages array with system prompt
	const messages: Message[] = [
		{
			role: "system",
			content: "Du bist ein hilfreicher Assistent. Antworte auf Deutsch, es sei denn der Nutzer schreibt in einer anderen Sprache.",
		},
		...history,
	];

	// Stream from DeepInfra
	const apiRes = await fetch(DEEPINFRA_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${DEEPINFRA_KEY}`,
		},
		body: JSON.stringify({
			model: MODEL,
			stream: true,
			messages,
			max_tokens: 2048,
			temperature: 0.7,
		}),
	});

	if (!apiRes.ok) {
		const errText = await apiRes.text();
		history.pop(); // remove failed user message
		return c.json({ error: errText }, apiRes.status as 400);
	}

	// Collect assistant response while streaming through
	let assistantContent = "";

	const stream = new ReadableStream({
		async start(controller) {
			const reader = (apiRes.body as ReadableStream<Uint8Array>).getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					// Forward raw SSE data to client
					controller.enqueue(new TextEncoder().encode(chunk));

					// Parse to collect full response
					buffer += chunk;
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";

					for (const line of lines) {
						if (!line.startsWith("data: ")) continue;
						const payload = line.slice(6);
						if (payload === "[DONE]") continue;
						try {
							const json = JSON.parse(payload);
							const delta = json.choices?.[0]?.delta;
							if (delta?.content) {
								assistantContent += delta.content;
							}
						} catch {
							/* ignore parse errors */
						}
					}
				}
			} finally {
				// Save assistant response to history
				if (assistantContent) {
					history.push({ role: "assistant", content: assistantContent });
				}
				// Cap history at 50 messages to avoid unbounded growth
				while (history.length > 50) {
					history.shift();
				}
				controller.close();
			}
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

// ── Clear conversation ──────────────────────────────────────
llm.post("/llm/clear", (c) => {
	const user = c.get("user");
	conversations.delete(user.id);
	return c.redirect("/llm");
});

export default llm;
