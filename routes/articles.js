import express from "express";
// import Article from "../models/article.js";
import slugify from "slugify";
//import { marked } from "marked";
import markdownit from "markdown-it";
//import hljs from "highlight.js"; // https://highlightjs.org

import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript"; //Warning: This was hightlights js only

// see documentation for dompurify
import createDomPurify from "dompurify";
import { JSDOM } from "jsdom";
import { addArticle } from "../pgQueries/queries.js";
import pg_pool from "../pgQueries/connectPool.js";

const dompurify = createDomPurify(new JSDOM().window);

hljs.registerLanguage("javascript", javascript);

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
      } catch (__) {
        console.log("an Error occurred");
      }
    }
    console.log("No Language set");
    return (
      '<pre><code class="hljs">' + md.utils.escapeHtml(str) + "</code></pre>"
    );
  },
});

const router = express.Router();

// A template articles record
let blankArticle = {
  //id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\
  title: "",
  slug: "",
  tag_list: "",
  description: "",
  markdown: "",
  vector_to_search: null,
  published: false,
  // created_at: "",
  // updated_at: "",
  user_id: "",
};

// Home page redirected
router.get("/home", async (req, res) => {
  try {
    const result = await pg_pool.query(
      "SELECT markdown from articles where slug='home-page'"
    );
    if (result.rows.length === 0) res.redirect("/");
    let article = result.rows[0];
    article.sanitisedHtml = dompurify.sanitize(
      md.render(article.markdown.trim())
    );
    res.render("about/home", {
      article,
      res: res.locals,
    });
  } catch (err) {
    console.log(err);
  }
});

// Home page redirected
router.get("/about", async (req, res) => {
  try {
    const result = await pg_pool.query(
      "SELECT markdown from articles where slug='about-page'"
    );
    if (result.rows.length === 0) res.redirect("/");
    let article = result.rows[0];
    article.sanitisedHtml = dompurify.sanitize(
      md.render(article.markdown.trim())
    );
    res.render("about/about", {
      article,
      res: res.locals,
    });
  } catch (err) {
    console.log(err);
  }
});

// Reach here with /articles/new
router.get("/new", (req, res) => {
  res.render("articles/new", {
    article: { ...blankArticle },
    res: res.locals,
  }); // renders "/views/articles/new.ejs" - the new article form
});

// Reach here on "new form" submission. POST to /articles/ to save a new article
// On form submission, req.body will contain the form contents
router.post("/", async (req, res) => {
  console.log("req.body", req.body);
  let newArticle = { ...blankArticle };
  newArticle.title = req.body.title.trim();
  newArticle.description = req.body.description.trim();
  newArticle.markdown = removeDollarDollar(
    req.body.markdown.trim(),
    "${newArticle.markdown}"
  );
  newArticle.slug = slugify(req.body.title, {
    lower: true,
    strict: true,
  });
  console.log("newArticle", newArticle);
  try {
    const result = await pg_pool.query(
      `INSERT INTO articles \
          (title, slug ,tag_list, description, markdown, published,user_id)\
       VALUES ('${newArticle.title}','${newArticle.slug}','${newArticle.tag_list}','${newArticle.description}',\
               $$${newArticle.markdown}$$,'${newArticle.published}','${req.user.id}')`
    );
    console.log("Result", result);

    newArticle.sanitisedHtml = dompurify.sanitize(
      md.render(newArticle.markdown.trim(), { res: res.locals })
    );
    res.redirect(`articles/edit/${newArticle.slug}`); // for now continue editing until Cancel or Done pressed
  } catch (error) {
    console.log("error", error);
    res.render("articles/new", { article: newArticle, res: res.locals }); // renders "/views/articles/new.ejs" - the new article form, which should show the values already entered
  }
});

// Converted to Postgres - Reach here via the edit form submission.
// Does a PUT to /articles/:id to update an existing article
// On form submission, req.body will contain the form contents
/**
 * The is a curly problem here with markdown.
 * MD can contain code blocks, which are denoted inside a string of ``` before and after the block.
 * So if your code contains strings with single quotes - like  let a = `abc` then the SQL will complain
 * because its not able to unravel the quotes.
 *   ```js
 *    let a = `abc`
 *   ```
 * You can wrap the md in $$, and then SQL will ignore all the quote confusion, and the above example works fine.
 *
 * However if the MD contains an SQL clause as below, then the markdown itself will contain the $$ delimiters internally
 * and so markdown = $$${editedArticle.markdown}$$ will cause double wrapping - again confusing SQL.
 *
 * One workaround would be to not use single quotes javascript strings - but that would stop the user from copy-pasting
 * random JA code into the markdown.
 *
 *
 */
