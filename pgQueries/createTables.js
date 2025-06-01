import pg_pool from "./connectPool.js";

// intended for single use during dev (see the route in /admin/createTables)
export async function createTables() {
  try {
    await pg_pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    await pg_pool.query(createUsersTable);
    console.log("create Users Table OK");
    await pg_pool.query(createArticlesTable);
    console.log("create Articles Table OK");
    await pg_pool.query(createCommentsTable);
    console.log("create Comments Table OK");
    return "Tables Created OK";
  } catch (err) {
    console.log(err);
    return "Tables NOT Created";
  }
}

// intended for single use during dev (see the route in /admin/dropTables)
export async function dropTables() {
  try {
    // if needed, put the appropriate SQL here to drop all tables
    return "All tables dropped OK"
  } catch (err) {
    console.log(err);
    return "Tables NOT Dropped";
  }
}

// Note: INSERT INTO my_table (id, name) VALUES (uuid_generate_v4(), 'My Name'); is how to work with uuids
// Note: member_type can be admin|user|public
// Note: status can be active|suspended|pending
// Note: verified can be verified|unverified|pending
const createUsersTable =
  "CREATE TABLE IF NOT EXISTS users (\
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\
    first_name          varchar(80),\
    last_name           varchar(80),\
    username            varchar(80),\
    email               varchar(80),\
    member_type         varchar(16),\
    verified            varchar(16.\
    status              varchar(16),\
    salt                bytea,\
    hashed_password     bytea,\
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),\
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()\
);";

// articles belong to one user
// NOTE: Published can be "unpublished | pending | published | suspended"
// Noted: Fields article_type, author, view, likes, deleted were added 
// manually to the table before the create query was modified
const createArticlesTable =
  "CREATE TABLE IF NOT EXISTS articles (\
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\
    title               varchar(80),\
    slug                varchar(80),\
    tag_list            varchar(256),\
    description         varchar(512),\
    markdown            text,\
    vector_to_search    tsvector,\
    published           varchar(16),\
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),\
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),\
    user_id             uuid,\
    article_type        varchar(16),\
    author              varchar(32),\
    views               integer,\
    likes               integer,\
    deleted             boolean,\
    CONSTRAINT          fk_users FOREIGN KEY(user_id) REFERENCES users(id)\
);";

// comments belong to one user and one article
const createCommentsTable =
  "CREATE TABLE IF NOT EXISTS comments (\
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\
    member_id           uuid,\
    comment             varchar(256),\
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),\
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),\
    user_id             uuid,\
    article_id          uuid,\
    CONSTRAINT          fk_users FOREIGN KEY(user_id) REFERENCES users(id),\
    CONSTRAINT          fk_articles FOREIGN KEY(article_id) REFERENCES users(id)\
);";
