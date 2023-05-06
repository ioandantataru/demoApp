/**
 * Route: POST /delete-userResource
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const lambdaError = require('../../common/lambdaError');
const jwt_decode = require('jwt-decode');
const moment = require('moment');
const utils = require('../../common/utils');
const consts = require('../../common/consts');

const dynamodb = new AWS.DynamoDB.DocumentClient();

/*
- AttributeName: userResourceTypeStatusStudentId
  AttributeType: S
- AttributeName: validityLevelStatusCreatedAt
  AttributeType: S
- AttributeName: statusValidityLevelCreatedAt
  AttributeType: S
*/

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
      IndexName: 'id-gsi',
      KeyConditionExpression: 'id = :id',
      FilterExpression:
        '#status <> :statusDeleted AND userId = :userId',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':statusDeleted': consts.UserResourceStatus.DELETED,
        ':id': item.id,
        ':userId': decodedToken.username,
      },
      Limit: 1,
    };

    let data = await dynamodb.query(params).promise();
    if (!_.isEmpty(data.Items)) {
      const utcMoment = moment().toISOString();
      const issuerId = data.Items[0].issuerId;
      const status = data.Items[0].status;
      const userNameAtIssue = data.Items[0].userNameAtIssue;
      const userResourceTitle = data.Items[0].userResourceTitle;
      const userResourceType = data.Items[0].userResourceType;
      const studentId = data.Items[0].studentId;
      const validityLevel = data.Items[0].validityLevel;
      const createdAt = data.Items[0].createdAt;
      const issueDateTime = data.Items[0].issueDateTime;
      if (issuerId && status && userNameAtIssue && issueDateTime) {
        const userNameAtIssueIssueDateTimeUserResourceTitle =
          userNameAtIssue +
          consts.Separator +
          issueDateTime +
          consts.Separator +
          userResourceTitle;
        const userResourceTypeStatusStudentId =
          userResourceType +
          consts.Separator +
          consts.UserResourceStatus.DELETED +
          consts.Separator +
          studentId;
        const validityLevelStatusCreatedAt =
          validityLevel +
          consts.Separator +
          consts.UserResourceStatus.DELETED +
          consts.Separator +
          createdAt;
        const statusValidityLevelCreatedAt =
          consts.UserResourceStatus.DELETED +
          consts.Separator +
          validityLevel +
          consts.Separator +
          createdAt;

        let dataUpdated = await dynamodb
          .update({
            TableName: consts.UserResourcesTableName,
            Key: {
              issuerId,
              userNameAtIssueIssueDateTimeUserResourceTitle,
            },
            UpdateExpression:
              'set #status = :statusDeleted, updatedAt = :dateTimeUpdated, userResourceTypeStatusStudentId = :userResourceTypeStatusStudentId, validityLevelStatusCreatedAt = :validityLevelStatusCreatedAt, statusValidityLevelCreatedAt = :statusValidityLevelCreatedAt',
            ConditionExpression: 'updatedAt = :oldUpdatedAt',
            ExpressionAttributeValues: {
              ':statusDeleted': consts.UserResourceStatus.DELETED,
              ':dateTimeUpdated': utcMoment,
              ':oldUpdatedAt': data.Items[0].updatedAt,
              ':userResourceTypeStatusStudentId': userResourceTypeStatusStudentId,
              ':validityLevelStatusCreatedAt': validityLevelStatusCreatedAt,
              ':statusValidityLevelCreatedAt': statusValidityLevelCreatedAt,
            },
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ReturnValues: 'UPDATED_NEW',
          })
          .promise();

        //TODO: delete S3 pics

        if (dataUpdated.Attributes.updatedAt === utcMoment) {
          return {
            statusCode: 200,
            headers: utils.getResponseHeaderappCors(),
          };
        } else {
          throw new Error(
            'Operation failed - item already changed before update.'
          );
        }
      } else {
        throw new Error('Item retreived is malformed.');
      }
    } else {
      throw new Error('Item not found.');
    }
  } catch (err) {
    console.log('Error', err);
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