router.put("/:id", async (req, res, next) => {
  try {
    const result = await pg_pool.query(
      `SELECT * from articles WHERE id ='${req.params.id}'`
    );
    if (result.rows.length === 0) res.redirect("/");
    let editedArticle = { ...result.rows[0] }; // The current state of the record in Postgres
    ///Now change the fields that could have been edited and their derived fields
    editedArticle.sanitisedHtml = dompurify.sanitize(
      md.render(req.body.markdown.trim(), { res: res.locals })
    );
    editedArticle.slug = slugify(req.body.title, {
      lower: true,
      strict: true,
    });
    editedArticle.title = req.body.title.trim();
    editedArticle.description = req.body.description.trim();
    editedArticle.markdown = removeDollarDollar(
      req.body.markdown.trim(),
      "${editedArticle.markdown}"
    );
    console.log("editArticle", editedArticle);
    // save the changes
    const saveResult = await pg_pool.query(
      `UPDATE articles \
         SET slug = '${editedArticle.slug}', title = '${editedArticle.title}',\
             description = '${editedArticle.description}', markdown = $$${editedArticle.markdown}$$\
         WHERE id ='${req.params.id}'`
    );

    res.render("articles/edit", { article: editedArticle, res: res.locals });
  } catch (err) {
    console.log(err);
  }
});

// Converted to Postgres - Delete an article from the Home page list
router.delete("/:id", async (req, res) => {
  try {
    let response = await pg_pool.query(
      `DELETE FROM articles WHERE id = '${req.params.id}'`
    );
    res.redirect("/");
  } catch (error) {
    console.log("error deleting article by id", error.message);
    res.redirect("/");
  }
});

// Display all articles route
router.get("/", async (req, res) => {
  if (req.isAuthenticated()) {
    console.log(req.user);
  } else {
    console.log("user is not authenticated");
  }

  // const articles = await Article.find().sort({ createdAt: "desc" });
  try {
    const result = await pg_pool.query("SELECT * from articles");
    res.render("articles/index", {
      articles: result.rows,
      res: res.locals,
    });
  } catch (err) {
    console.log(err);
  }
});

// Converted to Postgres - Display and article in details by pressing "Read More..""
router.get("/:slug", async (req, res) => {
  try {
    const result = await pg_pool.query(
      `SELECT * from articles where slug ='${req.params.slug}'`
    );
    if (result.rows.length === 0) res.redirect("/");
    let article = result.rows[0];
    article.sanitisedHtml = dompurify.sanitize(
      md.render(article.markdown.trim())
    );
    res.render("articles/show", { article, res: res.locals });
  } catch (err) {
    console.log(err);
  }
});

// Converted to Postgres - Reach here with /articles/edit/slug
router.get("/edit/:slug", async (req, res) => {
  // const article = await Article.findOne({ slug: req.params.slug });
  try {
    const result = await pg_pool.query(
      `SELECT * from articles where slug ='${req.params.slug}'`
    );
    if (result.rows.length === 0) res.redirect("/");
    let article = result.rows[0];
    article.sanitisedHtml = dompurify.sanitize(
      md.render(article.markdown.trim())
    );
    res.render("articles/edit", { article, res: res.locals });
  } catch (err) {
    console.log(err);
  }
});

// replace the $$ surrounding the markdown with single quote
function removeDollarDollar(md, str) {
  return md.replace("$$" + str + "$$", "'" + str + "'");
}
/**
 * ************************stuff under developmenet to be deleted ************************
 */
// This is wrongly named
router.put("/updateArticle", async (req, res) => {
  let article = {
    title: "Article 3a",
    description: "This is article 3a Description",
    markdown: "## Article 3a heading",
    slug: slugify("Article 3a", {
      lower: true,
      strict: true,
    }),
    user_id: "23cd2fbe-5b1c-4b38-808b-9d9168c2e4be",
    published: true,
    tag_list: "abc,def,ghi",
  };
  try {
    let result = await pg_pool.query(
      `INSERT INTO users (first_name, last_name,email, member_type)\
            VALUES ('${user.firstName}', '${user.lastName}', '${user.email}','${user.memberType}')`
    );
    return result;
  } catch (error) {
    console.log("error inserting user", error.message);
    return "error inserting user";
  }
});

// get all articles for a given user-id
router.get("/getArticlesByUserID", async (req, res) => {
  try {
    let response = await pg_pool.query(
      `Select * from  articles where user_id = '23cd2fbe-5b1c-4b38-808b-9d9168c2e4be'`
    );
    res.send(response.rows);
  } catch (error) {
    console.log("error getting articles by user_id", error.message);
    res.send("error getting articles by user_id");
  }
});

router.post("/addArticle", async (req, res) => {
  let article = {
    title: "Article 3",
    description: "This is article 3 Description",
    markdown: "## Article 3 heading",
    slug: slugify("Article 2", {
      lower: true,
      strict: true,
    }),
    user_id: "23cd2fbe-5b1c-4b38-808b-9d9168c2e4be",
    published: false,
    tag_list: "abc,def,ghi",
  };
  try {
    let result = await addArticle(article);
    console.log("result", result.command);
    res.send({
      article,
    });
  } catch (error) {
    res.send(error);
  }
});

export default router;
