/**
 * Route: POST /create-userResource
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const lambdaError = require('../../common/lambdaError');
const jwt_decode = require('jwt-decode');
const moment = require('moment');
const _ = require('underscore');
const s3Operations = require('../../common/s3Operations');
//const singleUpload = upload.single('image');
const utils = require('../../common/utils');
const consts = require('../../common/consts');
const dynamoFns = require('../../common/dynamoOperations');

const dynamodb = new AWS.DynamoDB.DocumentClient();

/*
    Item (R: required, B: backend computed)

    B id
    B userId
    R userNameAtIssue
    R studentId
    R issuerId
    B issuerName
    R userResourceTitle
    R userResourceType
    R issueDateTime  # ISO-8601 date time format eg. YYYY-MM-DDTHH:mm:ss. sssZ
    expirationDateTime # ISO-8601 date time format
    perks
    R level
    R imagesProofArray
    templatePhotoId
    B validityLevel
    B status
    B statusMessage
    B createdBy
    B createdAt  # ISO-8601 date time format
    B updatedAt  # ISO-8601 date time format
    B imagesId   # for S3
    B userNameAtIssueIssueDateTimeUserResourceTitle
    B userResourceTypeStatusStudentId
    B issueDateTimeUserNameAtIssue
    B validityLevelStatusCreatedAt
    B statusValidityLevelCreatedAt
*/

