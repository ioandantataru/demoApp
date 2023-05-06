/**
 * Route: POST /delete-user
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const lambdaError = require('../../common/lambdaError');
const jwt_decode = require('jwt-decode');
const moment = require('moment');
const utils = require('../../common/utils');
const consts = require('../../common/consts');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context, callback) => {
  try {
    /*let item = event.Item;
    if (typeof event.Item === 'string') {
      item = JSON.parse(item);
    }*/

    const authToken = event.headers['Authorization'];
    if (!authToken) throw new Error('No auth token found so no username');
    var decodedToken = jwt_decode(authToken);
    if (!decodedToken.username) throw new Error('No username in auth token');
    const userId = decodedToken.username;

    let dataUpdated = await dynamodb
      .update({
        TableName: consts.UsersTableName,
        Key: {
          userId,
        },
        UpdateExpression: 'set #status = :statusDeleted',
        ExpressionAttributeValues: {
          ':statusDeleted': consts.UserStatus.DELETED,
        },
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ReturnValues: 'UPDATED_NEW',
      })
      .promise();

    //TODO: delete S3 pics and userResources

    if (dataUpdated.Attributes.status === consts.UserStatus.DELETED) {
      return {
        statusCode: 200,
        headers: utils.getResponseHeaderappCors(),
      };
    } else {
      throw new Error('Operation failed - user delete operation failed.');
    }
  } catch (err) {
    console.log('Error', err);
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
