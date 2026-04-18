import { Hono } from "hono";
import Layout from "../components/Layout";
import { stmts } from "../db";

const home = new Hono();

type Todo = { id: string; task: string; done: number };

const TodoItem = ({ todo }: { todo: Todo }) => (
	<li id={`todo-${todo.id}`} class="todo-item">
		<input
			type="checkbox"
			checked={!!todo.done}
			hx-post={`/todos/${todo.id}/toggle`}
			hx-target={`#todo-${todo.id}`}
			hx-swap="outerHTML"
		/>
		<span class={todo.done ? "done" : ""}>{todo.task}</span>
		<button
			type="button"
			hx-delete={`/todos/${todo.id}`}
			hx-target={`#todo-${todo.id}`}
			hx-swap="delete"
			_={`on click
                if not confirm('Todo wirklich löschen?')
                    halt the event
                end`}
		>
			Löschen
		</button>
	</li>
);

const TodoList = ({ todos }: { todos: Todo[] }) => (
	<ul id="todo-list">
		{todos.length === 0 ? (
			<li id="empty-msg">Keine Todos vorhanden.</li>
		) : (
			todos.map((t) => <TodoItem key={t.id} todo={t} />)
		)}
	</ul>
);

home.get("/", (c) => {
	const user = c.get("user");
	const isAdmin = c.get("isAdmin");
	const todos = stmts.getTodosByUser.all(user.id);

	return c.html(
		<Layout title="Home" currentPath="/" isAdmin={isAdmin}>
			<h1>Hallo, {user.username}!</h1>

			<section>
				<h2>Todos</h2>
				<form
					hx-post="/todos"
					hx-target="#todo-list"
					hx-swap="afterbegin"
					hx-on--after-request="if(event.detail.successful) this.reset()"
				>
					<input
						type="text"
						name="task"
						placeholder="Neue Aufgabe…"
						required
						autocomplete="off"
					/>
					<button type="submit">Hinzufügen</button>
				</form>
				<TodoList todos={todos} />
			</section>
		</Layout>,
	);
});

// Create todo
home.post("/todos", async (c) => {
	const user = c.get("user");
	const body = await c.req.parseBody();
	const task = (body.task as string)?.trim();
	if (!task) return c.body(null, 400);

	const id = Bun.randomUUIDv7();
	stmts.createTodo.run(id, user.id, task);

	// Remove empty message if present
	return c.html(
		<>
			<li id="remove-empty" hx-swap-oob="delete:#empty-msg" />
			<TodoItem todo={{ id, task, done: 0 }} />
		</>,
	);
});

// Toggle todo
home.post("/todos/:id/toggle", (c) => {
	const todoId = c.req.param("id");
	const user = c.get("user");
	const todos = stmts.getTodosByUser.all(user.id);
	const todo = todos.find((t) => t.id === todoId);
	if (!todo) return c.body(null, 404);

	const newDone = todo.done ? 0 : 1;
	stmts.toggleTodo.run(newDone, todoId);

	return c.html(<TodoItem todo={{ ...todo, done: newDone }} />);
});

// Delete todo
home.delete("/todos/:id", (c) => {
	const todoId = c.req.param("id");
	stmts.deleteTodo.run(todoId);
	return c.body(null, 200);
});

export default home;
