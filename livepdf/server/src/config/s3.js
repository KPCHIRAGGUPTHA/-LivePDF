const { S3Client } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const isMock = !process.env.AWS_ACCESS_KEY_ID || 
               process.env.AWS_ACCESS_KEY_ID.startsWith('dummy') || 
               process.env.AWS_ACCESS_KEY_ID.startsWith('your_') || 
               process.env.AWS_ACCESS_KEY_ID === '';

let s3;
if (isMock) {
  console.log('⚠️ AWS credentials not set or set to dummy. Running S3 in Mock Mode (storing files locally).');
  const uploadsDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  s3 = {
    isMock: true,
    uploadsDir,
  };
} else {
  s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

module.exports = s3;
