import express from "express";
import mongoose from "mongoose"; // to be replaced by Postgres
import articlesRouter from "./routes/articles.js";
import path from "path"; // uninstall this if not being used.
import Article from "./models/article.js";
import methodOverride from "method-override";
import dotenv from "dotenv";
import errorHandler from "./middleware/errorHandler.js";
import pg_pool from "./pgQueries/connectPool.js"; // connection to PostGres
import { createTables } from "./pgQueries/createTables.js";
import { addUser, getAllUsers } from "./pgQueries/queries.js";

dotenv.config(); // Loads environment variables from .env file into process.env

// connect to MongoDB via Mongoose
mongoose.connect("mongodb://localhost/blog");

const app = express();

// Note: Render an ejs view with res.render("/pages/About") - this will look for "/views/pages/About"
app.set("view engine", "ejs");

// middleware
app.use(express.urlencoded({ extended: false })); // extracts the body to make it available as res.body
app.use(methodOverride("_method")); // the string we use to indicate the desired method (that is not native to Form submit)
app.use(express.static("public")); // To enable public assets to be found by the browser,see https://expressjs.com/en/starter/static-files.html
app.use(errorHandler); // returns 500 status and error message

// Routes
app.use("/articles", articlesRouter); // all /articles/* routes are in /routes/artciles folder

// Home route only displays a list of articles for now
app.get("/testPG", async (req, res) => {
  try {
    const result = await pg_pool.query("SELECT current_database()");
    res.send(`The current database is "${result.rows[0].current_database}"`);
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
