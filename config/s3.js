const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");  
const path = require('path');  
require('dotenv').config({ path: __dirname + '/../.env' });

const s3Client = new S3Client({
  region: "ap-south-1", 
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

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
    Bucket: "unity-hrms", 
    Key: `tickets/${fileName}`, 
    Body: fileContent,   
    ContentType: contentType, 
    ACL : 'public-read',
  };

  try {
    const command = new PutObjectCommand(params);
    const response = await s3Client.send(command);  
    console.log('Upload Success', response);

    return `unity-hrms.s3.ap-south-1.amazonaws.com/tickets/${fileName}`;
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
    Bucket: "unity-hrms", 
    Key: `expense/${fileName}`, 
    Body: fileContent,   
    ContentType: contentType, 
    ACL : 'public-read',
  };

  try {
    const command = new PutObjectCommand(params);
    const response = await s3Client.send(command);  
    console.log('Upload Success', response);

    return `unity-hrms.s3.ap-south-1.amazonaws.com/expense/${fileName}`;
  } catch (err) {
    console.error('Error uploading file:', err);
    throw new Error("Error uploading file to S3");
  }
};
exports.deleteFileFromS3 = async (fileUrl) => {
  try {
    // Extract the S3 key from the file URL
    const fileKey = fileUrl.split('unity-hrms.s3.ap-south-1.amazonaws.com/')[1];

    if (!fileKey) {
      throw new Error("Invalid file URL format");
    }

    const params = {
      Bucket: "unity-hrms", // Your S3 bucket name
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