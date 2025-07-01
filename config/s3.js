const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");  
const path = require('path');  
require('dotenv').config({ path: __dirname + '/../.env' });

const s3Client = new S3Client({
  region: "ap-south-1", 
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

const S3_BUCKET_URL = process.env.S3_BUCKET_URL;

exports.uploadFileToS3 = async (fileContent, fileName) => {
  const fileExtension = path.extname(fileName).toLowerCase();

  let contentType;
  if (fileExtension === '.pdf') {
    contentType = 'application/pdf';
  } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(fileExtension)) {
    contentType = `image/${fileExtension.slice(1)}`;  
  } else {
    contentType = 'application/octet-stream'; 
  }

  const params = {
    Bucket: process.env.S3_BUCKET_NAME, 
    Key: `tickets/${fileName}`, 
    Body: fileContent,   
    ContentType: contentType, 
    ACL : 'public-read',
  };

  try {
    const command = new PutObjectCommand(params);
    const response = await s3Client.send(command);  

    return `${S3_BUCKET_URL}/tickets/${fileName}`;
  } catch (err) {
    console.error('Error uploading file:', err);
    throw new Error("Error uploading file to S3");
  }
};

exports.uploadexpenseFileToS3 = async (fileContent, fileName) => {
  const fileExtension = path.extname(fileName).toLowerCase();

  let contentType;
  if (fileExtension === '.pdf') {
    contentType = 'application/pdf';
  } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(fileExtension)) {
    contentType = `image/${fileExtension.slice(1)}`;  
  } else {
    contentType = 'application/octet-stream'; 
  }

  const params = {
    Bucket: process.env.S3_BUCKET_NAME, 
    Key: `expense/${fileName}`, 
    Body: fileContent,   
    ContentType: contentType, 
    ACL : 'public-read',
  };

  try {
    const command = new PutObjectCommand(params);
    const response = await s3Client.send(command);  
    console.log('Upload Success', response);

    return `${S3_BUCKET_URL}/expense/${fileName}`;
  } catch (err) {
    console.error('Error uploading file:', err);
    throw new Error("Error uploading file to S3");
  }
};

exports.deleteFileFromS3 = async (fileUrl) => {
  try {
    // Extract the S3 key from the file URL
    const fileKey = fileUrl.split(`${S3_BUCKET_URL}/`)[1];

    if (!fileKey) {
      throw new Error("Invalid file URL format");
    }

    const params = {
      Bucket: process.env.S3_BUCKET_NAME, // Your S3 bucket name
      Key: fileKey, // Extracted file key
    };

    // Send delete request to S3
    const command = new DeleteObjectCommand(params);
    await s3Client.send(command);

    console.log(`File ${fileKey} successfully deleted from S3.`);
    return true;
  } catch (error) {
    console.error(`Error deleting file ${fileUrl} from S3:`, error.message);
    throw new Error("Error deleting file from S3");
  }
};

exports.uploadProfileFileToS3 = async (fileContent, fileName) => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME, // Add bucket name as a string
    Key: `profile/${fileName}`, 
    Body: fileContent, 
    ContentType: 'image/jpeg', // Assuming all profile files are JPEG
    ACL: 'public-read',
  };

  try {
    const command = new PutObjectCommand(params);
    const response = await s3Client.send(command);
    console.log('Profile upload success:', response);

    return `${S3_BUCKET_URL}/profile/${fileName}`;
  } catch (error) {
    console.error('Error uploading profile file to S3:', error.message);
    throw new Error("Error uploading profile file to S3");
  }
};

exports.uploadcommentsFileToS3 = async (fileContent, fileName) => {
  const fileExtension = path.extname(fileName).toLowerCase();
console.log("File extension:", fileExtension);

  let contentType;

    if ([".jpg", ".jpeg", ".png"].includes(fileExtension)) {
      contentType = `image/${fileExtension === ".jpg" ? "jpeg" : fileExtension.slice(1)}`;
    } else if (fileExtension === ".pdf") {
      contentType = 'application/pdf';
    } else if (fileExtension === ".docx") {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (fileExtension === ".mp4") {
      contentType = 'video/mp4';
    } else if (fileExtension === ".mov") {
      contentType = 'video/quicktime';
    } else if (fileExtension === ".avi") {
      contentType = 'video/x-msvideo';
    } else {
      throw new Error("Unsupported file type");
    }

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `comments/${fileName}`, // uploaded to comments/ folder
    Body: fileContent,
    ContentType: contentType,
    ACL: "public-read",
  };

  try {
    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    // Return the public URL
    return `${S3_BUCKET_URL}/comments/${fileName}`;
  } catch (err) {
    console.error("Error uploading file to S3:", err);
    throw new Error("Error uploading file to S3");
  }
};
