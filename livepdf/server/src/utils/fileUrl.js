const s3 = require('../config/s3');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: getAWSSignedUrl } = require('@aws-sdk/s3-request-presigner');

/**
 * Generates a signed URL for S3 downloads, or a local server relative URL in Mock Mode.
 * @param {string} key - S3 object key.
 * @param {object} req - Express request object.
 * @returns {Promise<string>} Signed download URL.
 */
async function getFileUrl(key, req) {
  if (s3.isMock) {
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/api/documents/mock-download/${key}`;
  }

  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  });
  return await getAWSSignedUrl(s3, command, { expiresIn: 900 }); // 15 min
}

module.exports = { getFileUrl };
