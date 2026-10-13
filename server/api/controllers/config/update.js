/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * @swagger
 * /config:
 *   patch:
 *     summary: Update application configuration
 *     description: Updates the application configuration. Requires admin privileges.
 *     tags:
 *       - Config
 *     operationId: updateConfig
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               smtpHost:
 *                 type: string
 *                 maxLength: 256
 *                 nullable: true
 *                 description: Hostname or IP address of the SMTP server
 *                 example: smtp.example.com
 *               smtpPort:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 65535
 *                 nullable: true
 *                 description: Port number of the SMTP server
 *                 example: 587
 *               smtpName:
 *                 type: string
 *                 maxLength: 256
 *                 nullable: true
 *                 description: Client hostname used in the EHLO command for SMTP
 *                 example: localhost
 *               smtpSecure:
 *                 type: boolean
 *                 description: Whether to use a secure connection for SMTP
 *                 example: false
 *               smtpTlsRejectUnauthorized:
 *                 type: boolean
 *                 description: Whether to reject unauthorized or self-signed TLS certificates for SMTP connections
 *                 example: true
 *               smtpUser:
 *                 type: string
 *                 maxLength: 256
 *                 nullable: true
 *                 description: Username for authenticating with the SMTP server
 *                 example: no-reply@example.com
 *               smtpPassword:
 *                 type: string
 *                 maxLength: 256
 *                 nullable: true
 *                 description: Password for authenticating with the SMTP server
 *                 example: SecurePassword123!
 *               smtpFrom:
 *                 type: string
 *                 maxLength: 256
 *                 nullable: true
 *                 description: Default "from" used for outgoing SMTP emails
 *                 example: no-reply@example.com
 *               gitlabUrl:
 *                 type: string
 *                 maxLength: 2048
 *                 nullable: true
 *                 description: Base URL of the GitLab instance (http or https, without credentials or query). Empty or null clears it. Not available when GitLab is configured via environment variables.
 *                 example: https://gitlab.example.com
 *               gitlabToken:
 *                 type: string
 *                 maxLength: 1024
 *                 nullable: true
 *                 description: GitLab access token, stored encrypted and never returned. Empty or null clears it, omitted keeps it. Not available when GitLab is configured via environment variables.
 *                 example: glpat-xxxxxxxxxxxxxxxxxxxx
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/Config'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       422:
 *         $ref: '#/components/responses/UnprocessableEntity'
 */

const { normalizeGitlabUrl } = require('../../../utils/gitlab-url');

const Errors = {
  GITLAB_NOT_AVAILABLE: {
    gitlabNotAvailable: 'GitLab is configured via environment variables',
  },
  INVALID_GITLAB_URL: {
    invalidGitlabUrl: 'Invalid GitLab URL',
  },
};

module.exports = {
  inputs: {
    smtpHost: {
      type: 'string',
      isNotEmptyString: true,
      maxLength: 256,
      allowNull: true,
    },
    smtpPort: {
      type: 'number',
      min: 0,
      max: 65535,
      allowNull: true,
    },
    smtpName: {
      type: 'string',
      isNotEmptyString: true,
      maxLength: 256,
      allowNull: true,
    },
    smtpSecure: {
      type: 'boolean',
    },
    smtpTlsRejectUnauthorized: {
      type: 'boolean',
    },
    smtpUser: {
      type: 'string',
      isNotEmptyString: true,
      maxLength: 256,
      allowNull: true,
    },
    smtpPassword: {
      type: 'string',
      isNotEmptyString: true,
      maxLength: 256,
      allowNull: true,
    },
    smtpFrom: {
      type: 'string',
      isNotEmptyString: true,
      maxLength: 256,
      allowNull: true,
    },
    gitlabUrl: {
      type: 'string',
      maxLength: 2048,
      allowNull: true,
    },
    gitlabToken: {
      type: 'string',
      maxLength: 1024,
      allowNull: true,
    },
  },

  exits: {
    gitlabNotAvailable: {
      responseType: 'forbidden',
    },
    invalidGitlabUrl: {
      responseType: 'unprocessableEntity',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const values = _.pick(inputs, [
      'smtpHost',
      'smtpPort',
      'smtpName',
      'smtpSecure',
      'smtpTlsRejectUnauthorized',
      'smtpUser',
      'smtpPassword',
      'smtpFrom',
    ]);

    if (!_.isUndefined(inputs.gitlabUrl) || !_.isUndefined(inputs.gitlabToken)) {
      if (sails.helpers.gitlab.isManagedByEnv()) {
        throw Errors.GITLAB_NOT_AVAILABLE;
      }

      if (!_.isUndefined(inputs.gitlabUrl)) {
        try {
          values.gitlabUrl = normalizeGitlabUrl(inputs.gitlabUrl);
        } catch (error) {
          throw Errors.INVALID_GITLAB_URL;
        }
      }

      // Write-only: an empty value clears the token, an omitted one keeps it
      if (!_.isUndefined(inputs.gitlabToken)) {
        const gitlabToken = inputs.gitlabToken && inputs.gitlabToken.trim();

        values.gitlabToken = gitlabToken ? sails.helpers.gitlab.encryptToken(gitlabToken) : null;
      }
    }

    const config = await sails.helpers.config.updateMain.with({
      values,
      actorUser: currentUser,
      request: this.req,
    });

    return {
      item: sails.helpers.config.presentOne(config),
    };
  },
};
