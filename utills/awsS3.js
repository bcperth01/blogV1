import {
  S3Client,
  ListObjectsV2Command,
  ListBucketsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// This is used anywhere S3 images are being displayed.
export async function generateSignedUrl(Key) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key,
  });
  return await getSignedUrl(s3, command, { expiresIn: 3600 });
}

// Utility function to locate image references and get the signed urls
// If an image is a thumbnail, then we can click it to display the full image
export async function replaceMarkdownImages(markdown) {
  const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;

  const replacements = [];

  let match;
  while ((match = imageRegex.exec(markdown)) !== null) {
    const embeddedKey = match[1];
    // if the embedded image is a full image then the thumbnailSignedUrl and imageSignedUrl will be the same
    // if the embedded image  is a thumbnail then the thumbnailSignedUrl and imageSignedUrl will be the same

    // generate signed URL for the embedded image (mostly should be thumbnails)
    let command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: embeddedKey,
    });
    const thumbnailSignedUrl = await getSignedUrl(s3, command, {
      expiresIn: 3600,
    });

    let imageSignedUrl = "";
    // Generate a signed url for the full image if embedded image is a thumbnail
    if (embeddedKey.startsWith("thumbnails")) {
      command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: embeddedKey.replace("thumbnails", "images"),
      });
      imageSignedUrl = await getSignedUrl(s3, command, {
        expiresIn: 3600,
      });
      console.log("Changing imageSignedURL to", imageSignedUrl);
    } else {
      // If the embedded image is a full image then use that
      imageSignedUrl = thumbnailSignedUrl;
    }

    replacements.push({
      original: match[0],
      thumbnailSignedUrl,
      imageSignedUrl,
    });
  }

  return replacements;
}

// Save a memory buffer based image to S3
export async function saveImageToS3(
  bucketName,
  originalname,
  buffer,
  mimetype
) {
  console.log("in saveImageToS3() ");
  console.log(bucketName, originalname, mimetype);
  // Create S3 upload parameters
  const date = new Date();

  const params = {
    Bucket: bucketName,
    Key: date.toISOString().split("T")[0] + "-" + originalname, // Unique filename
    Body: buffer,
    ContentType: mimetype,
    //ACL: "public-read", // Make file publicly accessible (optional)
  };

  // Upload to S3
  const command = new PutObjectCommand(params);
  try {
    await s3.send(command);
    return;
  } catch (err) {
    console.error("S3 Upload Error:", err);
    throw new Error("S3 Upload Error");
  }
} // end upload to S3

// Get an image from S3 as a signed url
export async function getImageFromS3(bucketName, objectKey) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    // Try to get a signed url
    const url = await getSignedUrl(s3, command, {
      expiresIn: 30,
    });
    // console.log("url", url);

    // const data = await s3Client.send(command);
    // return data.Body; // This is a Readable stream
    return url;
  } catch (error) {
    console.error("Error retrieving image URL from S3:", error);
    return { err: "Error retrieving image URL from S3" };
  }
}

// Get an image from S3 as a stream and convert it to base64 (for display in EJS)
export async function getImageAsBase64(bucketName, objectKey) {
  try {
    const imageStream = await getImageFromS3(bucketName, objectKey);
    if (imageStream.err) return { err: "Error retrieving image from S3" };

    const chunks = [];
    for await (const chunk of imageStream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return buffer.toString("base64"); // this is the base64
  } catch (error) {
    console.error("Error converting image to Base64:", error);
    return { err: "Error converting image to Base64" };
  }
}

// Function to read the list of buckets
export const listS3Buckets = async () => {
  try {
    const command = new ListBucketsCommand({});
    const data = await s3.send(command);
    return data.Buckets; // an array like {Name:"bucketName", CreationDate:2025-08-26T02:28:14.000Z}
  } catch (error) {
    console.error("Error listing S3 buckets:", error);
    return [{ err: "Error listing S3 buckets:" }];
  }
};

// Function to read an S3 bucket Files
export const listS3Objects = async (bucketName) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      // Optional: Add Prefix to list objects within a specific "folder"
      // Prefix: "path/to/folder/",
      // Optional: Add Delimiter to list "folders" (common prefixes)
      // Delimiter: "/",
    });

    let isTruncated = true;
    let contents = [];
    let continuationToken;

    while (isTruncated) {
      const { Contents, IsTruncated, NextContinuationToken } = await s3.send(
        command
      );
      if (Contents) {
        contents = contents.concat(Contents);
      }
      isTruncated = IsTruncated;
      continuationToken = NextContinuationToken;
      command.input.ContinuationToken = continuationToken; // Set token for next iteration
    }

    // Extract just the keys (filenames)
    const fileNames = contents.map((obj) => obj.Key);
    return fileNames;
  } catch (err) {
    console.error("Error listing S3 objects:", err);
    throw err;
  }
};
