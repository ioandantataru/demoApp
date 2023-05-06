/**
 * Route: POST /get-userResource
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const lambdaError = require('../../common/lambdaError');
const jwt_decode = require('jwt-decode');
const utils = require('../../common/utils');
const consts = require('../../common/consts');
const _ = require('underscore');

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
    if (!decodedToken.username) throw new Error('No username in auth token');

    let params = {
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
        ':linkId': item.linkId,
        ':userId': decodedToken.username,
      },
      Limit: 1,
    };

    let data = await dynamodb.query(params).promise();
    if (!_.isEmpty(data.Items)) {
      return {
        statusCode: 200,
        headers: utils.getResponseHeaderappCors(),
        body: JSON.stringify(data.Items[0]),
      };
    } else {
      throw {
        code: 'ItemNotFound',
        message: `Failed to retrieve item with id: ${item.id}`,
        statusCode: 404,
      };
    }
  } catch (err) {
    console.log('Error', err);
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
