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
import { addArticle } from "../pgQueries/queries.js";
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
  deleted: false, // true if pending delete
  title_image: "", // The name of an image in the bucket/cards directory
  // likes: 0, // no of likes default 0
  // views: 0, // no of vieww default 0
};

// Home page redirected
// Security: None needed as its a public home page
router.get("/home", async (req, res) => {
  try {
    const result = await pg_pool.query(
      "SELECT markdown from articles where slug='home-page'"
    );
    // if (result.rows.length === 0) res.redirect("/");
    if (result.rows.length === 0) {
      res.render("about/homeEmpty", { article: "", res: res.locals });
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

// Aout page redirected
// Security: None needed as its a public about page
router.get("/about", async (req, res) => {
  try {
    const result = await pg_pool.query(
      "SELECT markdown from articles where slug='about-page'"
    );
    // if (result.rows.length === 0) res.redirect("/");
    if (result.rows.length === 0) {
      res.render("about/aboutEmpty", { article: "", res: res.locals });
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
  res.render("articles/new2", {
    article: { ...blankArticle },
    res: res.locals,
  }); // renders "/views/articles/new.ejs" - the new article form
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
         SET slug = '${editedArticle.slug}', tag_list = '${editedArticle.tag_list}',title = '${editedArticle.title}',\
             description = '${editedArticle.description}', markdown = $$${editedArticle.markdown}$$\
         WHERE id ='${req.params.id}'`
    );

    res.render("articles/edit", { article: editedArticle, res: res.locals });
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
router.delete("/:id", async (req, res) => {
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
    // let response = await pg_pool.query(
    //   `DELETE FROM articles WHERE id = '${req.params.id}'`
    // );
    res.redirect("/");
  } catch (error) {
    res.redirect(
      "/error/A Delete Error Has Occurred in route %2Farticles%2Fdelete:id"
    );
    return;
  }
});

// Display articles route, applying various filters
// Security: TODO: Review this page and add security where needed
router.get("/", async (req, res) => {
  let filter = req.query.filter;
  console.log("filter:", filter); // its user_id by default
  let query = "";
  let none_msg = "";
  let sqlStr =
    "SELECT id, title, slug, description,created_at, author, views, likes,title_image from articles where ";
  switch (filter) {
    case "published":
      query = sqlStr + "published = 'published'";
      none_msg = "No published articles available";
      break;
    case "user_id":
      query = sqlStr + " user_id =" + `'${res.locals.id}'`;
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
      query = sqlStr + "published = 'published'";
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

    // Create a signedUrl for each article (they are in the S3 /cards/ prefix)
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

    res.render("articles/index", {
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
// TODO: Update this so it replaces S3 image links with signed urls
// Note: Currentlty retrieveing all articles matching the slug and displayig the first (this is not right)
router.get("/:slug", async (req, res) => {
  console.log("req.params.slug", req.params.slug);
  try {
    const result = await pg_pool.query(
      `SELECT * from articles where slug ='${req.params.slug}'`
    );
    if (result.rows.length === 0) {
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

    // Replace the image references with the signed URLS
    replacements.forEach(({ original, thumbnailSignedUrl, imageSignedUrl }) => {
      article.sanitisedHtml = article.sanitisedHtml.replace(
        original,
        `<img src="${thumbnailSignedUrl}" data-full="${imageSignedUrl}" style="max-width: 100%; border-radius: 8px; margin: 20px 0;">`
      );
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

// Reach here with /articles/edit/slug
// Security: Prevent non admin users from editing articles that dont belong to them
router.get("/edit/:slug", async (req, res) => {
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

    res.render("articles/edit", { article, res: res.locals });
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
