import express from "express";
import Article from "../models/article.js";
import slugify from "slugify";
//import { marked } from "marked";
import markdownit from "markdown-it";
//import hljs from "highlight.js"; // https://highlightjs.org

import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript"; //Warning: This was hightlights js only

// see documentation for dompurify
import createDomPurify from "dompurify";
import { JSDOM } from "jsdom";
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

// Reach here with /articles/new
router.get("/new", (req, res) => {
  res.render("articles/new", { article: new Article() }); // renders "/views/articles/new.ejs" - the new article form
});

// Reach here on "new form" submission. POST to /articles/ to save a new article
// On form submission, req.body will contain the form contents
router.post("/", async (req, res) => {
  let article = new Article({
    title: req.body.title.trim(),
    description: req.body.description.trim(),
    markdown: req.body.markdown.trim(),
    slug: slugify(req.body.title, {
      lower: true,
      strict: true,
    }),
  });
  try {
    article = await article.save();
    article.sanitisedHtml = dompurify.sanitize(
      md.render(article.markdown.trim())
    );
    res.render(`articles/edit`, { article }); // for now continue editing until Cancel or Done pressed
  } catch (error) {
    res.render("articles/new", { article }); // renders "/views/articles/new.ejs" - the new article form, which should show the values already entered
  }
});

// Reach here via the edit form submission. Does a PUT to /articles/:id to update an existing article
// On form submission, req.body will contain the form contents
router.put("/:id", async (req, res, next) => {
  let articleToBeUpdated = await Article.findById(req.params.id);
  const slug = slugify(req.body.title, {
    lower: true,
    strict: true,
  });

  articleToBeUpdated.title = req.body.title.trim();
  articleToBeUpdated.description = req.body.description.trim();
  articleToBeUpdated.markdown = req.body.markdown.trim();
  articleToBeUpdated.slug = slug;

  try {
    let article = await articleToBeUpdated.save();
    //res.redirect(`/articles/${article.slug}`);
    article.sanitisedHtml = dompurify.sanitize(
      md.render(article.markdown.trim())
    );
    res.render(`articles/edit`, { article: articleToBeUpdated }); // for now continue editing until Cancel or Done pressed
  } catch (e) {
    res.render(`articles/edit`, { article: articleToBeUpdated });
  }
});

router.delete("/:id", async (req, res) => {
  await Article.findByIdAndDelete(req.params.id);
  res.redirect("/");
});

// Reach here with /articles/slug
router.get("/:slug", async (req, res) => {
  const article = await Article.findOne({ slug: req.params.slug });
  if (article == null) res.redirect("/");
  article.sanitisedHtml = dompurify.sanitize(
    md.render(article.markdown.trim())
  );
  res.render("articles/show", { article }); // renders "/views/articles/show.ejs" - to show the current article
});

// Reach here with /articles/edit/slug
router.get("/edit/:slug", async (req, res) => {
  const article = await Article.findOne({ slug: req.params.slug });
  if (article == null) res.redirect("/");
  article.sanitisedHtml = dompurify.sanitize(
    md.render(article.markdown.trim())
  );
  res.render("articles/edit", { article });
});

export default router;