exports.handler = async (event, context, callback) => {
  try {
    //------------------------------------------ Handle userResource data ---------------------------------------------
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

    //query issuer by id to make sure it's valid and grab the issuerName (set on item)
    let issuerParams = {
      TableName: consts.IssuersTableName,
      IndexName: 'id-gsi',
      KeyConditionExpression: 'id = :id',
      FilterExpression: '#status = :statusActive OR #status = :statusPending',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':statusActive': consts.IssuerStatus.ACTIVE,
        ':statusPending': consts.IssuerStatus.PENDING,
        ':id': item.issuerId,
      },
      Limit: 1,
    };

    let issuerData = await dynamodb.query(issuerParams).promise();
    if (
      !_.isEmpty(issuerData.Items) &&
      issuerData.Items.length === 1 &&
      issuerData.Items[0].name
    ) {
      item.issuerName = issuerData.Items[0].name;
    } else {
      throw {
        code: 'ItemNotFound',
        message: `Failed to retrieve issuer item with id: ${item.issuerId}`,
        statusCode: 404,
      };
    }

    item.statusMessage = '';
    //check req if userNameAtIssue is passed and set status PENDING
    if (item.userNameAtIssue) {
      item.status = consts.UserResourceStatus.PENDING;
      item.privacyStatus = consts.UserResourcePrivacyStatus.PRIVATE;
      item.statusMessage =
        'Waiting to confirm your identity and that the name on the userResource matches.';
    } else {
      //try to get the userNameAtIssue from user table
      let userParams = {
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

      const userData = await dynamodb.query(userParams).promise();
      const userItems = userData.Items;
      const userItem = _.isEmpty(userItems)
        ? null
        : userItems[0];
      if (!userItem) {
        //send err if not found in user table
        throw new Error(
          `Unable to find your user user data given the authToken received.`
        );
      }

      let previousNames = userItem.previousNames;
      if (typeof curName === 'string') {
        curName = JSON.parse(curName);
      }

      item.userNameAtIssue = utils.findNameAtIssue(
        userItem,
        item.issueDateTime
      );
      if (!item.userNameAtIssue) {
        throw new Error(
          `Failed to compute user name at the time the userResource was issued.`
        );
      }

      //decide userResource status
      if (userItem.status !== consts.UserStatus.ACTIVE) {
        item.status = consts.UserResourceStatus.PENDING;
        item.privacyStatus = consts.UserResourcePrivacyStatus.PRIVATE;
        item.statusMessage =
          'Your identity verification is not yet complete or is pending verification.';
      } else {
        //check if issuer status is ACTIVE and set userResource status to ACTIVE if so
        const issuerItems = issuerData.Items;
        const issuerItem = _.isEmpty(issuerItems)
          ? null
          : issuerItems[0];
        if (!issuerItem) {
          //send err if not found in issuer table
          throw new Error(
            `Unable to find your issuer given the issuerId received.`
          );
        }

        if (issuerItem.status === consts.IssuerStatus.DELETED) {
          throw new Error(`This issuer no longer exists in the system.`);
        } else if (
          issuerItem.status === consts.IssuerStatus.PENDING
        ) {
          item.status = consts.UserResourceStatus.PENDING;
          item.privacyStatus = consts.UserResourcePrivacyStatus.PRIVATE;
          item.statusMessage = 'Issuer still under review.';
        } else if (issuerItem.status === consts.IssuerStatus.ACTIVE) {
          item.status = consts.UserResourceStatus.ACTIVE;
          //check if user doesn't already have more then 2 userResources to decide if we can allow it to be public or we should make it private
          if (await dynamoFns.validatePublishing(decodedToken.username)) {
            item.privacyStatus = consts.UserResourcePrivacyStatus.PUBLIC;
          } else {
            item.privacyStatus = consts.UserResourcePrivacyStatus.PRIVATE;
          }
        } else {
          //default not supposed to hit
          item.status = consts.UserResourceStatus.PENDING;
          item.privacyStatus = consts.UserResourcePrivacyStatus.PRIVATE;
          item.statusMessage = 'Issuer status not recognized.';
        }
      }
    }

    // set server-side parameters
    item.id = utils.getRandomId();
    item.linkId = utils.getRandomId();
    //TODO check userType and set UserResourceValidity accordingly
    item.validityLevel = consts.UserResourceValidity.UNTRUSTED;
    item.createdBy = decodedToken.username;
    const utcMoment = moment().toISOString();
    item.createdAt = utcMoment;
    item.updatedAt = utcMoment;
    item.imagesId = utils.getRandomId();
    if (!item.studentId) item.studentId = 'unknown';
    item.userNameAtIssueIssueDateTimeUserResourceTitle =
      item.userNameAtIssue +
      consts.Separator +
      item.issueDateTime +
      consts.Separator +
      item.userResourceTitle;
    item.userResourceTypeStatusStudentId =
      item.userResourceType +
      consts.Separator +
      item.status +
      consts.Separator +
      item.studentId;
    item.issueDateTimeUserNameAtIssue =
      item.issueDateTime + consts.Separator + item.userNameAtIssue;
    item.validityLevelStatusCreatedAt =
      item.validityLevel +
      consts.Separator +
      item.status +
      consts.Separator +
      item.createdAt;
    item.statusValidityLevelCreatedAt =
      item.status +
      consts.Separator +
      item.validityLevel +
      consts.Separator +
      item.createdAt;

    //------------------------------------------ Handle userResource pictures ---------------------------------------------
    let imagesProofArray = event.ImagesProofArray;
    if (
      typeof imagesProofArray === 'string' &&
      utils.isJsonObject(imagesProofArray)
    ) {
      imagesProofArray = JSON.parse(imagesProofArray);
    }
    if (!utils.validateParams(imagesProofArray)) {
      throw new Error(`Params contain unauthorized string ${consts.Separator}`);
    }

    const folderKey = `${decodedToken.username}/${item.imagesId}/ACTIVE`;
    const s3Data = await utils.storeImagesProofArray(
      consts.UserResourceImageBucketName,
      folderKey,
      imagesProofArray
    );
    if (!s3Data || s3Data.length === 0) {
      throw new Error(`Failed to store the proof images.`);
    }

    //------------------------------------------ Async Calls to store data ----------------------------------------------------
    console.log(`Writing to dyname table ${consts.UserResourcesTableName}`);
    const dynamoData = await dynamodb
      .put({
        TableName: consts.UserResourcesTableName,
        Item: item,
        ConditionExpression:
          'attribute_not_exists(userNameIssueDateTimeUserResourceTitle) OR attribute_not_exists(issuerId)',
      })
      .promise();

    item.s3Data = s3Data; //TODO is this necessary?
    item.imagesProofArray = imagesProofArray;

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
