/**
 * Route: PATCH /updateIssuerByIssuerAdmin
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

const lambdaError = require('../../common/lambdaError');
const jwt_decode = require('jwt-decode');
const moment = require('moment');
const utils = require('../../common/utils');
const consts = require('../../common/consts');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event, context, callback) => {
  try {
    throw new Error('Api not yet suported');
    let item = event.Item;
    if (typeof event.Item === 'string') {
      item = JSON.parse(item);
    }
    if (!utils.validateParams(item)) {
      throw new Error(`Params contain unauthorized string ${consts.Separator}`);
    }
    let params = {
      TableName: consts.IssuersTableName,
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: {
        ':id': item.id,
      },
      Limit: 1,
    };

    let queryData = await dynamodb.query(params).promise();
    if (!_.isEmpty(queryData.Items)) {
      const issuer = queryData.Items[0];
      const utcMoment = moment().toISOString();
      issuer.updatedAt = utcMoment;
      issuer.name = item.name || issuer.name;
      issuer.type = item.type || issuer.type;
      issuer.country = item.country || issuer.country;
      issuer.city = item.city || issuer.city;
      issuer.abbreviation = item.abbreviation || issuer.abbreviation;
      issuer.motto = item.motto || issuer.motto;
      issuer.website = item.website || issuer.website;
      issuer.logo = item.logo || issuer.logo;
      issuer.countryCityName =
        issuer.country +
        consts.Separator +
        issuer.city +
        consts.Separator +
        issuer.name;
      issuer.nameCountryCity =
        issuer.name +
        consts.Separator +
        issuer.country +
        consts.Separator +
        issuer.city;
      issuer.abbreviationCountryCity =
        issuer.abbreviation +
        consts.Separator +
        issuer.country +
        consts.Separator +
        issuer.city;
      issuer.typeName =
        issuer.type + consts.Separator + issuer.name;

      let putData = await dynamodb
        .put({
          TableName: consts.IssuersTableName,
          Item: issuer,
        })
        .promise();

      return {
        statusCode: 200,
        headers: utils.getResponseHeaderappCors(),
        body: JSON.stringify(putData),
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
