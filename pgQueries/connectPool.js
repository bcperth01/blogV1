import dotenv from "dotenv";
import pkg from "pg"; // postgres
const { Pool } = pkg;

dotenv.config(); // Loads environment variables from .env file into process.env

// Connect to Postgres
const pg_pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});
// This is a postgress "connect" event that is fired when the pool connects to execute a query
pg_pool.on("connect", () => {
  console.log("Connected to Postgres");
});

export default pg_pool;
//
