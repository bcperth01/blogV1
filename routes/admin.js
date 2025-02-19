import express from "express";
import passport from "passport";
import localStrategy from "passport-local";
import crypto from "crypto";

import pg_pool from "../pgQueries/connectPool.js";

const router = express.Router();

// Test to see if postgres is running and connected
router.get("/testPG", async (req, res) => {
  try {
    const result = await pg_pool.query("SELECT current_database()");
    res.send(`The current database is "${result.rows[0].current_database}"`);
  } catch (err) {
    console.log(err);
  }
  console.log(res.locals.loggedIn);
});

// Temporary routes used for setup
router.get("/createTables", async (req, res) => {
  try {
    const result = await createTables();
    res.send(`Tables were created OK`);
  } catch (err) {
    console.log(err);
  }
});

router.get("/dropTables", async (req, res) => {
  try {
    const result = await pg_pool.query("SELECT current_database()");
    res.send(`The current database is "${result.rows[0].current_database}"`);
  } catch (err) {
    console.log(err);
  }
});

router.get("/getAllUsers", async (req, res) => {
  try {
    const result = await getAllUsers(); // an array of objects
    console.log("GetAllUsers result", result);
    res.send(result);
  } catch (error) {
    console.log("error reading users");
  }
});

export default router;
