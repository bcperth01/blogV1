import express from "express";
import mongoose from "mongoose";
import articlesRouter from "./routes/articles.js";
import Article from "./models/article.js";
import methodOverride from "method-override";

mongoose.connect("mongodb://localhost/blog");

const app = express();

// Note: Render an ejs view with res.render("/pages/About") - this will look for "/views/pages/About"
app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: false })); // extracts the body to make it available as res.body

app.use(methodOverride("_method")); // the string we use to indicate the desired method (that is not native to Form submit)

// creates a route to "/articles" - allows to create a subdirectory /articles where all /articles/routes are defined an maintained
app.use("/articles", articlesRouter);

// Home route only displays a list of articles for now
app.get("/", async (req, res) => {
  const articles = await Article.find().sort({ createdAt: "desc" });
  res.render("articles/index", { articles: articles }); // Note: res.render NOT res.send - will render "/views/articles/index.ejs"
});

app.listen(5001);
