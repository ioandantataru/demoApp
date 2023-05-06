/**
 * Route: POST /get-active-issuers
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const lambdaError = require('../../common/lambdaError');
const jwt_decode = require('jwt-decode');
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
    item.searchString = item.searchString.toLowerCase();

    const limit = item.limit || consts.defaultNumberIssuersReturned;
    const v_from = item.startAfterSortKey || item.searchString;
    const v_to = item.searchString + 'zzz';
    const keyConditionalExpressionValue =
      'partitionKey = :partitionKey AND searchKey BETWEEN :v_from AND :v_to';

    let params = {
      TableName: consts.IssuerSearchKeysTableName,
      KeyConditionExpression: keyConditionalExpressionValue,
      FilterExpression: '#status = :statusActive',
      ExpressionAttributeValues: {
        ':statusActive': consts.SearchKeyStatus.ACTIVE,
        ':partitionKey': item.searchString[0],
        ':v_from': v_from,
        ':v_to': v_to,
      },
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      Limit: limit,
    };

    let data = await dynamodb.query(params).promise();

    return {
      statusCode: 200,
      headers: utils.getResponseHeaderappCors(),
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.log('Error', err);
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
