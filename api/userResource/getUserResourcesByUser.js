/**
 * Route: POST /get-userResources-by-issuer
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const lambdaError = require('../../common/lambdaError');
const jwt_decode = require('jwt-decode');
const fileType = require('file-type');
const s3Operations = require('../../common/s3Operations');
const utils = require('../../common/utils');
const consts = require('../../common/consts');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context, callback) => {
  try {
    let item = event.Item;
    if (typeof event.Item === 'string') {
      item = JSON.parse(item);
    }
    if (!utils.validateParams(item)) {
      throw new Error(`Params contain unauthorized string ${consts.Separator}`);
    }

    const authToken = event.headers['Authorization'];
    if (!authToken) throw new Error('No auth token found so no username');
    var decodedToken = jwt_decode(authToken);
    item.userId = decodedToken.username;
    if (!item.userId) throw new Error('No username in auth token');

    const limit = item.limit || consts.defaultNumberUserResourcesReturned;
    let params = {
      TableName: consts.UserResourcesTableName,
      IndexName: 'userId-gsi_issuerId-sort',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#status <> :statusDeleted',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':statusDeleted': consts.UserResourceStatus.DELETED,
        ':userId': item.userId,
      },
      Limit: limit,
    };

    let data = await dynamodb.query(params).promise();
    if (data) {
      return {
        statusCode: 200,
        headers: utils.getResponseHeaderappCors(),
        body: JSON.stringify(data),
      };
    } else {
      throw {
        code: 'ItemNotFound',
        message: `Failed to retrieve any items.`,
        statusCode: 404,
      };
    }
  } catch (err) {
    console.log('Error', err);
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
