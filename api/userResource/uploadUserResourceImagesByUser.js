const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });
const lambdaError = require('../../common/lambdaError');
const fileType = require('file-type');
const s3Operations = require('../../common/s3Operations');
const jwt_decode = require('jwt-decode');
const utils = require('../../common/utils');
const consts = require('../../common/consts');

exports.handler = async (event, context, callback) => {
  try {
    const files = [];
    let item = event.Item || {};
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

    item.imagesId = item.imagesId || utils.getRandomId();
    const s3Data = [];
    imagesProofArray = event.ImagesProofArray;
    if (
      typeof imagesProofArray === 'string' &&
      utils.isJsonObject(imagesProofArray)
    ) {
      imagesProofArray = JSON.parse(imagesProofArray);
    }
    if (!utils.validateParams(imagesProofArray)) {
      throw new Error(`Params contain unauthorized string ${consts.Separator}`);
    }

    for (const imageJson of imagesProofArray) {
      //let imageJson = imagesProofArray[0];
      let parsedImageJson = imageJson;
      if (
        typeof parsedImageJson === 'string' &&
        utils.isJsonObject(parsedImageJson)
      ) {
        parsedImageJson = JSON.parse(parsedImageJson);
      }

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
      const buffer = Buffer.from(image, 'base64');
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

      const fileName = utils.getRandomId();
      +'_' + parsedImageJson.name;
      if (!fileName.endsWith('.' + detectedExtension)) {
        fileName = fileName + '.' + detectedExtension;
      }
      const key = `${decodedToken.username}/${item.imagesId}/ACTIVE/${fileName}`;

      console.log(`Writing image to bucket called ${key}`);
      const s3DataForFile = await s3Operations.write(
        buffer,
        key,
        consts.UserResourceImageBucketName,
        null,
        detectedMime
      );

      s3Data.push(s3DataForFile);

      let url = await s3Operations.getSignedURL(
        consts.UserResourceImageBucketName,
        key,
        172800 // 2 days in seconds as expiry
      );
      const file = {
        name: key,
        imageUrl: url,
      };
      files.push(file);
    }

    return {
      statusCode: 200,
      headers: utils.getResponseHeaderappCors(),
      body: JSON.stringify(files),
    };
  } catch (err) {
    console.log('Error', err);
    err.message = err.message;
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
