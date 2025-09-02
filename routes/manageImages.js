import {
  listS3Buckets,
  listS3Objects,
  getImageAsBase64,
} from "../utills/awsS3.js";
import express from "express";
const router = express.Router();

/**
 * This module contains the APIs to manage files that live in the public directory or in S3
 * Initially 2 categories of images are envisioned
 * - images that are displayed in the blog entry cards - /public/images for now
 * - images that are embedded in blog texts (S3)
 */

// This API end point displays the screen to manage images
router.get("/images", async function (req, res, next) {
  if (!req.isAuthenticated() || res.locals.member_type !== "admin") {
    // if the user is not logged in or not an admin, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("You are not authorised for this page") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  // Get a list of S3 images to display
  // let S3BucketsList = [];
  let S3ObjectsList = [];
  try {
    // S3BucketsList = await listS3Buckets();
    S3ObjectsList = await listS3Objects("brendanbibtrack");
  } catch (err) {
    console.log("failed to read S3", err);
  }
  // console.log("S3 buckets", S3BucketsList);
  console.log("S3 Objects", S3ObjectsList);

  // read an image and convert it to base64
  let base64Image = await getImageAsBase64(
    "brendanbibtrack",
    "EoghanOnTrack.png"
  );
  // console.log("base64Image", base64Image);
  base64Image = "data:image/jpeg;base64, " + base64Image;
  // base64Image =
  //   "data:image/png;base64, " +
  //   "iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";

  res.render("manage/images", {
    res: res.locals,
    base64Image,
  });
});

// The upload files page
// Security: Must be an admin or member
router.get("/upload", async (req, res) => {
  res.render("uploads/upload", { res: res.locals });
  return;
});
// The upload files page
// Security: Must be an admin or member
//           Must not be accessible as a browser url route
router.post("/upload", (req, res, next) => {
  console.log("req.body", req.body);
  console.log("request", req);
  upload(req, res, function (err) {
    if (err) {
      return res.send("something went wrong");
    }
    res.send("upload Complete");
  });
});

export default router;
