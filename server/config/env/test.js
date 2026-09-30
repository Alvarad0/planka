/**
 * Test environment settings
 * (sails.config.*)
 *
 * What you see below is a quick outline of the built-in settings you need
 * to configure your Sails app for test.  The configuration in this file
 * is only used in your test environment, i.e. when you lift your app using:
 *
 * ```
 * NODE_ENV=test node app
 * ```
 *
 * > If you're using git as a version control solution for your Sails app,
 * > this file WILL BE COMMITTED to your repository by default, unless you add
 * > it to your .gitignore file.  If your repository will be publicly viewable,
 * > don't add private/sensitive data (like API secrets / db passwords) to this file!
 *
 * For more best practices and tips, see:
 * https://sailsjs.com/docs/concepts/deployment
 */

module.exports = {
  /**
   *
   * Tell Sails what database(s) it should use in test.
   *
   * (https://sailsjs.com/config/datastores)
   *
   */

  datastores: {
    /**
     *
     * Configure your default test database.
     *
     * 1. Choose an adapter:
     *    https://sailsjs.com/plugins/databases
     *
     * 2. Install it as a dependency of your Sails app.
     *    (For example:  npm install sails-mysql --save)
     *
     * 3. Then set it here (`adapter`), along with a connection URL (`url`)
     *    and any other, adapter-specific customizations.
     *    (See https://sailsjs.com/config/datastores for help.)
     *
     */

    // Query methods rely on raw SQL and the next_id() function, so tests must run on PostgreSQL.
    // The schema is reset and migrated in test/lifecycle.test.js.
    default: {
      adapter: 'sails-postgresql',
      url: process.env.TEST_DATABASE_URL,
    },
  },

  // Tests run inside the dev container, where the dev server already listens on 1337.
  port: process.env.TEST_PORT || 1338,

  log: {
    level: 'warn',
  },
};
