/**
 * PreSignUp user function to clean db from previous suer that may have had the same username
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const s3Operations = require('../common/s3Operations');
const utils = require('../common/utils');
const consts = require('../common/consts');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context, callback) => {
  try {
    const username = event.userName;

    //check if there is already a username that matches but was deleted
    let userParams = {
      TableName: consts.UsersTableName,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#status = :statusDeleted',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':statusDeleted': consts.UserStatus.DELETED,
        ':userId': username,
      },
      Limit: 1,
    };

    let userData = await dynamodb.query(userParams).promise();
    if (!_.isEmpty(userData.Items)) {
      let params = {
        TableName: consts.UserResourcesTableName,
        IndexName: 'userId-gsi_issuerId-sort',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': username,
        },
      };

      let data = await dynamodb.query(params).promise();
      if (!_.isEmpty(data.Items)) {
        await Promise.all(
          data.Items.map(async (userResource) => {
            console.log('userResource to delete: ', userResource);
            await dynamodb.delete(
              {
                TableName: consts.UserResourcesTableName,
                Key: {
                  issuerId: userResource.issuerId,
                  userNameAtIssueIssueDateTimeUserResourceTitle:
                    userResource.userNameAtIssueIssueDateTimeUserResourceTitle,
                },
              },
              function (err, data) {
                if (err) {
                  throw new Error(
                    'FAIL: Error deleting item from dynamodb - ' + err
                  );
                }
              }
            );
          })
        );
      }

      //also delete previous user entry
      await dynamodb.delete(
        {
          TableName: consts.UsersTableName,
          Key: {
            userId: username,
          },
        },
        function (err, data) {
          if (err) {
            throw new Error(
              'FAIL: Error deleting previous user data from dynamodb - ' + err
            );
          }
        }
      );

      //also clean-up S3
      await s3Operations.delete(
        username,
        consts.UserIdentityImageBucketName
      );
      await s3Operations.delete(username, consts.UserResourceImageBucketName);
    }

    // Return to Amazon Cognito
    callback(null, event);
  } catch (err) {
    console.log('Error', err);
    // Return error to Amazon Cognito
    callback(err, event);
  }
};
