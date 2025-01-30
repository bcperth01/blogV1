import express from "express";
import Article from "../models/article.js";
const router = express.Router();

// Reach here with /articles/new
router.get("/new", (req, res) => {
  res.render("articles/new", { article: new Article() }); // renders "/views/articles/new.ejs" - the new article form
});

// Reach here with a POST to /articles/
router.post("/", async (req, res) => {
  let article = new Article({
    title: req.body.title,
    description: req.body.description,
    markdown: req.body.markdown,
  });
  try {
    article = await article.save();
    res.redirect(`/articles/${article.slug}`); // redirect to /articles/id to display the new saved blog
  } catch (error) {
    res.render("articles/new", { article }); // renders "/views/articles/new.ejs" - the new article form, which should show the values already entered
  }
});

router.put(
  "/:id",
  async (req, res, next) => {
    req.article = await Article.findById(req.params.id);
    next();
  },
  saveArticleAndRedirect("edit")
);

router.delete("/:id", async (req, res) => {
  await Article.findByIdAndDelete(req.params.id);
  res.redirect("/");
});

// Reach here with /articles/slug
router.get("/:slug", async (req, res) => {
  const article = await Article.findOne({ slug: req.params.slug });
  if (article == null) res.redirect("/");
  res.render("articles/show", { article }); // renders "/views/articles/show.ejs" - to show the current article
});

// Reach here with /articles/edit/id
router.get("/edit/:slug", async (req, res) => {
  const article = await Article.findOne({ slug: req.params.slug });
  if (article == null) res.redirect("/");
  res.render("articles/edit", { article });
});

function saveArticleAndRedirect(path) {
  return async (req, res) => {
    let article = req.article;
    article.title = req.body.title.trim();
    article.description = req.body.description.trim();
    article.markdown = req.body.markdown.trim();
    try {
      article = await article.save();
      res.redirect(`/articles/${article.slug}`);
    } catch (e) {
      res.render(`articles/${path}`, { article: article });
    }
  };
}

export default router;
