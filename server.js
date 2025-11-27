/**
 * Note: AWS security is based on an IAM user calles "expressServer"
 * The user has a policy attached called S3Access
 * S3Access allows teh required S3 access
 */

import express from "express";
import articlesRouter from "./routes/articles.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import setupRouter from "./routes/setup.js"; // for routes only used to setup/test the system
import manageImagesRouter from "./routes/manageImages.js";
import methodOverride from "method-override";
import dotenv from "dotenv";
import errorHandler from "./middleware/errorHandler.js";
import pg_pool from "./pgQueries/connectPool.js"; // connection to PostGres
import markdownit from "markdown-it";
// For authentication using passport.js
import passport from "passport";
import session from "express-session";

import createDomPurify from "dompurify";
import { JSDOM } from "jsdom";

// Create a postgres session store
import genFunc from "connect-pg-simple"; // a postress session store
const pgSessionStore = genFunc(session);
const sessionStore = new pgSessionStore({
  pool: pg_pool, // Connection pool
  createTableIfMissing: true,
  pruneSessionInterval: 90, // deletes dormant sessions after 90 secs
  // Insert connect-pg-simple options here
});
const dompurify = createDomPurify(new JSDOM().window);
dotenv.config(); // Loads environment variables from .env file into process.env

// Initialise Markdown-it with the full options list (defaults)
const md = markdownit({
  // Enable HTML tags in source
  html: false,

  // Use '/' to close single tags (<br />).
  // This is only for full CommonMark compatibility.
  xhtmlOut: false,

  // Convert '\n' in paragraphs into <br>
  breaks: false,

  // CSS language prefix for fenced blocks. Can be
  // useful for external highlighters.
  langPrefix: "language-",

  // Autoconvert URL-like text to links
  linkify: false,

  // Enable some language-neutral replacement + quotes beautification
  // For the full list of replacements, see https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/replacements.mjs
  typographer: false,

  // Double + single quotes replacement pairs, when typographer enabled,
  // and smartquotes on. Could be either a String or an Array.
  //
  // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
  // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
  quotes: "“”‘’",

  // Highlighter function. Should return escaped HTML,
  // or '' if the source string is not changed and should be escaped externally.
  // If result starts with <pre... internal wrapper is skipped.
  // Note: I manually wrapped with '<pre><code class="hljs">' to inject the hljs class (sets the backgound and color)
  //       Without this, "markdowm-it" wraps <pre><code> without the class.
  //       The official way to inject class="hljs" is not documented as far as I can see
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<pre><code class="hljs">' +
          hljs.highlight(str, { language: lang }).value +
          "</code></pre>"
        );
      } catch (err) {
        res.redirect(
          "/error/A Error Has Occurred in function %2Farticles%2Fhighlight()"
        );
        return;
      }
    }
    console.log("No Language set");
    return (
      '<pre><code class="hljs">' + md.utils.escapeHtml(str) + "</code></pre>"
    );
  },
});

// console.log(process.env);

const app = express();
app.use(express.static("public")); // allows access to local file in /public directly

// Note: Render an ejs view with res.render("/pages/About") - this will look for "/views/pages/About"
app.set("view engine", "ejs");

// middleware
app.use(express.json()); // for parsing jSON encoded body
app.use(express.urlencoded({ extended: false })); // extracts the body to make it available as res.body
app.use(methodOverride("_method")); // the string we use to indicate the desired method (that is not native to Form submit)
app.use(express.static("public")); // To enable public assets to be found by the browser,see https://expressjs.com/en/starter/static-files.html
app.use(errorHandler); // returns 500 status and error message
app.use((req, res, next) => {
  res.locals.title = "BCBlog"; // default
  next();
});

// Activate session middleware using a postgres store
app.use(
  session({
    store: sessionStore,
    secret: process.env.COOKIE_SECRET,
    cookie: { maxAge: 1 * 24 * 60 * 60 * 1000 }, // 1 day(s) for cookie to expire
    resave: false,
    saveUninitialized: false, // set false so it only saves the session if the session data changess
    // Insert more express-session options here
  })
);
app.use(passport.authenticate("session")); // what is this?

// Send some login data to templates for conditional rendering
// Note: Must be located before the routers below = or will not apply to the subroutes
app.use((req, res, next) => {
  // console.log("req.user", req.user);
  res.locals.loggedIn = req.isAuthenticated();
  res.locals.username = req.isAuthenticated() ? req.user.username : "";
  res.locals.member_type = req.isAuthenticated() ? req.user.member_type : "";
  res.locals.id = req.isAuthenticated() ? req.user.id : "";
  res.locals.path = req.path; // passes the path to ejs to display menu items conditionally
  next();
});

// Routers
app.use("/auth", authRouter); // routes will look like /login
app.use("/articles", articlesRouter);
app.use("/setup", setupRouter);
app.use("/admin", adminRouter);
app.use("/manageImages", manageImagesRouter);

// Home Page redirected - because its implemented as an article
// Security: None needed as its a public home page
app.get("/", async (req, res, next) => {
  res.redirect("/home");
});

app.get("/home", async (req, res) => {
  try {
    const result = await pg_pool.query(
      "SELECT markdown from articles where slug='home-page'"
    );
    res.locals.title = "Home";
    if (result.rows.length === 0) {
      res.render("about/home", { article: "empty", res: res.locals });
    } else {
      let article = result.rows[0];
      article.sanitisedHtml = dompurify.sanitize(
        md.render(article.markdown.trim())
      );
      // article.created = article.created_at.toLocalString("en-UK");
      res.render("about/home", {
        article,
        res: res.locals,
      });
    }
  } catch (err) {
    res.redirect(
      "/error/A Search Error Has Occurred in route %2Farticles%2Fhome"
    );
    return;
  }
});

// About page redirected - because its implemented as an article
// Security: None needed as its a public about page
app.get("/about", async (req, res) => {
  try {
    const result = await pg_pool.query(
      "SELECT markdown from articles where slug='about-page'"
    );
    res.locals.title = "About";
    if (result.rows.length === 0) {
      res.render("about/about", { article: "empty", res: res.locals });
    } else {
      let article = result.rows[0];
      article.sanitisedHtml = dompurify.sanitize(
        md.render(article.markdown.trim())
      );
      res.render("about/about", {
        article,
        res: res.locals,
      });
    }
  } catch (err) {
    console.log(err);
    res.redirect(
      "/error/A Search Error Has Occurred in route %2Farticles%2Fabout"
    );
    return;
  }
});

// Error page
app.get("/error/:msg", (req, res) => {
  const msg = decodeURIComponent(req.params.msg);
  console.log("in error route");
  console.log("req.params", req.params);
  res.render("error/error", {
    article: "",
    res: res.locals,
    title: "Server Error",
    err_msg: msg,
  });
});

// start the server
let port = process.env.PORT | 5001;
app.listen(port, () => {
  console.log(`Node server runing on port ${port}`);
});
