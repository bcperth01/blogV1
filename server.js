import express from "express";
import articlesRouter from "./routes/articles.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import methodOverride from "method-override";
import dotenv from "dotenv";
import errorHandler from "./middleware/errorHandler.js";
import pg_pool from "./pgQueries/connectPool.js"; // connection to PostGres
import { createTables } from "./pgQueries/createTables.js";
import { addUser, getAllUsers } from "./pgQueries/queries.js";

// For authentication using passport.js
import passport from "passport";
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

// Send some login data to templates for conditional rendering
// Note: Must be located before the routers below = or will not apply to the subroutes
app.use((req, res, next) => {
  res.locals.loggedIn = req.isAuthenticated();
  res.locals.username = req.isAuthenticated() ? req.user.username : "";
  next();
});

// Routers
app.use("/auth", authRouter); // routes will look like /login
app.use("/articles", articlesRouter);
app.use("/admin", adminRouter);

// Home Page redirected - because its implemented as an article
app.get("/", (req, res, next) => {
  res.redirect("/articles/home");
});

// About page redirected - because its implemented as an article
app.get("/about", async (req, res) => {
  res.redirect("/articles/about");
});

// start the server
let port = process.env.PORT | 5001;
app.listen(port, () => {
  console.log(`Node server runing on port ${port}`);
});
