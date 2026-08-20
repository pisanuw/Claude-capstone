export const SQL_BLOG = `
-- A small blog schema
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  is_active     BOOLEAN,
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id          BIGSERIAL PRIMARY KEY,
  author_id   INTEGER NOT NULL REFERENCES users(id),
  title       VARCHAR(200) NOT NULL,
  body        TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'draft',
  published_on INTEGER,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE tags (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE post_tags (
  post_id INTEGER NOT NULL,
  tag_id  INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  CONSTRAINT fk_pt_post FOREIGN KEY (post_id) REFERENCES posts (id),
  CONSTRAINT fk_pt_tag  FOREIGN KEY (tag_id) REFERENCES tags (id)
);

CREATE INDEX idx_posts_author ON posts (author_id);
`;

export const SQL_ALTER = `
CREATE TABLE dept (
  id INT PRIMARY KEY,
  name VARCHAR(80)
);
CREATE TABLE emp (
  id INT PRIMARY KEY,
  dept_id INT,
  full_name VARCHAR(120) NOT NULL
);
ALTER TABLE emp ADD CONSTRAINT fk_emp_dept FOREIGN KEY (dept_id) REFERENCES dept(id);
`;

export const PRISMA_SHOP = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  CUSTOMER
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  role      Role     @default(CUSTOMER)
  orders    Order[]
  profile   Profile?
  createdAt DateTime @default(now())
}

model Profile {
  id     Int  @id @default(autoincrement())
  bio    String?
  user   User @relation(fields: [userId], references: [id])
  userId Int  @unique
}

model Order {
  id       Int    @id @default(autoincrement())
  total    Decimal
  user     User   @relation(fields: [userId], references: [id])
  userId   Int
}
`;

export const JSON_SCHEMA_LIBRARY = `{
  "$defs": {
    "Author": {
      "type": "object",
      "description": "A person who writes books.",
      "required": ["id", "name"],
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "name": { "type": "string", "maxLength": 120 },
        "born": { "type": "string", "format": "date" }
      }
    },
    "Book": {
      "type": "object",
      "required": ["id", "title", "author"],
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "title": { "type": "string" },
        "author": { "$ref": "#/$defs/Author" },
        "genre": { "enum": ["fiction", "nonfiction", "poetry"] },
        "inPrint": { "type": ["boolean", "null"] }
      }
    }
  }
}`;

export const JSON_SCHEMA_SINGLE = `{
  "title": "Widget",
  "type": "object",
  "required": ["sku"],
  "properties": {
    "sku": { "type": "string", "maxLength": 32 },
    "price": { "type": "number", "minimum": 0 },
    "tags": { "type": "array", "items": { "type": "string" } }
  }
}`;

export const SQL_CRYPTIC = `
CREATE TABLE tbl_usr_acct (
  usr_id INT PRIMARY KEY,
  acct_no VARCHAR(20),
  amt DECIMAL(10,2)
);
`;
