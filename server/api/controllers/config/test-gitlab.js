/**
 * @swagger
 * /config/test-gitlab:
 *   post:
 *     summary: Test GitLab configuration
 *     description: Checks that GitLab is reachable with the given (or saved) URL and token by reading the user the token belongs to. An omitted value falls back to the saved one, so unsaved changes can be tested. When GitLab is configured via environment variables, only those settings can be tested. Requires admin privileges.
 *     tags:
 *       - Config
 *     operationId: testGitlabConfig
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               gitlabUrl:
 *                 type: string
 *                 maxLength: 2048
 *                 description: Base URL of the GitLab instance to test instead of the saved one
 *                 example: https://gitlab.example.com
 *               gitlabToken:
 *                 type: string
 *                 maxLength: 1024
 *                 description: GitLab access token to test instead of the saved one
 *                 example: glpat-xxxxxxxxxxxxxxxxxxxx
 *     responses:
 *       200:
 *         description: Connection to GitLab works
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *               properties:
 *                 item:
 *                   type: object
 *                   description: GitLab user the token belongs to
 *                   properties:
 *                     username:
 *                       type: string
 *                       example: project_42_bot
 *                     name:
 *                       type: string
 *                       nullable: true
 *                       example: Planka Bot
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       422:
 *         $ref: '#/components/responses/UnprocessableEntity'
 */

const { createGitlabClient } = require('../../../utils/gitlab-client');
const { GitlabErrors, gitlabExits, mapGitlabError } = require('../../../utils/gitlab-errors');
const { normalizeGitlabUrl } = require('../../../utils/gitlab-url');

const Errors = {
  ...GitlabErrors,
  GITLAB_NOT_AVAILABLE: {
    gitlabNotAvailable: 'GitLab is configured via environment variables',
  },
  INVALID_GITLAB_URL: {
    invalidGitlabUrl: 'Invalid GitLab URL',
  },
  GITLAB_API_NOT_FOUND: {
    gitlabApiNotFound: 'GitLab API not found at this URL',
  },
};

module.exports = {
  inputs: {
    gitlabUrl: {
      type: 'string',
      maxLength: 2048,
    },
    gitlabToken: {
      type: 'string',
      maxLength: 1024,
    },
  },

  exits: {
    ...gitlabExits,
    gitlabNotAvailable: {
      responseType: 'forbidden',
    },
    invalidGitlabUrl: {
      responseType: 'unprocessableEntity',
    },
    gitlabApiNotFound: {
      responseType: 'unprocessableEntity',
    },
  },

  async fn(inputs) {
    const gitlabToken = inputs.gitlabToken && inputs.gitlabToken.trim();

    let url;
    let token;
    if (sails.helpers.gitlab.isManagedByEnv()) {
      // Env settings cannot be overridden, not even for a test
      if (!_.isUndefined(inputs.gitlabUrl) || gitlabToken) {
        throw Errors.GITLAB_NOT_AVAILABLE;
      }

      ({ gitlabUrl: url, gitlabToken: token } = sails.config.custom);
    } else {
      const config = await Config.qm.getOneMain();

      if (_.isUndefined(inputs.gitlabUrl)) {
        url = config.gitlabUrl;
      } else {
        try {
          url = normalizeGitlabUrl(inputs.gitlabUrl);
        } catch (error) {
          throw Errors.INVALID_GITLAB_URL;
        }
      }

      token = gitlabToken || sails.helpers.gitlab.decryptToken(config.gitlabToken);
    }

    if (!url || !token) {
      throw Errors.GITLAB_NOT_CONFIGURED;
    }

    let gitlabUser;
    try {
      const client = createGitlabClient({
        baseUrl: url,
        token,
        proxyUrl: sails.config.custom.outgoingProxy,
      });

      gitlabUser = await client.getCurrentUser();
    } catch (error) {
      throw mapGitlabError(error, {
        notFoundError: Errors.GITLAB_API_NOT_FOUND,
      });
    }

    return {
      item: gitlabUser,
    };
  },
};
