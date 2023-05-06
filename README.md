1. Cognito is configure manually since serverless doesn't yet support all the options on AWS.
2. CodePipeline is also configured manually
3. On-Demand (scheduled/automated) backups for DynamoDb and S3 are configure manually -> adding new tables / S3 buckets requires manual backup configuration
   - DynamoDb continous backups configured via serverless framework
4. No automated Cognito user backup. Look into using https://www.npmjs.com/package/cognito-backup-restore and setting-up a lambda triggered by a time event to run every day and save to S3 bucket the JSON
