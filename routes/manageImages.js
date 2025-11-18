/**
 * Managing images = 
 *    -Viewing a filtered list of thumbnails with their filenames
 *    -Clicking a thumbnail and displaying the 
 *    -Uploading images (creating thumbnails and saving both thumbnails and full res)
 *    -Deleting images  (both thumbnails and full res)
 * Images are stored in an S3 bucket (process.env.AWS_BUCKET_NAME)
 * The bucket has 2 subdirectories (prefixes)
 *  /images for the images
 *  /thumbnails for the thumbnails
 * Note: There are external node scripts to upload all the images in a directory

 * Using images
 * ---------------
 * Note: To use an image on S3 you need to know its unique name (key) in the bucket
 * Images can be:
 * a) Embedded in documents
 * b) Provide title-imgage for document cards
 */
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { generateSignedUrl } from "../utills/awsS3.js";

import express from "express";
import sharp from "sharp"; // image processing (making thumbnails in this case)
import multer from "multer"; // for uploading files

// This cache avoids reloading a long list of thumbnails from s3 on every reload
import NodeCache from "node-cache";
const cache = new NodeCache({ stdTTL: 3600 }); // 3600 seconds = 1 hour

const router = express.Router();

// Multer setup for uploading images via the drag and drop form
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed!"));
  },
});

/**
 * This module contains the API endpoints to manage files that live in the public directory or in S3
 * Initially 2 categories of images are envisioned
 * - images that are displayed in the blog entry cards - /public/images for now
 * - images that are embedded in blog texts (S3)
 */

// Create an S3 client for use by any endpoints that need it
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// Route to rotate an image - either right or left by 90deg
// TODO: Add security
router.post("/rotate-image", async (req, res) => {
  const { key, direction, focusKey } = req.body;

  if (!key) return res.status(400).send("Missing image key");

  // rotate the thumbnails
  try {
    await rotateImage(key, direction);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error rotating thumbnail image");
  }

  // rotate the cards
  try {
    // ✅ Replace 'thumbnails/' prefix with 'images/'
    let keyNew = key.replace(/^thumbnails\//, "cards/");
    await rotateImage(keyNew, direction);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error rotating card image");
  }

  // rotate the full image
  try {
    // ✅ Replace 'thumbnails/' prefix with 'images/'
    let keyNew = key.replace(/^thumbnails\//, "images/");
    await rotateImage(keyNew, direction);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error rotating full image");
  }

  // update the signed URL of the rotated image
  await updateRotatedImageInCache(key);

  // Append ?focus=<key> to URL so frontend knows which image was rotated
  const redirectUrl = new URL(
    req.get("Referrer") || "/",
    `${req.protocol}://${req.get("host")}`
  );
  redirectUrl.searchParams.set("focus", focusKey);
  res.redirect(redirectUrl.toString());
});

// Local utility cretae a new signedYRL for a rotated image and update the cache
async function updateRotatedImageInCache(key) {
  const list = cache.get("s3_images") || [];

  // Find the item in the cache
  const index = list.findIndex((item) => item.key === key);
  if (index === -1) return;

  // Generate a new signed URL (forces fresh image)
  const newUrl = await generateSignedUrl(key);

  // Replace the cached entry
  list[index] = {
    ...list[index],
    url: newUrl,
  };

  cache.set("s3_images", list);
}

// Local utility to Rotate the image and save to S3
async function rotateImage(key, direction) {
  // Fetch original image from S3
  const data = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );

  const buffer = await streamToBuffer(data.Body);

  const angle = direction === "left" ? -90 : 90;

  // Rotate in memory
  const rotatedBuffer = await sharp(buffer).rotate(angle).toBuffer();

  // Upload rotated image back to S3 (overwrite)
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: rotatedBuffer,
      ContentType: "image/jpeg",
    })
  );
  return;
}

// Local utility to convert S3 stream to Buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

// Remove an item from the cacne
function removeImageFromCache(s3Key) {
  // Load current cache list
  let list = cache.get("s3_images") || [];

  // Remove any object whose key matches the deleted S3 key
  list = list.filter((item) => item.key !== s3Key);

  // Store updated list back into cache
  cache.set("s3_images", list);
}

// Route to delete an image in both /thumbnails and /images
// TODO. This needs to be updated to generate the right keys and do 2 deletes
// TODO: Add security
router.post("/delete-image", async (req, res) => {
  let key = req.body.key; // will be like key thumbnails/Aus Seniors Medal.jpg

  if (!key) return res.status(400).send("Missing image key");

  // delete the image in thumbnails/
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    // delete the image in images/
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key.replace("thumbnails", "images"),
      })
    );

    // update the cache
    removeImageFromCache(key);

    res.redirect(req.get("Referrer") || "/"); // reload the page
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).send("Failed to delete image");
  }
});

// Route to list images - using the cache if its loaded and not expired
// TODO: Add security
// TODO: Change name to listImages (remove the 2)
// 🧩 Helpers

