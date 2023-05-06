const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });
const lambdaError = require('../../common/lambdaError');
const fileType = require('file-type');
const s3Operations = require('../../common/s3Operations');
const jwt_decode = require('jwt-decode');
const utils = require('../../common/utils');
const consts = require('../../common/consts');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context, callback) => {
  try {
    const authToken = event.headers['Authorization'];
    if (!authToken) throw new Error('No auth token found so no username');
    var decodedToken = jwt_decode(authToken);
    if (!decodedToken.username) throw new Error('No username in auth token');

    let item = event.Item;
    if (typeof event.Item === 'string') {
      item = JSON.parse(item);
    }
    if (!utils.validateParams(item)) {
      throw new Error(`Params contain unauthorized string ${consts.Separator}`);
    }

    const linkId = item.linkId;
    let includeImageData = item.includeImageData;
    if (!includeImageData) includeImageData = false;

    const params = {
      TableName: consts.UserResourcesTableName,
      IndexName: 'linkId-gsi',
      KeyConditionExpression: 'linkId = :linkId',
      FilterExpression:
        '#status <> :statusDeleted AND userId = :userId',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':statusDeleted': consts.UserResourceStatus.DELETED,
        ':linkId': linkId,
        ':userId': decodedToken.username,
      },
      Limit: 1,
    };

    let data = await dynamodb.query(params).promise();

    if (!_.isEmpty(data.Items)) {
      const userResource = data.Items[0];
      const userId = userResource.userId;
      const imagesId = userResource.imagesId;

      if (!userId || !imagesId) {
        throw new Error(`No userId or imagesId received`);
      }

      const objectsData = await s3Operations.listBucketObjects(
        userId + '/' + imagesId + '/ACTIVE/',
        consts.UserResourceImageBucketName
      );

      const fileNames = objectsData.Contents;

      if (!fileNames || (Array.isArray(fileNames) && fileNames.length === 0)) {
        throw new Error(`No files found with given prefix ${imagesId}`);
      }

      const files = [];
      if (includeImageData) {
        for (const fileName of fileNames) {
          let fileData = await s3Operations.get(
            fileName.Key,
            consts.UserResourceImageBucketName
          );
          const file = {
            name: fileName.Key,
            image: fileData.Body,
            type: fileData.ContentType,
            length: fileData.ContentLength,
            lastModified: fileData.LastModified,
          };
          files.push(file);
        }
      } else {
        for (const fileName of fileNames) {
          let url = await s3Operations.getSignedURL(
            consts.UserResourceImageBucketName,
            fileName.Key,
            86400 // 1 day in seconds as expiry
          );
          const file = {
            name: fileName.Key,
            imageUrl: url,
          };
          files.push(file);
        }
      }

      return {
        statusCode: 200,
        headers: utils.getResponseHeaderappCors(),
        body: JSON.stringify(files),
      };
    } else throw 'UserResource not found.';
  } catch (err) {
    console.log('Error', err);
    err.message = err.message;
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
