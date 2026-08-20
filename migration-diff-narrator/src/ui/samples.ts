/** Built-in example inputs so the first visit shows the tool working. */

export const SQL_BEFORE = `CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(120) NOT NULL UNIQUE,
  full_name VARCHAR(80),
  age INT,
  bio TEXT,
  created TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  total DECIMAL(8, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  placed_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_orders_user ON orders (user_id);
`;

export const SQL_AFTER = `CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(80) NOT NULL,
  age SMALLINT,
  created TIMESTAMP NOT NULL DEFAULT now(),
  last_login TIMESTAMP
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  total DECIMAL(10, 2) NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'pending',
  placed_at TIMESTAMP NOT NULL
);

CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  sku VARCHAR(40) NOT NULL,
  qty INT NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_items_order_sku ON order_items (order_id, sku);
`;

export const TS_BEFORE = `export interface User {
  readonly id: number;
  email: string;
  name?: string;
  role: 'admin' | 'member';
  createdAt: Date;
}

export interface Order {
  id: number;
  userId: number;
  total: number;
  tags: string[];
}
`;

export const TS_AFTER = `export interface User {
  readonly id: number;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'guest';
  createdAt: Date;
  lastLogin?: Date;
}

export interface Order {
  id: number;
  userId: number;
  totalCents: number;
  tags: string[];
  coupon?: string;
}
`;
