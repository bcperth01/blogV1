import {
  S3Client,
  ListObjectsV2Command,
  ListBucketsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

  // open the S3 client with the correct credentials
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

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
    await s3Client.send(command);
    return;
  } catch (err) {
    console.error("S3 Upload Error:", err);
    throw new Error("S3 Upload Error");
  }
} // end upload to S3

// Get an image from S3 as a signed url
export async function getImageFromS3(bucketName, objectKey) {
  // open the S3 client with the correct credentials
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    // Try to get a signed url
    const url = await getSignedUrl(s3Client, command, {
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
  // open the S3 client with the correct credentials
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  try {
    const command = new ListBucketsCommand({});
    const data = await s3Client.send(command);
    return data.Buckets; // an array like {Name:"bucketName", CreationDate:2025-08-26T02:28:14.000Z}
  } catch (error) {
    console.error("Error listing S3 buckets:", error);
    return [{ err: "Error listing S3 buckets:" }];
  }
};

// Function to read an S3 bucket Files
export const listS3Objects = async (bucketName) => {
  // open the S3 client with the correct credentials
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
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
      const { Contents, IsTruncated, NextContinuationToken } =
        await s3Client.send(command);
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
