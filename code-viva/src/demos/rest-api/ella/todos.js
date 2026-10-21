import express from 'express';

export function createRouter(store = new Map()) {
  const router = express.Router();
  let nextId = 1;

  router.get('/todos', (req, res) => {
    res.json([...store.values()]);
  });

  router.post('/todos', (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 200) {
      return res.status(400).json({ error: 'title is required (1 to 200 characters)' });
    }
    const todo = { id: nextId++, title, done: false };
    store.set(todo.id, todo);
    res.status(201).json(todo);
  });

  router.patch('/todos/:id', (req, res) => {
    const todo = findTodo(store, req.params.id);
    if (!todo) {
      return res.status(404).json({ error: 'no such todo' });
    }
    todo.done = !todo.done;
    res.json(todo);
  });

  router.delete('/todos/:id', (req, res) => {
    if (!store.delete(Number(req.params.id))) {
      return res.status(404).json({ error: 'no such todo' });
    }
    res.status(204).end();
  });

  return router;
}

function findTodo(store, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id)) {
    return null;
  }
  return store.get(id) ?? null;
}
