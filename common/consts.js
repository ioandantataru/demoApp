//IMPORTANT: when updating these, make sure to also update associated request validation json models
const defaultNumberIssuersReturned = 5;
const defaultNumberUserResourcesReturned = 100;

const AwsRegion =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-west-2';

const IssuerSearchKeysTableName =
  'ISSUERSEARCHKEYS-' + process.env.ENV_NAME;
const PremiumWaitlistLeadTableName =
  'PREMIUMWAITLISTLEAD-' + process.env.ENV_NAME;
const FeedbackTableName = 'FEEDBACK-' + process.env.ENV_NAME;
const UsersTableName = 'USERS-' + process.env.ENV_NAME;
const IssuersTableName = 'ISSUERS-' + process.env.ENV_NAME;
const UserResourcesTableName = 'USERRESOURCES-' + process.env.ENV_NAME;

const UserResourceImageBucketName = process.env.USERRESOURCE_BUCKET_NAME;
const UserIdentityImageBucketName =
  process.env.USER_IDENTITY_BUCKET_NAME;

//TODO: move those to secure secret storage
const S3AccessKey = process.env.S3_ACCESS_KEY;
const S3SecurityKey = process.env.S3_SECURITY_KEY;

//------------------------------- below should go in NPM package ------------------------------
//picture formats allowed
const AllowedMimes = [
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/pdf',
];

//size in bytes
const MaxFileSize = 1048576;

const SearchKeySeparator = '---id:';
const SearchKeySeparatorShort = '---';

const SearchKeyTypes = {
  NAME_IN_ENGLISH: 0,
  OTHER_NAME: 1,
  ABBREVIATION: 2,
};

const SearchKeyStatus = {
  DELETED: 0,
  PENDING: 1,
  ACTIVE: 2,
};

const PremiumWaitlistLeadStatus = {
  DELETED: 0,
  ACTIVE: 1,
};

const FeedbackType = {
  COMPLAINT: 0,
  SUGGESTION: 1,
  COMMENT: 2,
  QUESTION: 3,
  OTHER: 4,
};

const FeedbackTypeDisplay = {
  0: 'Complaint',
  1: 'Suggestion',
  2: 'Comment',
  3: 'Question',
  4: 'Other',
};

const IssuerStatus = {
  DELETED: 0,
  PENDING: 1,
  ACTIVE: 2,
};

const IssuerType = {
  UNKNOWN_ISSUER_TYPE: 0,
  TYPEA: 1,
  TYPEB: 2,
  TYPEC: 3,
  TYPED: 4,
  TYPEE: 5,
  TYPEF: 6,
};

const UserResourceStatus = {
  DELETED: 0,
  PENDING: 1,
  ACTIVE: 2,
};

const UserResourcePrivacyStatus = {
  PRIVATE: 0,
  PASSWORD_PROTECTED: 1,
  EMAIL_CONFIRMATION: 2,
  PUBLIC: 3,
};

const UserResourceValidity = {
  FAKE: 0,
  UNTRUSTED: 1,
  AI_VERIFIED: 2,
  ISSUER_CONFIRMED: 3,
};

const UserResourceType = {
  UNKNOWN_USERRESOURCE_TYPE: 0,
  TYPEA: 1,
  TYPEB: 2,
  TYPEC: 3,
  TYPED: 4,
  TYPEE: 5,
  TYPEF: 6,
};

const Separator = '@_@';

//------------------------------- TODO above should go in NPM package ------------------------------

const UserStatus = {
  DELETED: 0,
  NEEDS_UPDATE: 1,
  PENDING_APPROVAL: 2,
  ACTIVE: 3,
  REJECTED: 4,
};

const IdentityPrivacySettings = {
  NEVER_SHOW: 0,
  REQUIRE_EMAIL: 1,
  ALWAYS_SHOW: 2,
};

const UserSubscriptions = {
  FREE_TIER: 0,
  PREMIUM_TIER: 1,
};

const UserSubscriptionsMaxFreeUserResourcesPublished = {
  FREE_TIER: 2,
  PREMIUM_TIER: 10,
};

module.exports = {
  UserSubscriptionsMaxFreeUserResourcesPublished,
  SearchKeySeparator,
  SearchKeySeparatorShort,
  SearchKeyTypes,
  SearchKeyStatus,
  PremiumWaitlistLeadStatus,
  AwsRegion,
  S3AccessKey,
  S3SecurityKey,
  defaultNumberIssuersReturned,
  defaultNumberUserResourcesReturned,
  FeedbackType,
  FeedbackTypeDisplay,
  UsersTableName,
  UserStatus,
  IdentityPrivacySettings,
  IssuerSearchKeysTableName,
  PremiumWaitlistLeadTableName,
  FeedbackTableName,
  UserSubscriptions,
  IssuersTableName,
  IssuerStatus,
  IssuerType,
  UserResourcesTableName,
  UserResourceStatus,
  UserResourcePrivacyStatus,
  UserResourceValidity,
  UserResourceType,
  Separator,
  UserResourceImageBucketName,
  UserIdentityImageBucketName,
  AllowedMimes,
  MaxFileSize,
};
