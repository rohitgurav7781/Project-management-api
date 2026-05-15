require("dotenv").config();

module.exports = {
  dbUrl: process.env.DB_URL,
  backup: {
    db: {
      path: process.env.DB_BACKUP_PATH,
    },
  },
  storage: {
    baseUrl: process.env.STORAGE_BASE_URL,
    basePath: process.env.STORAGE_BASE_PATH,
    folder: {
      inventoryUploadItems: process.env.INVENTORY_UPLOAD_ITEMS,
      inventoryUploadProcessed: process.env.INVENTORY_UPLOAD_PROCESSED,
      inventoryUploadError: process.env.INVENTORY_UPLOAD_ERROR,
    },
    unauthLink: process.env.STORAGE_BASE_URL + process.env.STORAGE_UNAUTH_LINK,
    authLink: process.env.STORAGE_BASE_URL + process.env.STORAGE_AUTH_LINK,
  },
  aws: {
    region: process.env.AWS_REGION,
    link: process.env.AWS_LINK,
    inventoryUploadItems: process.env.AWS_INVENTORY_UPLOAD_ITEMS,
    inventoryReportDownload: process.env.AWS_INVENTORY_REPORT_DOWNLOAD,
  },
  fcm: {
    serverKey: process.env.FCM_SERVER_KEY,
  },
  smsGateway: {
    provider: process.env.SMS_PROVIDER,
    hostname: process.env.SMS_HOSTNAME,
    path: process.env.SMS_PATH,
    authorization: process.env.SMS_AUTHORIZATION,
    otpTemplateId: process.env.SMS_OTP_TEMPLATE_ID,
  },
  forgotPasswordUrl: process.env.FRONT_END_URL + "/#" + process.env.FORGOT_PASSWORD_URL,
  createUserUrl: process.env.FRONT_END_URL + "/#" + process.env.CREATE_USER_URL,
  configUserUrl: {
    forgotPasswordUrl: process.env.FRONT_END_URL + "/#" + process.env.CONFIG_FORGOT_PASSWORD_URL,
    createUserUrl: process.env.FRONT_END_URL + "/#" + process.env.CONFIG_CREATE_USER_URL,
  },
  emailGateway: {
    provider: process.env.EMAIL_PROVIDER,
    server: process.env.EMAIL_SERVER,
    userName: process.env.EMAIL_USERNAME,
    password: process.env.EMAIL_PASSWORD,
    region: process.env.EMAIL_REGION,
    senderEmail: process.env.EMAIL_SENDER,
    replyToEmail: process.env.EMAIL_REPLY_TO,
  },
  googleApis: {
    coordinatesApi: process.env.GOOGLE_COORDINATES_API,
    locationsApi: process.env.GOOGLE_LOCATIONS_API,
    apiKey: process.env.GOOGLE_API_KEY,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
  },
  hostName: process.env.HOST_NAME,
  contactNumber: process.env.CONTACT_NUMBER,
  baseUrl: process.env.BASE_URL,
};
