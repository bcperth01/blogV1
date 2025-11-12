/**
 * Managing images = Viewing, uploading and deleting images, as well as making verions with less resolution
 * Images for the site are stored in an S3 bucket
 * The bucket has 2 subdirectories (These were upload to S3 using a script)
 *  /images for the images
 *  /thumbnails for the thumbnails
 *
 * --------------------------------------------
 * 1) Screen to list S3 images in the "brendanbibtrack" bucket, with thumbnail
 *    Functions to:
 *    - popup to view a full-size image
 *    - button to add a new image
 *        - select an image via a html input form
 *        - upload it to express and create a thumbnail
 *        - enter a name for the image and use name-tn.ext for the thumbnail
 *        - save the image and its thumbnail to S3
 *        - after the save refresh the list images view
 *    - button to delete an image
 *        - add a confirmation screen
 *        - after the save refresh the list images view
 *
 * Using images
 * ---------------
 * Note: To use an image on S3 you need to know its unique name in the bucket
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
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  listS3Objects,
  getImageFromS3,
  saveImageToS3,
} from "../utills/awsS3.js";
import express from "express";
import sharp from "sharp"; // image processing (making thumbnails in this case)
import multer from "multer";
import fs from "fs";

const router = express.Router();

// Set up multer for local disc storage
let storage = multer.diskStorage({
  destination: function (req, file, callback) {
    const dir = "./uploads";
    if (!fs.existsSync(dir)) {
      console.log("directory not exists", dir);
      fs.mkdirSync(dir);
    }
    callback(null, dir);
  },
  filename: function (req, file, callback) {
    const date = new Date();
    callback(null, date.toISOString().split("T")[0] + "-" + file.originalname); // Add timestamp to the filename to avoid conflicts
  },
});

// the upload callback for the /uploadToServer route
// NOTE: multer uses the HTML form data to get the file(s) to upload
//       My form has the input name: files
//       This must match the "files" parameter below or multer will error out
// NOTE: In the form add 'multiple'to the <input> tag to allow the form to select multiple files to upload
// NOTE: User .single() or .array() as below to tell multer to process single or multiple files
// NOTE: If multer processes a single file it adds req.file object like
// {
//   fieldname: 'files',
//   originalname: '1000001613.jpg',
//   encoding: '7bit',
//   mimetype: 'image/jpeg',
//   destination: './uploads',
//   filename: '1000001613.jpg',
//   path: 'uploads/1000001613.jpg',
//   size: 2015595
// }
//       If multer processes multiple files its add req.files array of objects
// let upload = multer({ storage: storage }).array("files", 12); // max 12 files in one upload
let upload = multer({ storage: storage }).single("files"); // one file per upload

// Set up multer for uploading to to a buffer
// Use multer with memory storage (buffer, not disk)
const storageBuffer = multer.memoryStorage();
// const uploadToBuffer = multer({ storage: storageBuffer }).single("files");
const uploadToBuffer = multer({ storage: storageBuffer }).array("files", 12);

/**
 * This module contains the APIs to manage files that live in the public directory or in S3
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
  const { key, direction } = req.body;

  if (!key) return res.status(400).send("Missing image key");

  // rotate the thumbnail
  try {
    await rotateImage(key, direction);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error rotating thumbnail image");
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

  // Append ?focus=<key> to URL so frontend knows which image was rotated
  const redirectUrl = new URL(
    req.get("Referrer") || "/",
    `${req.protocol}://${req.get("host")}`
  );
  redirectUrl.searchParams.set("focus", req.body.focusKey);
  res.redirect(redirectUrl.toString());
});

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

// Route to delete an image in both /thumbnails and /images
// TODO. This needs to be updated to generate the right keys and do 2 deletes
// TODO: Add security
router.post("/delete-image", async (req, res) => {
  const { key } = req.body;

  if (!key) return res.status(400).send("Missing image key");

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    res.redirect(req.get("Referrer") || "/"); // reload the page
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).send("Failed to delete image");
  }
});

// Route to list images
// TODO: Add security
// TODO: Change name to listImages (remove the 2)
router.get("/listImages2", async (req, res) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "thumbnails/",
    });
    const data = await s3.send(command);

    // 🔥 Filter only images beginning with Track (modified part)
    const filtered = (data.Contents || []).filter((obj) => {
      const filename = obj.Key.split("/").pop(); // extract filename
      return filename && filename.startsWith("Track");
    });

    const images = await Promise.all(
      (filtered || []).map(async (obj) => {
        const getObjectParams = { Bucket: BUCKET_NAME, Key: obj.Key };
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand(getObjectParams),
          { expiresIn: 3600 }
        );
        //console.log("Obj", obj);
        return { key: obj.Key, url, size: obj.Size };
      })
    );

    res.render("manage/listImages", { res: res.locals, images });
  } catch (err) {
    console.error("Error listing images:", err);
    res.status(500).send("Error listing images from S3");
  }
});
/**
 * End of ChatGPT5 code
 */

// This is linked to listImages.ejs to retrieve and image when the user clicks on the thumbnail
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

/*********************************************************************
 * Everything below here needs to be reviewed and deleted if necessary
 *********************************************************************/

// Route to Display screen to upload an image to the server
// Security: Must be an admin or member
// TODO: Add security
router.get("/uploadToServer", async (req, res) => {
  res.render("uploads/uploadServer", { res: res.locals });
  return;
});

// Route to upload an image to the server
// TODO:
// Security: Must be an admin or member
//           Must not be accessible as a browser url route
router.post("/uploadToServer", (req, res) => {
  upload(req, res, function (err) {
    if (err) {
      console.log("err", err);
      return res.send(
        `Upload of "${req.file.originalname}" to /uploads on server Failed`
      );
    }
    console.log("filename in /uploadToServer:", req.file);
    res.send(
      `upload of "${req.file.originalname}" to /uploads on server Complete`
    );
  });
});

// Display screen to upload an image to S3
// Security: Must be an admin or member
router.get("/uploadToS3", async (req, res) => {
  res.render("uploads/uploadS3", { res: res.locals });
  return;
});

// Route to upload images(s) - make thumbnail(s)
// - and upload both to the server
// TODO:
// Security: Must be an admin or member
//           Must not be accessible as a browser url route
router.post("/uploadToS3", (req, res, next) => {
  uploadToBuffer(req, res, async function (err) {
    if (err) {
      console.log("err", err);
      return res.send(`Upload of files to server Failed`);
    }
    // The upoaded files should be in the memory buffer here
    let saveToS3status = [];
    for (let n = 0; n < req.files.length; n++) {
      console.log("filename in /uploadToS3:", req.files[n].originalname);
      // Resize using sharp
      const resizedImage = await sharp(req.files[n].buffer)
        .resize(200, 200)
        .toFormat("jpeg")
        .jpeg({ quality: 80 })
        .toBuffer();
      try {
        console.log("Saving ", req.files[n].originalname, " to S3");
        await saveImageToS3(
          "brendanbibtrack",
          req.files[n].originalname,
          // req.files[n].buffer,
          resizedImage,
          req.files[n].mimetype
        );
        saveToS3status[
          n
        ] = `upload of "${req.files[n].originalname}" to S3 Complete`;
      } catch (error) {
        console.log(error);
        saveToS3status[
          n
        ] = `upload of "${req.files[n].originalname}" to S3 Failed`;
      }
    }
    res.send(saveToS3status.join("\n"));
  });
});

export default router;
