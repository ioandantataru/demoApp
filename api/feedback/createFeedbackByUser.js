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
    const authToken = event.headers['Authorization'];
    if (!authToken) throw new Error('No auth token found so no username');
    var decodedToken = jwt_decode(authToken);
    if (!decodedToken.username) throw new Error('No username in auth token');

    // set server-side parameters
    const utcMoment = moment().toISOString();
    item.createdAt = utcMoment;
    item.userIdOrEmail = decodedToken.username;
    item.isGuest = false;
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
