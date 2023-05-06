const consts = require('./consts');
const s3Operations = require('./s3Operations');
const { v4: uuidv4, parse } = require('uuid');
const base64 = require('uuid-base64'); //uses {[A-Z][a-z][0-9]._} as 64 possible chars
const moment = require('moment');
const fileType = require('file-type');
const countryList = require('react-select-country-list');
const provinces = require('provinces');

const websiteRegex = /https?:\/\/(.*)\.(.*)/g;
const wikiEnRegex = /https:\/\/en\.wikipedia\.org\/wiki\/(.*)/g;
const emailRegex =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const getCountryLabel = (country) => {
  if (!country) return undefined;
  const countryLabelFromName = countryList().getValue(country);
  if (countryLabelFromName) return countryLabelFromName;
  const countryNameFromLabel = countryList().getLabel(country);
  if (countryNameFromLabel) return country; //it was a label to begin with
  return undefined;
};

//parse 'provinces' obj and return {fullNames: [], abbreviations: []}
const getProvincesFromCountry = (countryCode) => {
  //TODO: index countries to search in O(1) not O(n)
  const fullNames = [];
  const abbreviations = [];
  /*if (countryCode === 'US') {
    const provincesRelated = provinces.splice(0, 57);
    for (let i = 0; i < provincesRelated.length; i++) {
      fullNames.push(provincesRelated[i].name);
      abbreviations.push(provincesRelated[i].short || '');
    }
  } else if (countryCode === 'CA') {
    const provincesRelated = provinces.splice(57, 70);
    for (let i = 0; i < provincesRelated.length; i++) {
      fullNames.push(provincesRelated[i].name);
      abbreviations.push(provincesRelated[i].short || '');
    }
  } else {*/
  for (let i = 0; i < provinces.length; i++) {
    if (provinces[i].country === countryCode) {
      fullNames.push(provinces[i].name);
      abbreviations.push(provinces[i].short || '');
    } else if (fullNames.length > 0) return { fullNames, abbreviations };
  }
  //}
  return { fullNames, abbreviations };
};

const isUsOrUsa = (text) => {
  text = text.toLowerCase();
  if (
    text === 'us' ||
    text === 'u.s' ||
    text === 'u.s.' ||
    text === 'usa' ||
    text === 'u.s.a' ||
    text === 'u.s.a.' ||
    text === 'united states' ||
    text === 'united states of america' ||
    text === 'united states america'
  )
    return true;

  return false;
};

const isValidWebsite = (url) => {
  if (!url.toLowerCase().match(websiteRegex)) return false;
  const parsedUrl = new URL(url);
  if (!parsedUrl.protocol || !parsedUrl.hostname) return false;
  return true;
};

const cleanAndValidateWikiLink = (wikiUrl) => {
  if (!wikiUrl.toLowerCase().match(wikiEnRegex)) return null;
  const parsedUrl = new URL(wikiUrl);
  if (!parsedUrl.protocol || !parsedUrl.hostname || !parsedUrl.pathname)
    return null;
  if (parsedUrl.pathname.length < 7) return null; // for '/wiki/
  return parsedUrl.pathname.substring(6); // for '/wiki/
};

const isValidEmail = (email) => {
  return String(email).toLowerCase().match(emailRegex);
};

//return null if failed to compute
const findNameAtIssue = (user, issueDateTime) => {
  let curName = user.curName;
  let previousNames = user.previousNames;
  if (typeof curName === 'string') {
    curName = JSON.parse(curName);
  }
  if (typeof previousNames === 'string') {
    previousNames = JSON.parse(previousNames);
  }
  if (curName.begDate && curName.begDate <= issueDateTime) return curName.name;
  else if (
    !curName.begDate &&
    (!previousNames || previousNames.length === 0) &&
    user.dob <= issueDateTime
  )
    return curName.name;
  for (let i = 0; i < previousNames.length; i++) {
    if (previousNames[i].begDate <= issueDateTime) return previousNames[i].name;
  }
  return null;
};

const checkObjectForMaliciousSeparator = (obj, separator) => {
  let retValue = true;
  for (var key in obj) {
    if (!obj.hasOwnProperty(key) || key === 'image') continue; // skip this property

    if (typeof obj[key] == 'object' && obj[key] !== null) {
      retValue =
        retValue && checkObjectForMaliciousSeparator(obj[key], separator);
    } else if (Array.isArray(obj[key]) && obj[key].length > 0) {
      for (var i = 0; i < obj[key].length; i++) {
        retVal =
          retVal && checkObjectForMaliciousSeparator(obj[key][i], separator);
        if (!retValue) return false;
      }
    } else if (typeof obj[key] === 'string') {
      if (obj[key].indexOf(separator) !== -1) {
        return false;
      }
    }

    if (!retValue) return false;
  }

  return retValue;
};

const validateParams = (obj) => {
  return (
    checkObjectForMaliciousSeparator(obj, consts.Separator) &&
    checkObjectForMaliciousSeparator(obj, consts.SearchKeySeparatorShort)
  ); //add more obj checks
};

const validateDob = (dob) => {
  const utcMoment = moment().toISOString();
  const longTimeAgoIso = moment().subtract(100, 'year').toISOString();
  if (!dob || dob > utcMoment || dob < longTimeAgoIso) {
    throw new Error('Date of Birth is invalid');
  }
};

const validateCurName = (curName, dob) => {
  if (
    !curName ||
    !dob ||
    !curName.name ||
    (!!curName.begDate && curName.begDate < dob)
  ) {
    throw new Error('Current name is invalid');
  }
};

