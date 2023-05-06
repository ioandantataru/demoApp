const AWS = require('aws-sdk');
const utils = require('./utils');
const consts = require('./consts');

const documentClient = new AWS.DynamoDB.DocumentClient();

const validatePublishing = async (username) => {
  const userParams = {
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
  let userData = await documentClient.query(userParams).promise();
  if (_.isEmpty(userData.Items) || !userData.Items[0]) {
    throw new Error(`Failed to retreive user with username ${username}`);
  }
  const additionalUserPublishings =
    userData.Items[0].extraFreeUserResources || 0;

  const alreadyPublishedParams = {
    TableName: consts.UserResourcesTableName,
    IndexName: 'userId-gsi_privacyStatus-sort',
    KeyConditionExpression:
      'userId = :userId AND privacyStatus BETWEEN :privacyStatusPasswordProtected AND :privacyStatusPublic',
    FilterExpression: '#status <> :statusDeleted',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':statusDeleted': consts.UserResourceStatus.DELETED,
      ':userId': username,
      ':privacyStatusPasswordProtected':
        consts.UserResourcePrivacyStatus.PASSWORD_PROTECTED,
      ':privacyStatusPublic': consts.UserResourcePrivacyStatus.PUBLIC,
    },
    Select: 'COUNT',
  };

  const numAlreadyPublishedData = await documentClient
    .query(alreadyPublishedParams)
    .promise();
  if (
    _.isEmpty(numAlreadyPublishedData) ||
    !utils.hasValue(numAlreadyPublishedData.Count)
  ) {
    throw new Error(
      `Failed to retreive number of userResources already published for ${username}`
    );
  }
  const numAlreadyPublished = numAlreadyPublishedData.Count;
  if (
    numAlreadyPublished <
    consts.UserSubscriptionsMaxFreeUserResourcesPublished +
      additionalUserPublishings
  )
    return true;
  return false;
};

const dynamoOperations = {
  async get(ID, TableName) {
    const params = {
      TableName,
      Key: {
        ID,
      },
    };

    const data = await documentClient.get(params).promise();

    if (!data || !data.Item) {
      throw Error(
        `There was an error fetching the data for ID of ${ID} from ${TableName}`
      );
    }
    console.log(data);

    return data.Item;
  },

  async write(data, TableName) {
    if (!data.ID) {
      throw Error('no ID on the data');
    }

    const params = {
      TableName,
      Item: data,
    };

    const res = await documentClient.put(params).promise();

    if (!res) {
      throw Error(
        `There was an error inserting ID of ${data.ID} in table ${TableName}`
      );
    }

    return data;
  },

  update: async ({
    tableName,
    primaryKey,
    primaryKeyValue,
    updateKey,
    updateValue,
  }) => {
    const params = {
      TableName: tableName,
      Key: { [primaryKey]: primaryKeyValue },
      UpdateExpression: `set ${updateKey} = :updateValue`,
      ExpressionAttributeValues: {
        ':updateValue': updateValue,
      },
    };

    return documentClient.update(params).promise();
  },

  query: async ({ tableName, index, queryKey, queryValue }) => {
    const params = {
      TableName: tableName,
      IndexName: index,
      KeyConditionExpression: `${queryKey} = :hkey`,
      ExpressionAttributeValues: {
        ':hkey': queryValue,
      },
    };

    const res = await documentClient.query(params).promise();

    return res.Items || [];
  },

  scan: async ({ tableName, filterExpression, expressionAttributes }) => {
    const params = {
      TableName: tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributes,
    };
    const res = await documentClient.scan(params).promise();

    return res.Items || [];
  },
};

module.exports = {
  dynamoOperations,
  validatePublishing,
};
