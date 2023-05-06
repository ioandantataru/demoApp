/**
 * Route: POST /deleteIssuerByIssuerAdmin
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

    if (
      decodedToken.username !== 'tester' &&
      decodedToken.username !== 'Miruna'
    )
      throw new Error('Only admin users are authorized to perform this action');

    let params = {
      TableName: consts.IssuersTableName,
      IndexName: 'id-gsi',
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: {
        ':id': item.id,
      },
      Limit: 1,
    };

    let itemToDelete = await dynamodb.query(params).promise();
    if (!itemToDelete || !itemToDelete.Items || !itemToDelete.Items[0])
      throw new Error('Failed to find issuer to delete');

    let data = await dynamodb
      .delete({
        TableName: consts.IssuersTableName,
        Key: {
          country: itemToDelete.Items[0].country,
          wikiLink: itemToDelete.Items[0].wikiLink,
        },
        ReturnValues: 'ALL_OLD',
      })
      .promise();

    if (!data || !data.Attributes) {
      throw new Error('Operation failed - item failed to be deleted.');
    } else if (!data.Attributes.searchKeys) {
      throw new Error(
        'Operation failed - item search keys to be deleted were not found.'
      );
    }

    let searchKeys = data.Attributes.searchKeys;
    if (!Array.isArray(searchKeys)) searchKeys = JSON.parse(searchKeys);

    const resultArray = await Promise.allSettled(
      searchKeys.map(async (item) => {
        return await dynamodb
          .delete({
            TableName: consts.IssuerSearchKeysTableName,
            Key: {
              partitionKey: item[0].toLowerCase(),
              searchKey:
                item.toLowerCase() +
                consts.SearchKeySeparator +
                data.Attributes.id,
            },
            ReturnValues: 'ALL_OLD',
          })
          .promise();
      })
    );
    const fulfilledPromises = resultArray
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    const rejectedPromises = resultArray
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason);

    return {
      statusCode: 200,
      headers: utils.getResponseHeaderappCors(),
      searchKeysSuccess: JSON.stringify(fulfilledPromises),
      searchKeysFail: JSON.stringify(rejectedPromises),
    };
  } catch (err) {
    console.log('Error', err);
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
