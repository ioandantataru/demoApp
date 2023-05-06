/**
 * Route: POST /updateUser
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const lambdaError = require('../../common/lambdaError');
const jwt_decode = require('jwt-decode');
const moment = require('moment');
const fileType = require('file-type');
const s3Operations = require('../../common/s3Operations');
//const singleUpload = upload.single('image');
const utils = require('../../common/utils');
const consts = require('../../common/consts');

const dynamodb = new AWS.DynamoDB.DocumentClient();

/*
      Item (T: token, R: required, B: backend computed, O optional, N no-touch)
  
      T userId
      N status
      O dob
      O curName
      O previousNames
      O preferredName
      N createdAt
      O identityPrivacy
      N extraFreeUserResources
      N subscriptions
      N hasEverPaid
  */

exports.handler = async (event, context, callback) => {
  try {
    //------------------------------------------ Handle user data ---------------------------------------------
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
    const userId = decodedToken.username;
    item.userId = decodedToken.username;
    if (!userId) throw new Error('No username in auth token');

    if (
      !item.dob &&
      !item.curName &&
      !item.previousNames &&
      !item.preferredName &&
      !item.identityPrivacy
    ) {
      throw new Error('Nothing to update');
    }

    let userUpdateExpression = 'set ';
    let userExpressionAttributeValues = {
      ':statusDeleted': consts.UserStatus.DELETED,
    };
    if (item.dob) {
      utils.validateDob(item.dob);
      userUpdateExpression += 'dob = :dob,';
      userExpressionAttributeValues[':dob'] = item.dob;
    }
    if (item.curName) {
      utils.validateCurName(item.curName, item.dob);
      item.curName = JSON.stringify({
        name: item.curName.name,
        begDate: item.curName.begDate || item.dob,
        imagesId: utils.getRandomId(),
      });
      userUpdateExpression += 'curName = :curName,';
      userExpressionAttributeValues[':curName'] = item.curName;
    }
    if (item.previousNames) {
      item.previousNames = JSON.stringify(
        utils.validatePreviousNamesAndGetImagesId(
          item.curName,
          item.previousNames,
          item.dob,
          false
        )
      );
      userUpdateExpression += 'previousNames = :previousNames,';
      userExpressionAttributeValues[':previousNames'] = JSON.stringify(
        item.previousNames
      );
    }
    if (item.preferredName) {
      userUpdateExpression += 'preferredName = :preferredName,';
      userExpressionAttributeValues[':preferredName'] = item.preferredName;
    }
    if (item.identityPrivacy) {
      userUpdateExpression += 'identityPrivacy = :identityPrivacy,';
      userExpressionAttributeValues[':identityPrivacy'] =
        item.identityPrivacy;
    }

    if (
      userUpdateExpression[userUpdateExpression.length - 1] === ','
    ) {
      userUpdateExpression = userUpdateExpression.slice(0, -1);
    }

    let dataUpdated = await dynamodb
      .update({
        TableName: consts.UsersTableName,
        Key: {
          userId,
        },
        UpdateExpression: userUpdateExpression,
        ConditionExpression: '#status <> :statusDeleted',
        ExpressionAttributeValues: userExpressionAttributeValues,
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ReturnValues: 'UPDATED_NEW',
      })
      .promise();

    if (dataUpdated.Attributes) {
      return {
        statusCode: 200,
        headers: utils.getResponseHeaderappCors(),
        body: JSON.stringify({
          linkId: dataUpdated.Attributes,
        }),
      };
    } else {
      const err = new Error(
        'Operation failed - item already changed before update.'
      );
      throw err;
    }
  } catch (err) {
    console.log('Error', err);
    err.message = err.message;
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
