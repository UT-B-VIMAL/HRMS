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