/**
 * Route: POST /createIssuerByGuest
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
      throw new Error(
        `Params contain unauthorized string ${consts.Separator} or ${consts.SearchKeySeparatorShort}`
      );
    }

    item.country = utils.getCountryLabel(item.country);
    if (!item.country) throw new Error('Country is invalid / not found');
    item.country = item.country.toUpperCase();

    //validate country and state/province (US/Canada only)
    let locality = item.city;
    if (item.country === 'US' || item.country === 'CA') {
      if (!item.province)
        throw new Error(
          'State / Province field required for Canada and United States'
        );
      else {
        const countryProvinces = utils.getProvincesFromCountry(item.country);
        const stateAbbreviationIndex = countryProvinces.abbreviations.indexOf(
          item.province
        );
        if (stateAbbreviationIndex !== -1)
          item.province = countryProvinces.fullNames[stateAbbreviationIndex];
        else if (countryProvinces.fullNames.indexOf(item.province) === -1)
          throw new Error('State/Province not valid');
      }
      locality = item.province + consts.SearchKeySeparatorShort + item.city;
    } else item.province = undefined;

    const keyItemArr = [];

    // set server-side parameters
    item.id = utils.getRandomId();
    item.status = consts.IssuerStatus.PENDING;
    if (!utils.isValidWebsite(item.website)) {
      throw new Error('Invalid website');
    }
    const cleanWikiLink = utils.cleanAndValidateWikiLink(item.wikiLink);
    if (!cleanWikiLink) {
      throw new Error(
        'Invalid wiki link. Please enter the wiki link in English. It should look like this: https://en.wikipedia.org/wiki/ISSUER_NAME'
      );
    }
    item.wikiLink = cleanWikiLink;

    const nameInEnglishKey = {
      partitionKey: item.name[0].toLowerCase(),
      searchKey: item.name.toLowerCase() + consts.SearchKeySeparator + item.id, //used as sort key while the first letter is the partition
      keyName: item.name,
      nameInEnglish: item.name,
      keyType: consts.SearchKeyTypes.NAME_IN_ENGLISH,
      status: consts.SearchKeyStatus.ACTIVE,
      createdAt: item.createdAt,
      city: item.city,
      province: item.province,
      country: item.country,
      countryPartitionKey:
        item.country +
        consts.SearchKeySeparatorShort +
        item.name[0].toLowerCase(),
      countryProvincePartitionKey:
        item.country +
        consts.SearchKeySeparatorShort +
        (item.province ? item.province + consts.SearchKeySeparatorShort : '') +
        item.name[0].toLowerCase(),
    };
    const searchKeys = [item.name];
    keyItemArr.push(nameInEnglishKey);
    if (item.otherNames) {
      for (let i = 0; i < item.otherNames.length; i++) {
        if (item.name === item.otherNames[i]) continue; //no duplicates
        const otherNameKey = {
          partitionKey: item.otherNames[i][0].toLowerCase(),
          searchKey:
            item.otherNames[i].toLowerCase() +
            consts.SearchKeySeparator +
            item.id,
          keyName: item.otherNames[i],
          nameInEnglish: item.name,
          keyType: consts.SearchKeyTypes.OTHER_NAME,
          status: consts.SearchKeyStatus.ACTIVE,
          createdAt: item.createdAt,
          city: item.city,
          province: item.province,
          country: item.country,
          countryPartitionKey:
            item.country +
            consts.SearchKeySeparatorShort +
            item.name[0].toLowerCase(),
          countryProvincePartitionKey:
            item.country +
            consts.SearchKeySeparatorShort +
            (item.province
              ? item.province + consts.SearchKeySeparatorShort
              : '') +
            item.name[0].toLowerCase(),
        };
        searchKeys.push(item.otherNames[i]);
        keyItemArr.push(otherNameKey);
      }
    }
    if (item.abbreviations) {
      for (let i = 0; i < item.abbreviations.length; i++) {
        if (item.name === item.abbreviations[i]) continue; //no duplicates
        if (item.otherNames && item.otherNames.includes(item.abbreviations[i]))
          continue; //no duplicates
        const abbreviationNameKey = {
          partitionKey: item.abbreviations[i][0].toLowerCase(),
          searchKey:
            item.abbreviations[i].toLowerCase() +
            consts.SearchKeySeparator +
            item.id,
          keyName: item.abbreviations[i],
          nameInEnglish: item.name,
          keyType: consts.SearchKeyTypes.ABBREVIATION,
          status: consts.SearchKeyStatus.ACTIVE,
          createdAt: item.createdAt,
          city: item.city,
          province: item.province,
          country: item.country,
          countryPartitionKey:
            item.country +
            consts.SearchKeySeparatorShort +
            item.name[0].toLowerCase(),
          countryProvincePartitionKey:
            item.country +
            consts.SearchKeySeparatorShort +
            (item.province
              ? item.province + consts.SearchKeySeparatorShort
              : '') +
            item.name[0].toLowerCase(),
        };
        searchKeys.push(item.abbreviations[i]);
        keyItemArr.push(abbreviationNameKey);
      }
    }
    item.searchKeys = searchKeys;

    const utcMoment = moment().toISOString();
    item.createdAt = utcMoment;
    item.updatedAt = utcMoment;

    //set indexing parameters:
    //localityStatusType, localityTypeStatus, typeStatusLocality, statusTypeLocality, countryLocalityType
    //countryTypeLocality, typeCountryLocality, countryLocalityStatus, countryStatusLocality, statusCountryLocality

    item.localityStatusType =
      locality + consts.Separator + item.status + consts.Separator + item.type;
    item.localityTypeStatus =
      locality + consts.Separator + item.type + consts.Separator + item.status;
    item.typeStatusLocality =
      item.type + consts.Separator + item.status + consts.Separator + locality;
    item.statusTypeLocality =
      item.status + consts.Separator + item.type + consts.Separator + locality;
    item.countryLocalityType =
      item.country + consts.Separator + locality + consts.Separator + item.type;
    item.countryTypeLocality =
      item.country + consts.Separator + item.type + consts.Separator + locality;
    item.typeCountryLocality =
      item.type + consts.Separator + item.country + consts.Separator + locality;
    item.countryLocalityStatus =
      item.country +
      consts.Separator +
      locality +
      consts.Separator +
      item.status;
    item.countryStatusLocality =
      item.country +
      consts.Separator +
      item.status +
      consts.Separator +
      locality;
    item.statusCountryLocality =
      item.status +
      consts.Separator +
      item.country +
      consts.Separator +
      locality;

    // store to DynamoDb
    const result = await dynamodb
      .put({
        TableName: consts.IssuersTableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(wikiLink)',
      })
      .promise();

    const resultArray = await Promise.allSettled(
      keyItemArr.map(async (item) => {
        return await dynamodb
          .put({
            TableName: consts.IssuerSearchKeysTableName,
            Item: item,
            ConditionExpression: 'attribute_not_exists(searchKey)',
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

    //TODO: dynamodb doesn't return anyting for put operations

    return {
      statusCode: 200,
      headers: utils.getResponseHeaderappCors(),
      body: {
        item: JSON.stringify(item),
        searchKeysSuccess: JSON.stringify(fulfilledPromises),
        searchKeysFail: JSON.stringify(rejectedPromises),
      },
    };
  } catch (err) {
    console.log('Error', err);
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
