import express from "express";
import pg_pool from "../pgQueries/connectPool.js";
import { createTables, dropTables } from "../pgQueries/createTables.js";

const router = express.Router();

// Test to see if postgres is running and connected - route /admin/testPG
router.get("/testPG", async (req, res) => {
  try {
    const result = await pg_pool.query("SELECT current_database()");
    res.send(`The current database is "${result.rows[0].current_database}"`);
    return;
  } catch (err) {
    res.redirect(
      "/error/A Search Error Has Occurred in route %2Fsetup%2FtestPG GET"
    );
    return;
  }
  console.log(res.locals.loggedIn);
});

// Once off route used for setup
router.get("/createTables", async (req, res) => {
  try {
    const result = await createTables();
    res.send(result);
  } catch (err) {
    res.redirect(
      "/error/A Create Table Error Has Occurred in route %2Fauth%2FcreateTables"
    );
    return;
  }
});

// Once off route used for setup
router.get("/dropTables", async (req, res) => {
  try {
    const result = await dropTables();
    res.send(result);
  } catch (err) {
    res.redirect(
      "/error/A Drop Table Error Has Occurred in route %2Fauth%2FdropTables"
    );
    return;
  }
});

export default router;
