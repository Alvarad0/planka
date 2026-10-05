/**
 * GitlabIntegration.js
 *
 * @description :: Links a Planka project to a GitLab project (GitLab Bridge).
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     GitlabIntegration:
 *       type: object
 *       required:
 *         - id
 *         - projectId
 *         - gitlabProjectId
 *         - gitlabProjectPath
 *         - defaultBranch
 *         - autoMoveOnMrOpen
 *         - autoMoveOnMrMerge
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the GitLab integration
 *           example: "1357158568008091264"
 *         projectId:
 *           type: string
 *           description: ID of the Planka project
 *           example: "1357158568008091265"
 *         reviewListId:
 *           type: string
 *           nullable: true
 *           description: List cards are moved to when a merge request is opened
 *           example: "1357158568008091266"
 *         completedListId:
 *           type: string
 *           nullable: true
 *           description: Closed list cards are moved to when a merge request is merged
 *           example: "1357158568008091267"
 *         gitlabProjectId:
 *           type: integer
 *           description: Numeric ID of the GitLab project
 *           example: 7
 *         gitlabProjectPath:
 *           type: string
 *           description: Full path of the GitLab project (display only)
 *           example: group/project
 *         defaultBranch:
 *           type: string
 *           description: Branch new branches are created from
 *           example: develop
 *         autoMoveOnMrOpen:
 *           type: boolean
 *           description: Whether to move cards to the review list when a merge request is opened
 *           example: false
 *         autoMoveOnMrMerge:
 *           type: boolean
 *           description: Whether to move cards to the completed list when a merge request is merged
 *           example: false
 *         lastSyncedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: When the integration was last synchronized with GitLab
 *           example: 2026-10-05T12:00:00.000Z
 *         createdAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: 2026-10-05T12:00:00.000Z
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: 2026-10-05T12:00:00.000Z
 */

module.exports = {
  attributes: {
    //  ╔═╗╦═╗╦╔╦╗╦╔╦╗╦╦  ╦╔═╗╔═╗
    //  ╠═╝╠╦╝║║║║║ ║ ║╚╗╔╝║╣ ╚═╗
    //  ╩  ╩╚═╩╩ ╩╩ ╩ ╩ ╚╝ ╚═╝╚═╝

    gitlabProjectId: {
      type: 'number',
      required: true,
      columnName: 'gitlab_project_id',
    },
    gitlabProjectPath: {
      type: 'string',
      required: true,
      columnName: 'gitlab_project_path',
    },
    defaultBranch: {
      type: 'string',
      required: true,
      columnName: 'default_branch',
    },
    autoMoveOnMrOpen: {
      type: 'boolean',
      defaultsTo: false,
      columnName: 'auto_move_on_mr_open',
    },
    autoMoveOnMrMerge: {
      type: 'boolean',
      defaultsTo: false,
      columnName: 'auto_move_on_mr_merge',
    },
    // SHA-256 of the webhook secret. Never presented to clients.
    webhookSecretHash: {
      type: 'string',
      required: true,
      columnName: 'webhook_secret_hash',
    },
    lastSyncedAt: {
      type: 'ref',
      columnName: 'last_synced_at',
    },

    //  ╔═╗╔╦╗╔╗ ╔═╗╔╦╗╔═╗
    //  ║╣ ║║║╠╩╗║╣  ║║╚═╗
    //  ╚═╝╩ ╩╚═╝╚═╝═╩╝╚═╝

    //  ╔═╗╔═╗╔═╗╔═╗╔═╗╦╔═╗╔╦╗╦╔═╗╔╗╔╔═╗
    //  ╠═╣╚═╗╚═╗║ ║║  ║╠═╣ ║ ║║ ║║║║╚═╗
    //  ╩ ╩╚═╝╚═╝╚═╝╚═╝╩╩ ╩ ╩ ╩╚═╝╝╚╝╚═╝

    projectId: {
      model: 'Project',
      required: true,
      columnName: 'project_id',
    },
    reviewListId: {
      model: 'List',
      columnName: 'review_list_id',
    },
    completedListId: {
      model: 'List',
      columnName: 'completed_list_id',
    },
  },

  tableName: 'gitlab_integration',
};
