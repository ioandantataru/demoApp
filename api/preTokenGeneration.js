/**
 * PreSignUp user function to clean db from previous suer that may have had the same username
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const utils = require('../common/utils');
const consts = require('../common/consts');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context, callback) => {
  try {
    const username = event.userName;

    let params = {
      TableName: consts.UsersTableName,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#status <> :statusDeleted',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':statusDeleted': consts.UserStatus.DELETED,
        ':userId': username,
      },
      Limit: 1,
    };

    let data = await dynamodb.query(params).promise();
    if (!_.isEmpty(data.Items)) {
      const userInfo = data.Items[0];
      event.response = {
        claimsOverrideDetails: {
          claimsToAddOrOverride: {
            preferredName: userInfo.preferredName,
            identityPrivacy: userInfo.identityPrivacy,
            extraFreeUserResources: userInfo.extraFreeUserResources,
            subscriptions: userInfo.subscriptions,
            hasEverPaid: userInfo.hasEverPaid,
            status: userInfo.status,
          },
        },
      };
    }

    // Return to Amazon Cognito
    callback(null, event);
  } catch (err) {
    console.log('Error', err);
    // Return error to Amazon Cognito
    callback(err, event);
  }
};
