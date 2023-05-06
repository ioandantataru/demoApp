/**
 * Route: PATCH /update-userResource
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const lambdaError = require('../../common/lambdaError');
const jwt_decode = require('jwt-decode');
const moment = require('moment');
const utils = require('../../common/utils');
const consts = require('../../common/consts');
const dynamoFns = require('../../common/dynamoOperations');

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
    item.userId = decodedToken.username;
    if (!item.userId) throw new Error('No username in auth token');

    let keepStatus = false;
    let prevStatus = consts.UserResourceStatus.PENDING;
    let prevValidityLevel = consts.UserResourceValidity.UNTRUSTED;

    let prevCert;

    //TODO: find better logic, this is dangerous as number of params accepted grows
    if (
      !utils.hasValue(item.studentId) &&
      !utils.hasValue(item.userResourceType) &&
      !utils.hasValue(item.expirationDateTime) &&
      !utils.hasValue(item.perks) &&
      !utils.hasValue(item.level) &&
      !utils.hasValue(item.templatePhotoId)
    ) {
      keepStatus = true;
      let prevParams = {
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

      let prevCertItemsArray = await dynamodb.query(prevParams).promise();
      if (!_.isEmpty(prevCertItemsArray.Items)) {
        prevCert = prevCertItemsArray.Items[0];
        prevStatus = prevCert.status;
        prevValidityLevel = prevCert.validityLevel;
      }
    } else {
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

      let prevCertItemsArray = await dynamodb.query(params).promise();
      if (!_.isEmpty(prevCertItemsArray.Items)) {
        prevCert = prevCertItemsArray.Items[0];
      }
    }

    if (prevCert) {
      const utcMoment = moment().toISOString();
      const issuerId = prevCert.issuerId;
      const userNameAtIssue = prevCert.userNameAtIssue;
      const issueDateTime = prevCert.issueDateTime;
      const userResourceTitle = prevCert.userResourceTitle;
      if (
        issuerId &&
        userNameAtIssue &&
        issueDateTime &&
        userResourceTitle
      ) {
        const userNameAtIssueIssueDateTimeUserResourceTitle =
          userNameAtIssue +
          consts.Separator +
          issueDateTime +
          consts.Separator +
          userResourceTitle;
        let expressionAttributeValues = {};
        expressionAttributeValues[':studentId'] =
          item.studentId || prevCert.studentId;
        expressionAttributeValues[':userResourceType'] = utils.hasValue(
          item.userResourceType
        )
          ? item.userResourceType
          : prevCert.userResourceType;
        expressionAttributeValues[':expirationDateTime'] =
          item.expirationDateTime || prevCert.expirationDateTime;
        expressionAttributeValues[':perks'] = item.perks || prevCert.perks;
        expressionAttributeValues[':level'] = item.level || prevCert.level;

        //check if user doesn't already have more then 2 userResources to decide if we can allow it to be public or we should make it private
        if (
          utils.hasValue(item.privacyStatus) &&
          item.privacyStatus !== consts.UserResourcePrivacyStatus.PRIVATE &&
          prevCert.privacyStatus === consts.UserResourcePrivacyStatus.PRIVATE
        ) {
          if (!(await dynamoFns.validatePublishing(decodedToken.username)))
            throw new Error(
              'Publishing not permitted! You have reached the maximum number of userResources allowed to be published at once under your current subscription.'
            );
        }
        expressionAttributeValues[':privacyStatus'] = utils.hasValue(
          item.privacyStatus
        )
          ? item.privacyStatus
          : prevCert.privacyStatus;
        expressionAttributeValues[':linkId'] = item.regenerateLinkId
          ? utils.getRandomId()
          : prevCert.linkId;
        //expressionAttributeValues[':realPhotoId'] =
        //  item.realPhotoId || prevCert.realPhotoId;
        expressionAttributeValues[':templatePhotoId'] =
          item.templatePhotoId || prevCert.templatePhotoId;
        expressionAttributeValues[':validityLevel'] = keepStatus
          ? prevValidityLevel
          : consts.UserResourceValidity.UNTRUSTED;
        expressionAttributeValues[':status'] = keepStatus
          ? prevStatus
          : consts.UserResourceStatus.PENDING;
        expressionAttributeValues[':updatedAt'] = utcMoment;
        expressionAttributeValues[':userResourceTypeStatusStudentId'] =
          expressionAttributeValues[':userResourceType'] +
          consts.Separator +
          expressionAttributeValues[':status'] +
          consts.Separator +
          expressionAttributeValues[':studentId'];
        expressionAttributeValues[':issueDateTimeUserNameAtIssue'] =
          issueDateTime + consts.Separator + prevCert.userNameAtIssue;
        expressionAttributeValues[':validityLevelStatusCreatedAt'] =
          expressionAttributeValues[':validityLevel'] +
          consts.Separator +
          expressionAttributeValues[':status'] +
          consts.Separator +
          prevCert.createdAt;
        expressionAttributeValues[':statusValidityLevelCreatedAt'] =
          expressionAttributeValues[':status'] +
          consts.Separator +
          expressionAttributeValues[':validityLevel'] +
          consts.Separator +
          prevCert.createdAt;
        expressionAttributeValues[':oldUpdatedAt'] = prevCert.updatedAt;

        let dataUpdated = await dynamodb
          .update({
            TableName: consts.UserResourcesTableName,
            Key: {
              issuerId,
              userNameAtIssueIssueDateTimeUserResourceTitle,
            },

            UpdateExpression: `set studentId = :studentId,
                                           userResourceType = :userResourceType,
                                           expirationDateTime = :expirationDateTime,
                                           perks = :perks,
                                           #level = :level,
                                           privacyStatus = :privacyStatus,
                                           linkId = :linkId,
                                           templatePhotoId = :templatePhotoId,
                                           validityLevel = :validityLevel,
                                           #status = :status,
                                           updatedAt = :updatedAt,
                                           userResourceTypeStatusStudentId = :userResourceTypeStatusStudentId,
                                           issueDateTimeUserNameAtIssue = :issueDateTimeUserNameAtIssue,
                                           validityLevelStatusCreatedAt = :validityLevelStatusCreatedAt,
                                           statusValidityLevelCreatedAt = :statusValidityLevelCreatedAt`,
            ConditionExpression: 'updatedAt = :oldUpdatedAt',
            ExpressionAttributeValues: expressionAttributeValues,
            ExpressionAttributeNames: {
              '#status': 'status',
              '#level': 'level',
            },
            ReturnValues: 'UPDATED_NEW',
          })
          .promise();

        if (dataUpdated.Attributes.updatedAt === utcMoment) {
          return {
            statusCode: 200,
            headers: utils.getResponseHeaderappCors(),
            body: JSON.stringify({
              linkId: dataUpdated.Attributes.linkId,
            }),
          };
        } else {
          const err = new Error(
            'Operation failed - item already changed before update.'
          );
          throw err;
        }
      } else {
        throw new Error('Item retreived is malformed.');
      }
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
