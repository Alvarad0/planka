const crypto = require('crypto');
const { expect } = require('chai');
const request = require('supertest');
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = require('undici');

const ENV_GITLAB_URL = 'https://gitlab-env.test';
const ENV_GITLAB_TOKEN = 'glpat-config-env-token';
const DB_GITLAB_URL = 'https://gitlab-db.test';
const DB_GITLAB_TOKEN = 'glpat-config-db-token';
const OTHER_GITLAB_TOKEN = 'glpat-config-other-token';

const ADMIN_API_KEY = 'test-config-admin-api-key';
const USER_API_KEY = 'test-config-user-api-key';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const createUser = (name, role, apiKey) =>
  User.create({
    role,
    name,
    email: `${name}@planka.test`,
    apiKeyHash: sha256(apiKey),
  }).fetch();

describe('GitLab settings (config controllers)', () => {
  const originalCustom = {};
  const responseBodies = [];

  let originalDispatcher;
  let mockAgent;

  let admin;
  let user;

  const api = (method, url, apiKey = ADMIN_API_KEY) => {
    const req = request(sails.hooks.http.app)[method](url);

    return apiKey ? req.set('X-Api-Key', apiKey) : req;
  };

  // Records every response body so the suite can assert that the token never leaks
  const send = async (req, body) => {
    const response = await (body ? req.send(body) : req);
    responseBodies.push(response.text);

    return response;
  };

  const mockGetCurrentUser = (baseUrl, token, status = 200, body = undefined) =>
    mockAgent
      .get(baseUrl)
      .intercept({
        path: '/api/v4/user',
        method: 'GET',
        headers: { 'private-token': token },
      })
      .reply(status, body || { id: 9, username: 'planka_bot', name: 'Planka Bot' });

  const saveDbSettings = () =>
    send(api('patch', '/api/config'), {
      gitlabUrl: DB_GITLAB_URL,
      gitlabToken: DB_GITLAB_TOKEN,
    });

  before(async () => {
    ['gitlabUrl', 'gitlabToken', 'outgoingProxy'].forEach((key) => {
      originalCustom[key] = sails.config.custom[key];
    });

    originalDispatcher = getGlobalDispatcher();

    admin = await createUser('configadmin', User.Roles.ADMIN, ADMIN_API_KEY);
    user = await createUser('configuser', User.Roles.PROJECT_OWNER, USER_API_KEY);
  });

  after(async () => {
    Object.assign(sails.config.custom, originalCustom);
    setGlobalDispatcher(originalDispatcher);

    await User.destroy({ id: [admin.id, user.id] });

    responseBodies.forEach((body) => {
      [ENV_GITLAB_TOKEN, DB_GITLAB_TOKEN, OTHER_GITLAB_TOKEN].forEach((token) => {
        expect(body).to.not.include(token);
      });
    });
  });

  beforeEach(() => {
    // GitLab not configured via env, so the UI settings apply
    Object.assign(sails.config.custom, {
      gitlabUrl: null,
      gitlabToken: undefined,
      outgoingProxy: undefined,
    });

    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(async () => {
    setGlobalDispatcher(originalDispatcher);
    await mockAgent.close();

    await Config.qm.updateOneMain({
      gitlabUrl: null,
      gitlabToken: null,
    });
  });

  describe('settings resolution', () => {
    it('is not configured without env vars or saved settings', async () => {
      expect(await sails.helpers.gitlab.getSettings()).to.deep.equal({
        url: null,
        token: null,
        source: null,
      });
    });

    it('uses the saved settings, decrypted', async () => {
      await saveDbSettings();

      expect(await sails.helpers.gitlab.getSettings()).to.deep.equal({
        url: DB_GITLAB_URL,
        token: DB_GITLAB_TOKEN,
        source: 'db',
      });
    });

    it('prefers the env vars when both are set', async () => {
      await saveDbSettings();

      Object.assign(sails.config.custom, {
        gitlabUrl: ENV_GITLAB_URL,
        gitlabToken: ENV_GITLAB_TOKEN,
      });

      expect(await sails.helpers.gitlab.getSettings()).to.deep.equal({
        url: ENV_GITLAB_URL,
        token: ENV_GITLAB_TOKEN,
        source: 'env',
      });
    });

    it('ignores a lone env var', async () => {
      await saveDbSettings();

      sails.config.custom.gitlabUrl = ENV_GITLAB_URL;

      expect((await sails.helpers.gitlab.getSettings()).source).to.equal('db');
    });

    it('is not configured when only one value is saved', async () => {
      await send(api('patch', '/api/config'), {
        gitlabUrl: DB_GITLAB_URL,
      });

      expect((await sails.helpers.gitlab.getSettings()).source).to.equal(null);
    });

    it('treats a token that cannot be decrypted as not set, without logging it', async () => {
      await saveDbSettings();

      const { gitlabToken } = await Config.qm.getOneMain();
      const [version, iv, , ciphertext] = gitlabToken.split(':');
      await Config.qm.updateOneMain({
        gitlabToken: [version, iv, Buffer.alloc(16).toString('base64'), ciphertext].join(':'),
      });

      const warnings = [];
      const originalWarn = sails.log.warn;
      sails.log.warn = (...args) => warnings.push(args.join(' '));

      let settings;
      try {
        settings = await sails.helpers.gitlab.getSettings();
      } finally {
        sails.log.warn = originalWarn;
      }

      expect(settings.source).to.equal(null);
      expect(warnings.join('\n')).to.include('could not be decrypted');
      expect(warnings.join('\n')).to.not.include(DB_GITLAB_TOKEN);
    });
  });

  describe('update and show', () => {
    it('stores the token encrypted and never returns it', async () => {
      const response = await saveDbSettings();

      expect(response.status).to.equal(200);
      expect(response.body.item.gitlabUrl).to.equal(DB_GITLAB_URL);
      expect(response.body.item.isGitlabTokenSet).to.equal(true);
      expect(response.body.item.isGitlabManagedByEnv).to.equal(false);
      expect(response.body.item).to.not.have.property('gitlabToken');

      const config = await Config.qm.getOneMain();

      expect(config.gitlabToken).to.match(/^v1:/);
      expect(config.gitlabToken).to.not.include(DB_GITLAB_TOKEN);

      const showResponse = await send(api('get', '/api/config'));

      expect(showResponse.status).to.equal(200);
      expect(showResponse.body.item).to.not.have.property('gitlabToken');
      expect(showResponse.body.item.isGitlabTokenSet).to.equal(true);
    });

    it('normalizes the URL and rejects invalid ones', async () => {
      const response = await send(api('patch', '/api/config'), {
        gitlabUrl: ' https://gitlab-db.test/gitlab/ ',
      });

      expect(response.status).to.equal(200);
      expect(response.body.item.gitlabUrl).to.equal('https://gitlab-db.test/gitlab');

      const invalidUrls = [
        'ftp://gitlab-db.test',
        'https://user:pass@gitlab-db.test',
        'https://gitlab-db.test?x=1',
        'not a url',
      ];

      // eslint-disable-next-line no-restricted-syntax
      for (const gitlabUrl of invalidUrls) {
        // eslint-disable-next-line no-await-in-loop
        const invalidResponse = await send(api('patch', '/api/config'), { gitlabUrl });

        expect(invalidResponse.status).to.equal(422);
        expect(invalidResponse.body.message).to.equal('Invalid GitLab URL');
      }

      expect((await Config.qm.getOneMain()).gitlabUrl).to.equal('https://gitlab-db.test/gitlab');
    });

    it('keeps the token when omitted and clears it with an empty value or null', async () => {
      await saveDbSettings();

      let response = await send(api('patch', '/api/config'), {
        gitlabUrl: 'https://gitlab-other.test',
      });

      expect(response.body.item.isGitlabTokenSet).to.equal(true);
      expect((await sails.helpers.gitlab.getSettings()).token).to.equal(DB_GITLAB_TOKEN);

      response = await send(api('patch', '/api/config'), { gitlabToken: '' });

      expect(response.body.item.isGitlabTokenSet).to.equal(false);
      expect((await Config.qm.getOneMain()).gitlabToken).to.equal(null);

      await saveDbSettings();
      response = await send(api('patch', '/api/config'), { gitlabToken: null, gitlabUrl: '' });

      expect(response.body.item.isGitlabTokenSet).to.equal(false);
      expect(response.body.item.gitlabUrl).to.equal(null);
    });

    it('rejects GitLab settings when GitLab is configured via env', async () => {
      Object.assign(sails.config.custom, {
        gitlabUrl: ENV_GITLAB_URL,
        gitlabToken: ENV_GITLAB_TOKEN,
      });

      const response = await send(api('patch', '/api/config'), {
        gitlabToken: DB_GITLAB_TOKEN,
      });

      expect(response.status).to.equal(403);
      expect(response.body.message).to.equal('GitLab is configured via environment variables');
      expect((await Config.qm.getOneMain()).gitlabToken).to.equal(null);

      const showResponse = await send(api('get', '/api/config'));

      expect(showResponse.body.item).to.include({
        gitlabUrl: ENV_GITLAB_URL,
        isGitlabTokenSet: true,
        isGitlabManagedByEnv: true,
      });
    });

    it('is admin only', async () => {
      const response = await send(api('patch', '/api/config', USER_API_KEY), {
        gitlabToken: DB_GITLAB_TOKEN,
      });

      expect(response.status).to.not.equal(200);
      expect((await Config.qm.getOneMain()).gitlabToken).to.equal(null);
    });
  });

  describe('test-gitlab', () => {
    it('tests the saved settings and returns the GitLab user', async () => {
      await saveDbSettings();
      mockGetCurrentUser(DB_GITLAB_URL, DB_GITLAB_TOKEN);

      const response = await send(api('post', '/api/config/test-gitlab'));

      expect(response.status).to.equal(200);
      expect(response.body.item).to.deep.equal({
        username: 'planka_bot',
        name: 'Planka Bot',
      });
    });

    it('tests unsaved values, falling back to the saved token', async () => {
      await saveDbSettings();
      mockGetCurrentUser('https://gitlab-other.test', DB_GITLAB_TOKEN);
      mockGetCurrentUser(DB_GITLAB_URL, OTHER_GITLAB_TOKEN);

      let response = await send(api('post', '/api/config/test-gitlab'), {
        gitlabUrl: 'https://gitlab-other.test/',
      });

      expect(response.status).to.equal(200);

      response = await send(api('post', '/api/config/test-gitlab'), {
        gitlabToken: OTHER_GITLAB_TOKEN,
      });

      expect(response.status).to.equal(200);

      // Testing never saves
      expect(await sails.helpers.gitlab.getSettings()).to.include({
        url: DB_GITLAB_URL,
        token: DB_GITLAB_TOKEN,
      });
    });

    it('answers 422, never 401, when the token is rejected', async () => {
      await saveDbSettings();
      mockGetCurrentUser(DB_GITLAB_URL, DB_GITLAB_TOKEN, 401, {
        message: `401 Unauthorized ${DB_GITLAB_TOKEN}`,
      });

      const response = await send(api('post', '/api/config/test-gitlab'));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab token is invalid or expired');
    });

    it('answers 422 when the URL is not a GitLab API', async () => {
      await saveDbSettings();
      mockGetCurrentUser(DB_GITLAB_URL, DB_GITLAB_TOKEN, 404, { message: 'Not Found' });

      const response = await send(api('post', '/api/config/test-gitlab'));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab API not found at this URL');
    });

    it('answers 422 when GitLab is not configured', async () => {
      const response = await send(api('post', '/api/config/test-gitlab'));

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('GitLab is not configured');
    });

    it('rejects an invalid URL', async () => {
      const response = await send(api('post', '/api/config/test-gitlab'), {
        gitlabUrl: 'file:///etc/passwd',
        gitlabToken: OTHER_GITLAB_TOKEN,
      });

      expect(response.status).to.equal(422);
      expect(response.body.message).to.equal('Invalid GitLab URL');
    });

    it('tests the env settings, which cannot be overridden', async () => {
      Object.assign(sails.config.custom, {
        gitlabUrl: ENV_GITLAB_URL,
        gitlabToken: ENV_GITLAB_TOKEN,
      });

      mockGetCurrentUser(ENV_GITLAB_URL, ENV_GITLAB_TOKEN);

      let response = await send(api('post', '/api/config/test-gitlab'));

      expect(response.status).to.equal(200);
      expect(response.body.item.username).to.equal('planka_bot');

      response = await send(api('post', '/api/config/test-gitlab'), {
        gitlabUrl: DB_GITLAB_URL,
        gitlabToken: OTHER_GITLAB_TOKEN,
      });

      expect(response.status).to.equal(403);
    });

    it('is admin only', async () => {
      await saveDbSettings();

      const response = await send(api('post', '/api/config/test-gitlab', USER_API_KEY));

      expect(response.status).to.not.equal(200);
    });
  });

  describe('GitLab client', () => {
    it('picks up saved settings without a restart', async () => {
      await sails.helpers.gitlab
        .makeClient()
        .then(() => {
          throw new Error('Expected GitLab to be not configured');
        })
        .catch((error) => {
          expect(error.code).to.equal('gitlabNotConfigured');
        });

      await saveDbSettings();
      mockGetCurrentUser(DB_GITLAB_URL, DB_GITLAB_TOKEN);

      const client = await sails.helpers.gitlab.makeClient();

      expect((await client.getCurrentUser()).username).to.equal('planka_bot');
    });
  });
});
