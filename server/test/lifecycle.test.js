const dotenv = require('dotenv');
const knex = require('knex');
const sails = require('sails');
const rc = require('sails/accessible/rc');

const knexfile = require('../db/knexfile');

process.env.NODE_ENV = 'test';

// The whole schema is dropped before every run, so refuse anything that is not clearly a test database.
const getTestDatabaseUrl = () => {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set');
  }

  const databaseName = new URL(url).pathname.slice(1);

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to reset "${databaseName}": test database name must end with "_test"`,
    );
  }

  return url;
};

const resetDatabase = async (url) => {
  const db = knex({
    ...knexfile,
    connection: {
      ...knexfile.connection,
      connectionString: url,
    },
  });

  try {
    await db.raw('DROP SCHEMA IF EXISTS public CASCADE');
    await db.raw('CREATE SCHEMA public');
    await db.migrate.latest();
  } finally {
    await db.destroy();
  }
};

before(async function beforeCallback() {
  this.timeout(60000);

  dotenv.config({ quiet: true });

  await resetDatabase(getTestDatabaseUrl());

  await new Promise((resolve, reject) => {
    sails.lift(rc('sails'), (error) => (error ? reject(error) : resolve()));
  });
});

after(function afterCallback(done) {
  sails.lower(done);
});
