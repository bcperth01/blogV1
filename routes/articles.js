import express from "express";
// import Article from "../models/article.js";
import slugify from "slugify";
//import { marked } from "marked";
import markdownit from "markdown-it";
//import hljs from "highlight.js"; // https://highlightjs.org

import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript"; //Warning: This was hightlights js only

import dayjs from "dayjs";
// see documentation for dompurify
import createDomPurify from "dompurify";
import { JSDOM } from "jsdom";
import pg_pool from "../pgQueries/connectPool.js";
import {
  replaceMarkdownImages,
  replaceMarkdownImagesInPreview,
} from "../utills/awsS3.js";

import { generateSignedUrl } from "../utills/awsS3.js";

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
  // created_at: "",     // default now()
  // updated_at: "",     // default now()
  user_id: "", // user_id of author
  author: "", //name of author
  article_type: "article", // 'articles' | "site page"
  published: "unpublished", // default 'unpublished' | 'pending' | 'published'
  deleted: false, // true if flagged for deletion
  title_image: "", // The name of an image in the bucket/cards directory
  // likes: 0, // no of likes default 0
  // views: 0, // no of vieww default 0
};

/* File->save after editing a new file (save) or an existing one (update) */
router.post("/saveArticle", express.json(), async (req, res) => {
  const { title, title_image, tag_list, description, markdown, path } =
    req.body;

  console.log("title:      ", title);
  console.log("tag_image:  ", title_image);
  console.log("tag_list:   ", tag_list);
  console.log("description:", description);
  console.log("markdown:   ", markdown);
  console.log("path:       ", path);

  if (!path) {
    return res.status(400).json({
      success: false,
      message: "Missing path",
    });
  }

  const isNewFile = path === "new" || path.startsWith("articles/new");

  if (isNewFile) {
    console.log("Creating new file...");
    // create new article logic here
  } else {
    console.log("Updating existing file:", path);
    // update existing article logic here
  }

  res.json({ success: true });
});

