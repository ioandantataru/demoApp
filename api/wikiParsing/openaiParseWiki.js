/**
 * OpenaiParseWiki to extract issuer data from a wiki link
 */

const axios = require('axios');
const https = require('https');
const { Configuration, OpenAIApi } = require('openai');
const utils = require('../../common/utils');
const consts = require('../../common/consts');
const lambdaError = require('../../common/lambdaError');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const options = {
  temperature: 0,
  max_tokens: 256,
  top_p: 1.0,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
};

exports.handler = async (event, context, callback) => {
  try {
    let item = event.Item;
    if (typeof event.Item === 'string') {
      item = JSON.parse(item);
    }
    const wikiLinks = item.wikiLinks;

    for (let i = 0; i < wikiLinks.length; i++) {
      if (!utils.cleanAndValidateWikiLink(wikiLinks[i]))
        throw new Error(`Unable to parse wikilink ${wikiLink[i]}`);
    }

    const openaiReq = options;
    openaiReq.max_tokens *= wikiLinks.length; //each link requires tokens
    openaiReq.model = 'text-davinci-003';
    const wikiLinksAsText = wikiLinks.join(', ');
    openaiReq.prompt = `For each issuer link in ${wikiLinksAsText} - extract the following in JSON: {issuer name, other names (as array), acronyms/abbreviations/stock market symbol (as array), official website, main city location, main country location, main state or province location}. Return results as an array.`;
    //openaiReq.prompt += examples; ////training will cost more tokens

    let openaiRes = await openai.createCompletion(openaiReq);
    if (!openaiRes.data)
      throw new Error(
        'Failed to extract info from wikilink with the openai api.'
      );
    return {
      statusCode: 200,
      headers: utils.getResponseHeaderappCors(),
      body: JSON.stringify(dummyRes),
    };
  } catch (err) {
    console.log('Error', err);
    context.fail(lambdaError.stdLambdaErrorString(err));
  }
};
