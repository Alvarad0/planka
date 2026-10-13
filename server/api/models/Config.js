/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * Config.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Config:
 *       type: object
 *       required:
 *         - id
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the config (always set to '1')
 *           example: "1"
 *         smtpHost:
 *           type: string
 *           nullable: true
 *           description: Hostname or IP address of the SMTP server
 *           example: smtp.example.com
 *         smtpPort:
 *           type: number
 *           nullable: true
 *           description: Port number of the SMTP server
 *           example: 587
 *         smtpName:
 *           type: string
 *           nullable: true
 *           description: Client hostname used in the EHLO command for SMTP
 *           example: localhost
 *         smtpSecure:
 *           type: boolean
 *           description: Whether to use a secure connection for SMTP
 *           example: false
 *         smtpTlsRejectUnauthorized:
 *           type: boolean
 *           description: Whether to reject unauthorized or self-signed TLS certificates for SMTP connections
 *           example: true
 *         smtpUser:
 *           type: string
 *           nullable: true
 *           description: Username for authenticating with the SMTP server
 *           example: no-reply@example.com
 *         smtpPassword:
 *           type: string
 *           nullable: true
 *           description: Password for authenticating with the SMTP server
 *           example: SecurePassword123!
 *         smtpFrom:
 *           type: string
 *           nullable: true
 *           description: Default "from" used for outgoing SMTP emails
 *           example: no-reply@example.com
 *         gitlabUrl:
 *           type: string
 *           nullable: true
 *           description: Base URL of the GitLab instance used by the GitLab Bridge
 *           example: https://gitlab.example.com
 *         isGitlabTokenSet:
 *           type: boolean
 *           description: Whether a GitLab token is configured (the token itself is never returned)
 *           example: true
 *         isGitlabManagedByEnv:
 *           type: boolean
 *           description: Whether GitLab is configured via environment variables (read-only in the UI)
 *           example: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: When the config was created
 *           example: 2024-01-01T00:00:00.000Z
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: When the config was last updated
 *           example: 2024-01-01T00:00:00.000Z
 */

const MAIN_ID = '1';

const SMTP_FIELD_NAMES = [
  'smtpHost',
  'smtpPort',
  'smtpName',
  'smtpSecure',
  'smtpTlsRejectUnauthorized',
  'smtpUser',
  'smtpPassword',
  'smtpFrom',
];

// HKDF context of the key that encrypts the stored GitLab token (see utils/secret-box.js)
const GITLAB_TOKEN_ENCRYPTION_CONTEXT = 'planka:gitlab-token';

module.exports = {
  MAIN_ID,
  SMTP_FIELD_NAMES,
  GITLAB_TOKEN_ENCRYPTION_CONTEXT,

  attributes: {
    //  ╔═╗╦═╗╦╔╦╗╦╔╦╗╦╦  ╦╔═╗╔═╗
    //  ╠═╝╠╦╝║║║║║ ║ ║╚╗╔╝║╣ ╚═╗
    //  ╩  ╩╚═╩╩ ╩╩ ╩ ╩ ╚╝ ╚═╝╚═╝

    smtpHost: {
      type: 'string',
      allowNull: true,
      columnName: 'smtp_host',
    },
    smtpPort: {
      type: 'number',
      allowNull: true,
      columnName: 'smtp_port',
    },
    smtpName: {
      type: 'string',
      allowNull: true,
      columnName: 'smtp_name',
    },
    smtpSecure: {
      type: 'boolean',
      required: true,
      columnName: 'smtp_secure',
    },
    smtpTlsRejectUnauthorized: {
      type: 'boolean',
      required: true,
      columnName: 'smtp_tls_reject_unauthorized',
    },
    smtpUser: {
      type: 'string',
      allowNull: true,
      columnName: 'smtp_user',
    },
    smtpPassword: {
      type: 'string',
      allowNull: true,
      columnName: 'smtp_password',
    },
    smtpFrom: {
      type: 'string',
      allowNull: true,
      columnName: 'smtp_from',
    },
    gitlabUrl: {
      type: 'string',
      allowNull: true,
      columnName: 'gitlab_url',
    },
    // Ciphertext only, never presented
    gitlabToken: {
      type: 'string',
      allowNull: true,
      columnName: 'gitlab_token',
    },

    //  ╔═╗╔╦╗╔╗ ╔═╗╔╦╗╔═╗
    //  ║╣ ║║║╠╩╗║╣  ║║╚═╗
    //  ╚═╝╩ ╩╚═╝╚═╝═╩╝╚═╝

    //  ╔═╗╔═╗╔═╗╔═╗╔═╗╦╔═╗╔╦╗╦╔═╗╔╗╔╔═╗
    //  ╠═╣╚═╗╚═╗║ ║║  ║╠═╣ ║ ║║ ║║║║╚═╗
    //  ╩ ╩╚═╝╚═╝╚═╝╚═╝╩╩ ╩ ╩ ╩╚═╝╝╚╝╚═╝
  },
};
