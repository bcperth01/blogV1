import mongoose from "mongoose";
import slugify from "slugify";
import { marked } from "marked";

// see documentation for dompurify
import createDomPurify from "dompurify";
import { JSDOM } from "jsdom";
const dompurify = createDomPurify(new JSDOM().window);

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  markdown: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
  published: {
    type: Boolean,
    default: false,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
  },
  sanitisedHtml: {
    type: String,
    required: true,
  },
});

// populates the slug attribute
articleSchema.pre("validate", function (next) {
  if (this.title) {
    this.slug = slugify(this.title, {
      lower: true,
      strict: true,
    });
  }
  if (this.markdown) {
    this.sanitisedHtml = dompurify.sanitize(marked(this.markdown));
  }
  next();
});

export default mongoose.model("article", articleSchema);