async function getImages(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = cache.get("s3_images");
    if (cached) {
      console.log("🟢 Cache hit");
      return cached;
    }
  }

  console.log("🟡 Cache miss — fetching from S3");
  const data = await s3.send(
    new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: "thumbnails/",
    })
  );

  const images = await Promise.all(
    (data.Contents || []).map(async (obj) => ({
      key: obj.Key,
      title: obj.Key.split("/").pop(),
      url: await generateSignedUrl(obj.Key),
    }))
  );

  cache.set("s3_images", images);
  return images;
}

// here is the actual listImages2 route
router.get("/listImages2", async (req, res) => {
  const filter = (req.query.filter || "").toLowerCase().trim();
  const images = await getImages(); // always returns full cached list
  const filtered = filter
    ? images.filter(
        (img) =>
          img.key.toLowerCase().includes(filter) ||
          img.title.toLowerCase().includes(filter)
      )
    : images;
  res.render("manage/listImages", {
    res: res.locals,
    images: filtered,
    filter,
  });
});

// Endpoint to load the full image (prefix /images/ when the user clicks on the thumbnail
// TODO: Add security
router.get("/getImage/:key", async (req, res, next) => {
  const key = req.params.key;
  console.log("key", key);

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Prefix: "images/",
    });

    // Generate a signed URL valid for 5 minutes
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    // for fun get the metadata for the image (this works - uncomment as needed)
    // const response = await fetch(signedUrl);
    // const arrayBuffer = await response.arrayBuffer();
    // const buffer = Buffer.from(arrayBuffer);
    // const metadata = await sharp(buffer).metadata();
    // console.log("Metadata:", metadata);

    res.json({ url: signedUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load image" });
  }
});

// TODO: Add security
// TODO: Intergrate this with the MD editor to allow embedding the selected image
router.post("/selectImage/:key", (req, res) => {
  const key = decodeURIComponent(req.params.key);
  console.log("Selected image:", key);

  res.send(`You selected: ${key}`);
});

// API to upload an in image that has been drag dropped to the upload modal
router.post("/uploadImage", upload.single("imageFile"), async (req, res) => {
  try {
    // ------------------------------
    // STEP 1: Basic validation
    // ------------------------------
    if (!req.file || !req.body.imageName) {
      return res.status(400).json({ error: "Missing name or file." });
    }

    const originalName = req.body.imageName.trim();
    const safeName = originalName + ".jpg";

    if (!req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Invalid file type." });
    }

    const fullKey = `images/${safeName}`;
    const thumbKey = `thumbnails/${safeName}`;

    // STEP 2: CHECK IF FILE ALREADY EXISTS
    try {
      await s3.send(
        new HeadObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: fullKey,
        })
      );

      // If we reach here → file exists
      return res.status(409).json({
        error: "An image with that name already exists.",
      });
    } catch (err) {
      console.error("HeadObject error:", {
        name: err.name,
        message: err.message,
        code: err.$metadata?.httpStatusCode,
      });

      // Expected: NotFound / 404
      if (err.$metadata && err.$metadata.httpStatusCode === 404) {
        // OK → safe to continue uploading
      } else {
        // Anything else = AWS failure
        return res.status(500).json({
          error: "Unable to check existing objects.",
          details: err.message,
        });
      }
    }

    // ------------------------------
    // STEP 3: Create thumbnail
    // ------------------------------
    const thumbBuffer = await sharp(req.file.buffer)
      .resize(300)
      .jpeg({ quality: 80 })
      .toBuffer();

    // ------------------------------
    // STEP 4: Upload full-size image
    // ------------------------------
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fullKey,
        Body: req.file.buffer,
        ContentType: "image/jpeg",
      })
    );

    // ------------------------------
    // STEP 5: Upload thumbnail
    // ------------------------------
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: thumbKey,
        Body: thumbBuffer,
        ContentType: "image/jpeg",
      })
    );

    // ------------------------------
    // STEP 5B: UPDATE CACHE
    // ------------------------------
    let list = cache.get("s3_images") || [];

    // Add the new image to the cache
    list.push({
      key: thumbKey,
      title: thumbKey.split("/").pop(),
      url: await generateSignedUrl(thumbKey),
    });

    cache.set("s3_images", list);

    // ------------------------------
    // STEP 6: Respond success
    // ------------------------------
    res.json({ success: true });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed." });
  }
});

// 🕒 Automatically refresh S3 cache every 10 minutes
// Disabling this to avoid too much S3 traffic
// const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

// setInterval(async () => {
//   try {
//     console.log("♻️ Refreshing S3 cache...");
//     const images = await getImages(); // getImages() already updates the cache
//     console.log(`✅ Cache refreshed with ${images.length} images`);
//   } catch (err) {
//     console.error("❌ Error refreshing S3 cache:", err.message);
//   }
// }, REFRESH_INTERVAL);

export default router;
