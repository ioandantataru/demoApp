const AWS = require('aws-sdk');

const s3Client = new AWS.S3({
  accessKeyId: process.env.S3_ACCESSKEY_ID,
  secretAccessKey: S3_SECRET,
});

const s3Operations = {
  async listBucketObjects(prefix, bucket) {
    const params = {
      Bucket: bucket,
      Prefix: prefix,
    };

    let data = await s3Client.listObjectsV2(params).promise();

    if (!data) {
      throw Error(
        `Failed to list file names wth prefix ${prefix}, from ${bucket}`
      );
    }

    if (/\.json$/.test(data)) {
      data = JSON.parse(data.Body.toString());
    }
    return data;
  },
  async get(fileName, bucket) {
    const params = {
      Bucket: bucket,
      Key: fileName,
    };

    let data = await s3Client.getObject(params).promise();

    if (!data) {
      throw Error(`Failed to get file ${fileName}, from ${bucket}`);
    }

    if (/\.json$/.test(fileName)) {
      data = JSON.parse(data.Body.toString());
    }
    return data;
  },
  async write(data, fileName, bucket, ACL, ContentType) {
    const params = {
      Bucket: bucket,
      Body: Buffer.isBuffer(data) ? data : JSON.stringify(data),
      Key: fileName,
      ACL,
      ContentType,
    };
    console.log('params', params);

    const newData = await s3Client.putObject(params).promise();

    if (!newData) {
      throw Error(`There was an error writing the file ${fileName}`);
    }

    return newData;
  },
  async delete(fileName, bucket) {
    const params = {
      Bucket: bucket,
      Key: fileName,
    };
    console.log('params', params);

    const newData = await s3Client.deleteObject(params).promise();

    if (!newData) {
      throw Error(`There was an error deleting the file ${fileName}`);
    }

    return newData;
  },

  // no expiry means url will be valid forever
  async getSignedURL(bucket, fileName, expriySeconds) {
    return s3Client.getSignedUrl('getObject', {
      Bucket: bucket,
      Key: fileName,
      Expires: expriySeconds,
    });
  },
};

module.exports = s3Operations;
