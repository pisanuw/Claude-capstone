import express from 'express';

const r = express.Router();
let todos = [];
let c = 0;

function listTodos(req, res) {
  res.json(todos);
}

function addTodo(req, res) {
  if (!req.body.title) return res.status(400).send('bad');
  c++;
  const t = { id: c, title: req.body.title, done: false };
  todos.push(t);
  res.json(t);
}

function toggleTodo(req, res) {
  const t = todos.find((x) => x.id == req.params.id);
  if (!t) return res.sendStatus(404);
  t.done = !t.done;
  res.json(t);
}

function removeTodo(req, res) {
  todos = todos.filter((x) => x.id != req.params.id);
  res.sendStatus(204);
}

r.get('/todos', listTodos);
r.post('/todos', addTodo);
r.patch('/todos/:id', toggleTodo);
r.delete('/todos/:id', removeTodo);

export default r;
