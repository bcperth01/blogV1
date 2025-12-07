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
import { requireAuth } from "./auth.js";
import { requireRole } from "./auth.js";
import { requireNoUnpublished } from "./auth.js";
import { requireOwner } from "./auth.js";

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
          '<pre class="hljs"><code>' +
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
    console.log("No Language set in markdown - default javascript");
    return (
      '<pre class="hljs"><code>' +
      hljs.highlight(str, { language: "javascript" }).value +
      "</code></pre>"
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
  likes: 0, // no of likes default 0
  views: 0, // no of vieww default 0
};

/* File->save 
    Handles saving of new files as well as existing files
    Note: This is called as an AJAX call, and so returns to the client Javascript
    which is able to show success/fail messages/toasts and redirect afterwards
    This is different from a form submittal, where the server route does the redirecting
*/
router.post(
  "/saveArticle",
  requireRole("admin", "member"),
  async (req, res) => {
    const { title, description, tag_list, title_image, markdown, path, id } =
      req.body;
    // Note: path is a hidden field in the edit form - this path is the path that called the API
    //       Also the current path "/saveArtice" is in req.path

    const slug = slugify(title, {
      lower: true,
      strict: true,
    });

    console.log("slug:      ", slug);
    console.log("path:       ", path);

    // Attempt to read the article - should be either none (if new) or only 1 (if existing)
    let articles = await pg_pool.query(
      `
      SELECT id, user_id
      FROM articles
      WHERE slug = $1
    `,
      [slug]
    );

    // **************************
    // Check if its a new file
    // **************************
    if (path === "new" || path.startsWith("/articles/new")) {
      console.log("Creating new file...");
      // create new article logic here
      // first make sure the title is unique
      if (articles.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Article title already exists: "${title}"`,
        });
      }
      // save new article
      let newArticle = { ...blankArticle };
      newArticle.title = title.trim();
      newArticle.description = description.trim();
      newArticle.tag_list = tag_list.trim();
      newArticle.title_image = title_image.trim();
      newArticle.user_id = req.user.id;
      newArticle.author = req.user.username;
      newArticle.markdown = removeDollarDollar(
        markdown.trim(),
        "${newArticle.markdown}"
      );
      newArticle.slug = slug;

      // create the insert fields dynamically
      const keys = Object.keys(newArticle);
      const values = Object.values(newArticle);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

      sql = `
      INSERT INTO articles (${keys.join(", ")})
      VALUES (${placeholders})
      RETURNING *
    `;

      try {
        // run the insert command
        const result = await pg_pool.query(sql, values);
        console.log("Result", result.rows[0]);
        res.json({ success: true, slug: newArticle.slug }); // return to the client
      } catch (error) {
        console.log("error", error);
        res.status(500).json({
          success: false,
          message: "Server error while saving new article.",
        });
      }
    } else {
      // **********************************
      // Saving changes to an existing file
      // **********************************
      // check that the owner of the file matches the logged in user or is the admin
      // Note: This should be done in middleware - buat after refactor to make split this route
      // into separate /edit and /new routes
      console.log(res.locals);
      if (
        res.locals.member_type !== "admin" &&
        articles.rows[0].user_id !== res.locals.id
      ) {
        return res.redirect(
          "/auth/unauthorised?err_msg=" +
            encodeURIComponent("Not Authorised") +
            "&title=" +
            encodeURIComponent(
              "You are not allowed to edit articles you dont own"
            ) +
            "&route=" +
            encodeURIComponent("/")
        );
      }
      console.log("Updating existing file:", path, "id", id);
      ///Now change the fields that could have been edited and their derived fields

      // // This is for the preview pane
      // const markdownWithImages = await replaceMarkdownImagesInPreview(
      //   markdown.trim()
      // );

      let cleanMarkdown = removeDollarDollar(markdown.trim(), "${markdown}");
      // console.log("editArticle", editedArticle);
      // save the changes
      try {
        const saveResult = await pg_pool.query(
          `UPDATE articles \
         SET slug = '${slug}', tag_list = '${tag_list.trim()}',title = '${title.trim()}', title_image = '${title_image.trim()}',\
             description = '${description.trim()}', markdown = $$${cleanMarkdown}$$\
         WHERE id ='${id}'`
        );
        res.json({ success: true, slug }); // return to the client
      } catch (error) {
        console.log("error", error);
        res.status(500).json({
          success: false,
          message: "Server error while saving article edits.",
        });
      }
    }
  }
);

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
router.get("/search", async (req, res) => {
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
 *       route specific logic
 */
// Reach here with /articles/new
router.get("/new", requireRole("admin", "member"), (req, res) => {
  res.render("articles/edit", {
    article: { ...blankArticle },
    heading: "New Article",
    res: res.locals,
  }); // renders "/views/articles/edit.ejs"
});

// Delete an article from the Home page list
// Must be logged in and either admin or member who owns the file
router.delete("/delete", requireOwner, async (req, res) => {
  try {
    console.log("deleting article:", req.body.slug);
    // Mark the article as deleted
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
router.get("/cards", async (req, res) => {
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
router.get("/display/:slug", requireNoUnpublished, async (req, res) => {
  console.log("req.params", req.params);
  try {
    let article = req.article;
    console.log("article", article);

    // update the views (no of times the page was accessed)
    const updatedViews = article.views + 1;
    await pg_pool.query(
      `UPDATE articles set views ='${updatedViews}' where id = '${article.id}'`
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
      // console.log("before HTML", article.sanitisedHtml);
      // console.log("original", original);
      // console.log("---------------------------------------------");
      // console.log("thumbnailSignedUrl", thumbnailSignedUrl);
      // console.log("---------------------------------------------");
      // console.log("iamgeSignedUrl", imageSignedUrl);
      const replacement =
        "<img src=" +
        thumbnailSignedUrl +
        " data-full=" +
        imageSignedUrl +
        " style=max-width: 100%; border-radius: 8px; margin: 20px 0>";
      // console.log("---------------------------------------------");
      // console.log("replacement", replacement);
      article.sanitisedHtml = article.sanitisedHtml.replace(
        escapeEntitiesInMarkdownUrl(original),
        replacement
      );
      // console.log("---------------------------------------------");
      // console.log("after", article.sanitisedHtml);
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
// Security: User must be logged in and own the file or be an admin
router.get("/edit/:slug", requireOwner, async (req, res) => {
  console.log("in /edit the path is:", req.path);
  try {
    let article = req.article; // article is returned in req by the requireOwner middleware

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