const validatePreviousNamesAndGetImagesId = (
  curName,
  previousNames,
  dob,
  genImagesId
) => {
  if (previousNames && !Array.isArray(previousNames)) {
    throw new Error('Previous names needs to be an array');
  }
  const validPreviousNames = [];
  if (previousNames.length > 0) {
    let pastName = previousNames[0];
    if (!pastName.name) {
      throw new Error('No name attribute provided at index 0');
    }
    if (!pastName.begDate) pastName.begDate = dob;
    if (pastName.begDate >= curName.begDate)
      throw new Error(
        'Previous Names not ordered correctly / have invalid dates'
      );
    if (genImagesId || !pastName.imagesId) pastName.imagesId = getRandomId();
    else if (pastName.imagesId.length !== 22)
      throw new Error('ImagesId is the wrong length');
    delete pastName.imagesProofArray;
    validPreviousNames.push(pastName);

    for (let i = 1; i < previousNames.length; i++) {
      pastName = previousNames[i];
      if (!pastName.name) {
        throw new Error(`No name attribute provided at index ${i}`);
      }
      if (!pastName.begDate) pastName.begDate = dob;
      if (pastName.begDate >= previousNames[i - 1].begDate)
        throw new Error(
          'Previous Names not ordered correctly / have invalid dates'
        );
      if (genImagesId || !pastName.imagesId) pastName.imagesId = getRandomId();
      else if (pastName.imagesId.length !== 22)
        throw new Error('ImagesId is the wrong length');
      delete pastName.imagesProofArray;
      validPreviousNames.push(pastName);
    }
    return validPreviousNames;
  }
  return [];
};

const hasValue = (param) => {
  return (
    !(param === undefined) &&
    !(param === null) &&
    !(typeof param === 'string' && param.length === 0) &&
    !(Array.isArray(param) && param.length === 0)
  );
};

function getRandomId() {
  // encode to 22 chars that can be used in url
  return base64.encode(uuidv4());
}

function isJsonObject(strData) {
  try {
    JSON.parse(strData);
  } catch (e) {
    return false;
  }
  return true;
}

const getResponseHeaderAllCors = () => {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
  };
};

const getResponseHeaderappCors = () => {
  if (
    process.env.ENV_NAME === 'prod' ||
    process.env.ENV_NAME === 'production'
  ) {
    return {
      'Access-Control-Allow-Origin': 'app.com',
      'Access-Control-Allow-Credentials': true,
    };
  } else {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    };
  }
};

const getUserId = (headers) => {
  return headers.app_user_id;
};

const getUserName = (headers) => {
  return headers.app_user_name;
};

const getImageBuffer = (parsedImageJson) => {
  if (
    !parsedImageJson ||
    !parsedImageJson.image ||
    !parsedImageJson.mime ||
    !parsedImageJson.name
  ) {
    throw new Error(
      `No parsedImageJson, parsedImageJson.image or parsedImageJson.mime or parsedImageJson.name`
    );
  }

  if (!consts.AllowedMimes.includes(parsedImageJson.mime)) {
    throw new Error(`Wrong file format received: ${parsedImageJson.mime}`);
  }
  let image = parsedImageJson.image;
  if (parsedImageJson.image.substr(0, 7) === 'base64,') {
    image = parsedImageJson.image.substr(7, parsedImageJson.image.length);
  }

  if (!image) {
    throw new Error(`No image to store`);
  }

  return Buffer.from(image, 'base64');
};

const storeImagesProofArray = async (bucket, folderKey, imagesProofArray) => {
  const s3Data = [];
  if (!Array.isArray(imagesProofArray))
    throw new Error('imagesProofArray is not of type Array');
  for (const imageJson of imagesProofArray) {
    let parsedImageJson = imageJson;
    if (typeof parsedImageJson === 'string' && isJsonObject(parsedImageJson)) {
      parsedImageJson = JSON.parse(parsedImageJson);
    }
    const buffer = getImageBuffer(parsedImageJson);
    if (!buffer) {
      throw new Error(`Buffering the image failed`);
    }

    const fileInfo = await fileType.fromBuffer(buffer);
    if (!fileInfo) {
      throw new Error(`File info parsing from buffer failed.`);
    }
    const detectedExtension = fileInfo.ext;
    const detectedMime = fileInfo.mime;

    if (detectedMime !== parsedImageJson.mime) {
      throw new Error(
        `Mime types don't match: ${detectedMime} vs ${parsedImageJson.mime}`
      );
    }

    if (parsedImageJson.name.indexOf('/') !== -1) {
      throw new Error(
        `File name ${parsedImageJson.name} cannot contain the special character /`
      );
    }

    const fileName = getRandomId() + consts.Separator + parsedImageJson.name;
    if (!fileName.endsWith('.' + detectedExtension)) {
      fileName = fileName + '.' + detectedExtension;
    }
    let key = folderKey;
    if (key.charAt(key.length - 1) !== '/') key = key + '/';
    key = key + fileName;

    console.log(`Writing image to bucket called ${key}`);
    const s3DataForFile = await s3Operations.write(
      buffer,
      key,
      bucket,
      null,
      detectedMime
    );

    s3Data.push(s3DataForFile);
  }
  return s3Data;
};

module.exports = {
  getProvincesFromCountry,
  getCountryLabel,
  isUsOrUsa,
  isValidWebsite,
  cleanAndValidateWikiLink,
  isValidEmail,
  findNameAtIssue,
  validateParams,
  validateDob,
  validateCurName,
  validatePreviousNamesAndGetImagesId,
  hasValue,
  getRandomId,
  isJsonObject,
  getResponseHeaderappCors,
  getUserId,
  getUserName,
  getImageBuffer,
  storeImagesProofArray,
};
