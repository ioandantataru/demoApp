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

    let params = {
      TableName: consts.UserResourcesTableName,
      IndexName: 'linkId-gsi',
      KeyConditionExpression: 'linkId = :linkId',
      FilterExpression:
        '#status = :statusActive AND privacyStatus = :privacyStatusPublic',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':statusActive': consts.UserResourceStatus.ACTIVE,
        ':privacyStatusPublic': consts.UserResourcePrivacyStatus.PUBLIC,
        ':linkId': item.linkId,
      },
      Limit: 1,
    };

    let data = await dynamodb.query(params).promise();

    if (!_.isEmpty(data.Items)) {
      //TODO privacy settings
      const userResource = data.Items[0];
      if (
        !userResource.privacyStatus === consts.UserResourcePrivacyStatus.PUBLIC
      ) {
        throw {
          code: 'ItemNotPublic',
          message: `${item.linkId} is not shared publicly`,
          statusCode: 403,
        };
      }

      return {
        statusCode: 200,
        headers: utils.getResponseHeaderappCors(),
        body: JSON.stringify(data.Items[0]),
      };
    } else {
      throw {
        code: 'ItemNotFound',
        message: `Failed to retrieve item with linkId: ${item.linkId}`,
        statusCode: 404,
      };
    }
  } catch (err) {
    console.log('Error', err);
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
