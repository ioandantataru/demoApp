const stdLambdaErrorString = (err) => {
  console.log('stdLambdaErrorString err: ', err);
  const customError = {
    code: err.code || 'UNKNOWN',
    type: 'customLambdaError',
    message: 'Lambda Error: ' + err.message,
  };
  if (err.statusCode) {
    customError.statusCode = err.statusCode;
  }
  console.log('stdLambdaErrorString customError: ', customError);
  return JSON.stringify(customError);
};

module.exports = {
  stdLambdaErrorString,
};
