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
    if (!utils.isValidEmail(item.email)) {
      throw new Error('Invalid email.');
    }

    // set server-side parameters
    const utcMoment = moment().toISOString();
    item.createdAt = utcMoment;
    item.id = utils.getRandomId();
    item.status = consts.PremiumWaitlistLeadStatus.ACTIVE;

    // store to DynamoDb
    let data = await dynamodb
      .put({
        TableName: consts.PremiumWaitlistLeadTableName,
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
