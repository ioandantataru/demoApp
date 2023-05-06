/**
 * Route: POST /get-user
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
    /*let item = event.Item;
    if (typeof event.Item === 'string') {
      item = JSON.parse(item);
    }*/

    const authToken = event.headers['Authorization'];
    if (!authToken) throw new Error('No auth token found so no username');
    var decodedToken = jwt_decode(authToken);
    if (!decodedToken.username) throw new Error('No username in auth token');

    let params = {
      TableName: consts.UsersTableName,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#status <> :statusDeleted',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':statusDeleted': consts.UserStatus.DELETED,
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
      throw new Error('Failed to retreive user data');
    }
  } catch (err) {
    console.log('Error', err);
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
