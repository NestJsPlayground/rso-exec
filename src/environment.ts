import * as uuidv1 from 'uuid/v1';

const envType = (process.env.NODE_ENV || 'dev') as 'dev' | 'prod' | 'stage' | 'test';
const appName = 'rso-exec';

export const environment = {
  appName,
  envType,
  appId: `${ appName }-${ uuidv1() }`,

  port: + (process.env.PORT || 3000),
  target: process.env.TARGET,

  deployVersion: process.env.DEPLOY_VERSION || 'unknown',

  consul: {
    host: process.env.CONSUL_HOST || `consul`
  },

  simulateFail: false,

  loggly: {
    token    : process.env.LOGZIO_TOKEN,
    subdomain: 'tilentomakic',
    tags     : ['Winston-NodeJS'],
    json     : true
  },

  mongo: process.env.MONGO_HOST
};

console.log('Used env', environment);
