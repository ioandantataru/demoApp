const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });
const lambdaError = require('../../common/lambdaError');
const jwt_decode = require('jwt-decode');
const fileType = require('file-type');
const s3Operations = require('../../common/s3Operations');
const utils = require('../../common/utils');
const consts = require('../../common/consts');

exports.handler = async (event, context, callback) => {
  try {
    let item = event.Item;
    if (typeof event.Item === 'string') {
      item = JSON.parse(item);
    }
    //We expect one 'Separator' instance
    //if (!utils.validateParams(item)) {
    //  throw new Error(`Params contain unauthorized string ${consts.Separator}`);
    //}

    const authToken = event.headers['Authorization'];
    if (!authToken) throw new Error('No auth token found so no username');
    var decodedToken = jwt_decode(authToken);
    if (!decodedToken.username) throw new Error('No username in auth token');

    const fileName = item.fileName;
    const splitFileName = fileName.split('/');

    if (!fileName) {
      throw new Error(`No fileName received`);
    } else if (splitFileName.length !== 4 || splitFileName[2] !== 'ACTIVE') {
      throw new Error(`File name ${fileName} is invlaid`);
    } else if (splitFileName[0] !== decodedToken.username) {
      return {
        statusCode: 403,
        headers: utils.getResponseHeaderappCors(),
        body: JSON.stringify('Unauthorized - not your file'),
      };
    }

    let file = await s3Operations.get(
      fileName,
      consts.UserResourceImageBucketName
    );
    if (!file) {
      throw new Error(`No file found with given file name ${fileName}`);
    }

    const newFileName =
      splitFileName[0] +
      '/' +
      splitFileName[1] +
      '/DELETED/' +
      splitFileName[3];

    /*let buffer = file.Body;
    if (utils.isJsonObject(buffer)) {
      buffer = JSON.parse(buffer);
    }
    if (buffer.data) {
      buffer = buffer.data;
      if (utils.isJsonObject(buffer)) {
        buffer = JSON.parse(buffer);
      }
    }*/

    console.log(
      `Writing image to bucket called ${consts.UserResourceImageBucketName}`
    );
    const s3DataForFile = await s3Operations.write(
      file.Body,
      newFileName,
      consts.UserResourceImageBucketName,
      null,
      file.ContentType
    );

    console.log(
      `Deleting image from bucket called ${consts.UserResourceImageBucketName}`
    );
    const s3DataForFileDelete = await s3Operations.delete(
      fileName,
      consts.UserResourceImageBucketName
    );

    const returnObj = {
      s3DataForFile: s3DataForFile,
      s3DataForFileDelete: s3DataForFileDelete,
    };

    return {
      statusCode: 200,
      headers: utils.getResponseHeaderappCors(),
      body: JSON.stringify(returnObj),
    };
  } catch (err) {
    console.log('Error', err);
    err.message = err.message;
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