// Home page redirected from server('/')
// Security: None needed as its a public home page
router.get("/home", async (req, res) => {
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

// About page redirected
// Security: None needed as its a public about page
router.get("/about", async (req, res) => {
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
    res.redirect(
      "/error/A Search Error Has Occurred in route %2Farticles%2Fabout"
    );
    return;
  }
});

// Route for full text search for matcheing articles
// Security: Everyone can get a list of published articles
// Note: A full text searchable document is created by combining the fiels "markdown", "author", "slug" and "title"
//       The query vector is constructed from the whatever the user type in the search field
//       This supports logical operators ! (not), & (and), | (or), and <-> (followed by)
//       to_tsquery() function will error if other than the above characters are entered
//                                     OR if multiple words are entered without one of them
//       Also exists
//            plainto_tsquery() - inserts '&' between words if no legal separator exists - also removes illegal separators (like '***' say)
//            phraseto_query() - inserts '<->' between words if no legal separator exists - also removes illegal separators (like '***' say)
//            websearch_to_tsquery() which behaves like standard browser searches
//
router.post("/search", async (req, res) => {
  console.log("im searching");
  console.log("searchCriteria", req.body.searchCriteria);
  let sql = `select * from articles where to_tsvector(markdown || ' ' || author || ' ' || slug || ' ' || title) @@ to_tsquery('${req.body.searchCriteria}') and published = 'unpublished'`;
  console.log(sql);
  try {
    const result = await pg_pool.query(sql);
    // convert format of the created-at date
    let articles = result.rows.map((article) => {
      const formattedDate = dayjs(article.created_at).format("DD MMM, YYYY");
      return { ...article, created_at: formattedDate };
    });
    res.render("articles/list", {
      res: res.locals,
      articles,
      none_msg:
        result.rows.length === 0
          ? `No Articles Matching "${req.body.searchCriteria}"`
          : "",
    });
    return;
  } catch (err) {
    res.redirect(
      "/error/A Search Error Has Occurred in route %2Farticles%2Fsearch POST"
    );
    return;
  }
});

/**
 * Note: The same for is used to edit new or existing articles
 *       The path variable contains either "/articles/new" or "/articles/edit" to direct any
 *       reoute specific logic
 */
// Reach here with /articles/new
// Security: Only logged in users who are either admin or members can create new articles
router.get("/new", (req, res) => {
  if (
    !(
      req.isAuthenticated() &&
      (res.locals.member_type === "admin" ||
        res.locals.member_type === "member")
    )
  ) {
    // If not authenticated or not an admin or member, redirect to unauthorised page}
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("Inaccessible Route") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  res.render("articles/edit", {
    article: { ...blankArticle },
    heading: "New Article",
    res: res.locals,
  }); // renders "/views/articles/edit.ejs"
});

// Reach here on "new form" submission. POST to /articles/ to save a new article
// On form submission, req.body will contain the form contents
// Security: Only logged in users who are either admin or members can create new articles
//           TODO: Block members from editing articles they did not create.
router.post("/new", async (req, res) => {
  if (
    !(
      req.isAuthenticated() &&
      (res.locals.member_type === "admin" ||
        res.locals.member_type === "member")
    )
  ) {
    // If not authenticated or not an admin or member, redirect to unauthorised page
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("Inaccessible Route") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  console.log("req.body", req.body);
  let newArticle = { ...blankArticle };
  newArticle.title = req.body.title.trim();
  newArticle.description = req.body.description.trim();
  newArticle.tag_list = req.body.tag_list.trim();
  newArticle.title_image = req.body.title_image.trim();
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
          (title, slug ,tag_list, description, markdown, published,user_id,author,title_image)\
       VALUES ('${newArticle.title}','${newArticle.slug}','${newArticle.tag_list}','${newArticle.description}',\
               $$${newArticle.markdown}$$,'${newArticle.published}','${req.user.id}','${req.user.username}', '${newArticle.title_image}')`
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
// Security: Only logged in users who are either admin or members can create new articles
//           TODO: Block members from editing articles they did not create.
router.put("/:id", async (req, res, next) => {
  if (
    !(
      req.isAuthenticated() &&
      (res.locals.member_type === "admin" ||
        res.locals.member_type === "member")
    )
  ) {
    // If not authenticated or not an admin or member, redirect to unauthorised page
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("Inaccessible Route") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  try {
    const result = await pg_pool.query(
      `SELECT * from articles WHERE id ='${req.params.id}'`
    );
    if (result.rows.length === 0) res.redirect("/");
    let editedArticle = { ...result.rows[0] }; // The current state of the record in Postgres
    ///Now change the fields that could have been edited and their derived fields

    // This is for the preview pane
    const markdownWithImages = await replaceMarkdownImagesInPreview(
      req.body.markdown.trim()
    );
    editedArticle.sanitisedHtml = dompurify.sanitize(
      md.render(markdownWithImages, { res: res.locals })
    );

    editedArticle.slug = slugify(req.body.title, {
      lower: true,
      strict: true,
    });
    editedArticle.title_image = req.body.title_image.trim();
    editedArticle.tag_list = req.body.tag_list.trim();
    editedArticle.title = req.body.title.trim();
    editedArticle.description = req.body.description.trim();
    editedArticle.markdown = removeDollarDollar(
      req.body.markdown.trim(),
      "${editedArticle.markdown}"
    );
    // console.log("editArticle", editedArticle);
    // save the changes
    const saveResult = await pg_pool.query(
      `UPDATE articles \
         SET slug = '${editedArticle.slug}', tag_list = '${editedArticle.tag_list}',title = '${editedArticle.title}', title_image = '${editedArticle.title_image}',\
             description = '${editedArticle.description}', markdown = $$${editedArticle.markdown}$$\
         WHERE id ='${req.params.id}'`
    );

    res.render("articles/edit", {
      article: editedArticle,
      heading: "Edit New Article",
      res: res.locals,
    });
  } catch (err) {
    console.log("error", err);
    res.redirect(
      "/error/An Update Error Has Occurred in route %2Farticles%2F:id PUT"
    );
    return;
  }
});

// Delete an article from the Home page list
// Security: Only logged in users who are either admin or members can delete articles
//           TODO: Block members from deleting articles they did not create.
router.delete("/delete", async (req, res) => {
  if (
    !(
      req.isAuthenticated() &&
      (res.locals.member_type === "admin" ||
        res.locals.member_type === "member")
    )
  ) {
    // If not authenticated or not an admin or member, redirect to unauthorised page
    return res.status(400).json({
      unauth: true,
      success: false,
      message:
        encodeURIComponent("Inaccessible Route") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/"),
    });
  }

  try {
    console.log("deleting article:", req.body.slug);
    // Mark teh article as deleted
    const saveResult = await pg_pool.query(
      `UPDATE articles \
         SET deleted = true
         WHERE slug ='${req.body.slug}'`
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete article",
      error: err.message,
    });
  }
});

// Display the list of article cards based on various filters
// Security: TODO: Review this page and add security where needed
router.get("/", async (req, res) => {
  let filter = req.query.filter;
  console.log("filter:", filter); // its user_id by default
  let query = "";
  let none_msg = "";
  let sqlStr =
    "SELECT id, title, slug, tag_list, description,created_at, author, views, likes,title_image from articles where ";
  switch (filter) {
    case "published":
      query = sqlStr + "published = 'published' and deleted = false";
      none_msg = "No published articles available";
      break;
    case "deleted":
      query = sqlStr + "deleted = true";
      none_msg = "No deleted articles available";
      break;
    case "user_id":
      query = sqlStr + " user_id =" + `'${res.locals.id}' and deleted = false`;
      none_msg = `No articles available for user "${res.locals.username}"`;
      break;
    case "pages":
      query = sqlStr + " article_type = 'site page'";
      none_msg = "No articles page available";
      break;
    case "pending":
      query =
        sqlStr +
        "user_id =" +
        `'${res.locals.id}'` +
        "and published = 'pending'";
      none_msg = `No pending articles available for user "${res.locals.username}"`;
      break;
    default:
      query = sqlStr + "published = 'published' and deleted = false";
      none_msg = "No published articles available";
      break;
  }

  try {
    // console.log(query);
    const result = await pg_pool.query(query);
    // console.log(result.rows);
    result.rows.sort((a, b) => {
      // sort by latest first
      if (a.created_at > b.created_at) return -1;
      if (a.created_at < b.created_at) return +1;
      return 0;
    });

    // Create a signedUrl for each article image (they are in the S3 /cards/ prefix)
    const articles = await Promise.all(
      result.rows.map(async (a) => {
        const key = `cards/${a.title_image.trim()}`;

        let imageUrl = "";
        try {
          imageUrl = await generateSignedUrl(key);
        } catch (err) {
          console.warn("Image missing:", key);
          imageUrl = "/img/no-image.png"; // fallback optional
        }

        return {
          ...a,
          imageUrl,
        };
      })
    );

    res.render("articles/listCards", {
      articles,
      res: res.locals,
      none_msg,
      searchBox: true, // show the articles searchbox on this route only
    });
  } catch (err) {
    res.redirect(
      "/error/A Search Error Has Occurred in route %2Farticles%2F GET"
    );
    return;
  }
});

// Display an article in detail by pressing "Read More..""
// Security: Prevent non admin users from accessing unpublished articles, that dont belong to them
// Note: Currentlty retrieving all articles matching the slug and displayig the first (this is not right)
router.get("/display/:slug", async (req, res) => {
  console.log("req.params.slug", req.params.slug);
  try {
    const result = await pg_pool.query(
      `SELECT * from articles where slug ='${req.params.slug}'`
    );
    if (result.rows.length === 0) {
      console.log("document with slug ", req.params.slug, "not found");
      res.redirect("/");
      return;
    }
    let article = result.rows[0];

    // update the views (no of times the page was accessed)
    const updatedViews = result.rows[0].views + 1;
    await pg_pool.query(
      `UPDATE articles set views ='${updatedViews}' where id = '${result.rows[0].id}'`
    );
    article.views = updatedViews;

    // Process the markdown to get a list of replacements with signedURLs
    let replacements = await replaceMarkdownImages(article.markdown);
    // console.log("replacements", replacements);

    // Convert the MD document to HTML
    article.sanitisedHtml = dompurify.sanitize(
      md.render(article.markdown.trim())
    );

    /* Note: when we reach here the "original" urls will have been changed by dompurify() .. for eg
      ![Bed Brekky](thumbnails/Track B&B Balinyup House.jpg) will be changed to
      ![Bed Brekky](thumbnails/Track B&amp;B Balinyup House.jpg) 
      ie special chars like & in the name will be changed to the HTML special char &amp;
      This means a straigt string replacement of the original will not work
      Instead we need to escape the original also so it will match whats in the converted documnet.
    */

    function escapeEntitiesInMarkdownUrl(md) {
      return md.replace(/\(([^)]+)\)/g, (_, url) => {
        return (
          "(" +
          url
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;") +
          ")"
        );
      });
    }

    // Replace the image references with the signed URLS
    replacements.forEach(({ original, thumbnailSignedUrl, imageSignedUrl }) => {
      console.log("before HTML", article.sanitisedHtml);
      console.log("original", original);
      console.log("---------------------------------------------");
      console.log("thumbnailSignedUrl", thumbnailSignedUrl);
      console.log("---------------------------------------------");
      console.log("iamgeSignedUrl", imageSignedUrl);
      const replacement =
        "<img src=" +
        thumbnailSignedUrl +
        " data-full=" +
        imageSignedUrl +
        " style=max-width: 100%; border-radius: 8px; margin: 20px 0>";
      console.log("---------------------------------------------");
      console.log("replacement", replacement);
      article.sanitisedHtml = article.sanitisedHtml.replace(
        escapeEntitiesInMarkdownUrl(original),
        replacement
      );
      console.log("---------------------------------------------");
      console.log("after", article.sanitisedHtml);
    });

    // render the article
    res.render("articles/show", { article, res: res.locals });
  } catch (err) {
    res.redirect(
      "/error/A Search Error Has Occurred in route %2Farticles%2F:slug GET"
    );
    console.log("error", err);
    return;
  }
});

// Reach here either:
// -by pressing the "edit" button on a card or
// -by selecting file->edit menu item that appeard when a file is being displayed
//
// Security: Prevent non admin users from editing articles that dont belong to them
router.get("/edit/:slug", async (req, res) => {
  console.log("in /edit the path is:", req.path);
  try {
    const result = await pg_pool.query(
      `SELECT * from articles where slug ='${req.params.slug}'`
    );
    if (result.rows.length === 0) res.redirect("/");
    let article = result.rows[0];

    // This is for the preview pane
    const markdownWithImages = await replaceMarkdownImagesInPreview(
      article.markdown.trim()
    );
    article.sanitisedHtml = dompurify.sanitize(
      md.render(markdownWithImages, { res: res.locals })
    );

    res.render("articles/edit", {
      heading: "Edit Article",
      article,
      res: res.locals,
    });
  } catch (err) {
    res.redirect(
      "/error/A Search Error Has Occurred in route %2Farticles%2Fedit%2F:slug"
    );
    return;
  }
});

// replace the $$ surrounding the markdown with single quote
function removeDollarDollar(md, str) {
  return md.replace("$$" + str + "$$", "'" + str + "'");
}

export default router;
