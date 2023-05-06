/**
 * Route: POST /createIssuerByUser
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
    let item = event.Item;

    // set server-side parameters
    const utcMoment = moment().toISOString();
    item.createdAt = utcMoment;
    //important to avoid spoofed userIds passed as email
    if (item.userIdOrEmail.indexOf('@') === -1) {
      throw new Error('Invalid email. No @ character found.');
    }
    item.isGuest = true;
    item.feedbackTypeCreatedAt =
      item.feedbackType + consts.Separator + item.createdAt;
    item.isGuestCreatedAt = item.isGuest + consts.Separator + item.createdAt;

    // store to DynamoDb
    let data = await dynamodb
      .put({
        TableName: consts.FeedbackTableName,
        Item: item,
      })
      .promise();

    return {
      statusCode: 200,
      headers: utils.getResponseHeaderappCors(),
      body: JSON.stringify(item),
    };
  } catch (err) {
    console.log('Error', err);
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
