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
  let log = 'line 17';
  try {
    let item = event.Item;
    if (typeof event.Item === 'string') {
      item = JSON.parse(item);
    }

    const id = item.id;
    log = 'line 25';
    let dataUpdated = await dynamodb
      .update({
        TableName: consts.PremiumWaitlistLeadTableName,
        Key: {
          id,
        },
        UpdateExpression: 'set #status = :statusDeleted',
        ConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':statusDeleted': consts.PremiumWaitlistLeadStatus.DELETED,
          ':email': item.email,
        },
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ReturnValues: 'UPDATED_NEW',
      })
      .promise();

    log = 'line 45';

    if (
      dataUpdated.Attributes.status === consts.PremiumWaitlistLeadStatus.DELETED
    ) {
      return {
        statusCode: 200,
        headers: utils.getResponseHeaderappCors(),
      };
    } else {
      throw new Error('Operation failed - user delete operation failed.');
    }
  } catch (err) {
    console.log('Error', err);
    err.message = err.message + ' --- ' + log;
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
