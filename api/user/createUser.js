/**
 * Route: POST /create-user
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const lambdaError = require('../../common/lambdaError');
const jwt_decode = require('jwt-decode');
const moment = require('moment');
const fileType = require('file-type');
//const singleUpload = upload.single('image');
const utils = require('../../common/utils');
const consts = require('../../common/consts');

const dynamodb = new AWS.DynamoDB.DocumentClient();

/*
     Item (T: token, R: required, B: backend computed, O optional)
 
     T userId
     B status
     R dob
     R curName
     O previousNames
     O preferredName
     B createdAt
     B identityPrivacy
     B extraFreeUserResources
     B subscriptions
     B hasEverPaid
 */

exports.handler = async (event, context, callback) => {
  try {
    //------------------------------------------ Handle User data ---------------------------------------------
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

    const imagesForNames = [];

    // set server-side parameters
    item.status = consts.UserStatus.PENDING_APPROVAL;
    if (!item.preferredName) item.preferredName = item.curName.name;
    const utcMoment = moment().toISOString();
    item.createdAt = utcMoment;
    item.identityPrivacy = consts.IdentityPrivacySettings.NEVER_SHOW; //todo change to REQUIRE_EMAIL once implemented email mechanism
    item.extraFreeUserResources = 0;
    item.subscriptions = JSON.stringify([
      {
        name: consts.UserSubscriptions.FREE_TIER,
        begDate: utcMoment,
      },
    ]);
    item.hasEverPaid = false;

    //verify provided params
    utils.validateDob(item.dob);
    utils.validateCurName(item.curName, item.dob);
    imagesForNames.push(item.curName.imagesProofArray);
    item.curName = {
      name: item.curName.name,
      begDate: item.curName.begDate || item.dob,
      imagesId: utils.getRandomId(),
    };
    if (
      !item.previousNames ||
      !Array.isArray(item.previousNames) ||
      item.previousNames.length === 0
    ) {
      delete item.previousNames;
    } else {
      for (let i = 0; i < item.previousNames.length; i++) {
        imagesForNames.push(item.previousNames[i].imagesProofArray);
      }
      item.previousNames = utils.validatePreviousNamesAndGetImagesId(
        item.curName,
        item.previousNames,
        item.dob,
        true
      );
    }

    //------------------------------------------ Handle user identity pictures ---------------------------------------------
    const s3DataArray = [];
    for (let i = 0; i < imagesForNames.length; i++) {
      let imagesProofArray = imagesForNames[i];
      if (
        typeof imagesProofArray === 'string' &&
        utils.isJsonObject(imagesProofArray)
      ) {
        imagesProofArray = JSON.parse(imagesProofArray);
      }
      const imagesId =
        i === 0 ? item.curName.imagesId : item.previousNames[i - 1].imagesId;
      const folderKey = `${decodedToken.username}/${imagesId}/ACTIVE`;
      const s3Data = await utils.storeImagesProofArray(
        consts.UserIdentityImageBucketName,
        folderKey,
        imagesProofArray
      );
      if (!s3Data || s3Data.length === 0) {
        throw new Error(`Failed to store the proof images.`);
      }
      s3DataArray.push(s3Data);
    }

    //------------------------------------------ Async Calls to store data ----------------------------------------------------
    console.log(`Writing to dyname table ${consts.UsersTableName}`);
    item.curName = JSON.stringify(item.curName);
    item.previousNames = JSON.stringify(item.previousNames);
    const dynamoData = await dynamodb
      .put({
        TableName: consts.UsersTableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(userId)',
      })
      .promise()
      .catch(function (err) {
        throw err;
      });

    item.s3DataArray = s3DataArray;
    item.curName.imagesProofArray = imagesForNames[0];
    for (let i = 1; i < imagesForNames.length; i++) {
      item.previousNames.imagesProofArray = imagesForNames[i];
    }

    return {
      statusCode: 200,
      headers: utils.getResponseHeaderappCors(),
      body: JSON.stringify(item),
    };
  } catch (err) {
    console.log('Error', err);
    err.message = err.message;
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
