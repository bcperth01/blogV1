import express from "express";
import mongoose from "mongoose"; // to be replaced by Postgres
import articlesRouter from "./routes/articles.js";
import authRouter from "./routes/auth.js";
import methodOverride from "method-override";
import dotenv from "dotenv";
import errorHandler from "./middleware/errorHandler.js";
import pg_pool from "./pgQueries/connectPool.js"; // connection to PostGres
import { createTables } from "./pgQueries/createTables.js";
import { addUser, getAllUsers } from "./pgQueries/queries.js";
// For authentication using passport.js
import passport from "passport";
import passport_local from "passport-local";
import crypto from "crypto";
import session from "express-session";

// Create a postgres session store
import genFunc from "connect-pg-simple"; // a postress session store
const pgSessionStore = genFunc(session);
const sessionStore = new pgSessionStore({
  pool: pg_pool, // Connection pool
  createTableIfMissing: true,
  pruneSessionInterval: 90, // deletes dormant sessions after 90 secs
  // Insert connect-pg-simple options here
});

dotenv.config(); // Loads environment variables from .env file into process.env

// connect to MongoDB via Mongoose (now replaced by PostgreSQL)
mongoose.connect("mongodb://localhost/blog");

const app = express();

// Note: Render an ejs view with res.render("/pages/About") - this will look for "/views/pages/About"
app.set("view engine", "ejs");

// middleware
app.use(express.urlencoded({ extended: false })); // extracts the body to make it available as res.body
app.use(methodOverride("_method")); // the string we use to indicate the desired method (that is not native to Form submit)
app.use(express.static("public")); // To enable public assets to be found by the browser,see https://expressjs.com/en/starter/static-files.html
app.use(errorHandler); // returns 500 status and error message

// Activate session middleware using a postgres store
app.use(
  session({
    store: sessionStore,
    secret: process.env.COOKIE_SECRET,
    cookie: { maxAge: 1 * 24 * 60 * 60 * 1000 }, // 1 day(s) for cookie to expire
    resave: false,
    saveUninitialized: false, // set false so it only save if the session data changess
    // Insert more express-session options here
  })
);
app.use(passport.authenticate("session")); // what is this?

// Routers
app.use("/", authRouter); // routes will look like /login
app.use("/articles", articlesRouter);

// Home route only displays a list of articles for now
app.get("/testPG", async (req, res) => {
  try {
    const result = await pg_pool.query("SELECT current_database()");
    res.send(`The current database is "${result.rows[0].current_database}"`);
    console.log("session", req.session);
  } catch (err) {
    console.log(err);
  }
});

// setup routes
// ----------------------------------------
app.get("/createTables", async (req, res) => {
  try {
    const result = await createTables();
    res.send(`Tables were created OK`);
  } catch (err) {
    console.log(err);
  }
});

app.get("/dropTables", async (req, res) => {
  try {
    const result = await pg_pool.query("SELECT current_database()");
    res.send(`The current database is "${result.rows[0].current_database}"`);
  } catch (err) {
    console.log(err);
  }
});
//----------------------------------------------

// add remove users
app.post("/addUser", async (req, res) => {
  try {
    const result = await addUser({
      firstName: "Brendan",
      lastName: "Curtin",
      email: "brendan@email.com",
      memberType: "admin",
    });
    res.send("added user OK");
  } catch (error) {
    console.log("error adding user");
  }
});

// add remove users
app.get("/getAllUsers", async (req, res) => {
  try {
    const result = await getAllUsers(); // an array of objects
    console.log("GetAllUsers result", result);
    res.send(result);
  } catch (error) {
    console.log("error reading users");
  }
});

// Home route
app.get("/", async (req, res) => {
  // const articles = await Article.find().sort({ createdAt: "desc" });
  try {
    const result = await pg_pool.query("SELECT * from articles");
    res.render("articles/index", { articles: result.rows });
  } catch (err) {
    console.log(err);
  }
});

app.get("/about", async (req, res) => {
  // const articles = await Article.find().sort({ createdAt: "desc" });
  res.render("about/about"); // Note: res.render NOT res.send - will render "/views/about/about.ejs"
});

// start the server
let port = process.env.PORT | 5001;
app.listen(port, () => {
  console.log(`Node server runing on port ${port}`);
});
