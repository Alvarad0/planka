/**
 * GitlabCardLink.js
 *
 * @description :: Links a Planka card to a GitLab issue (GitLab Bridge).
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     GitlabCardLink:
 *       type: object
 *       required:
 *         - id
 *         - cardId
 *         - gitlabIntegrationId
 *         - issueId
 *         - issueIid
 *         - issueUrl
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the GitLab card link
 *           example: "1357158568008091264"
 *         cardId:
 *           type: string
 *           description: ID of the linked card
 *           example: "1357158568008091265"
 *         gitlabIntegrationId:
 *           type: string
 *           description: ID of the GitLab integration the issue belongs to
 *           example: "1357158568008091266"
 *         issueId:
 *           type: integer
 *           description: Global ID of the GitLab issue
 *           example: 9001
 *         issueIid:
 *           type: integer
 *           description: Project-scoped IID of the GitLab issue
 *           example: 12
 *         issueUrl:
 *           type: string
 *           description: Web URL of the GitLab issue
 *           example: https://gitlab.example.com/group/project/-/issues/12
 *         branchName:
 *           type: string
 *           nullable: true
 *           description: Name of the GitLab branch created for the card
 *           example: 12-implement-login
 *         branchUrl:
 *           type: string
 *           nullable: true
 *           description: Web URL of the GitLab branch created for the card
 *           example: https://gitlab.example.com/group/project/-/tree/12-implement-login
 *         snapshot:
 *           type: object
 *           nullable: true
 *           description: Last known GitLab data, shown when GitLab is unreachable. Links stored before merge requests were supported hold only the issue fields (`title`, `state`, `updatedAt`) at the top level.
 *           properties:
 *             issue:
 *               type: object
 *               properties:
 *                 title:
 *                   type: string
 *                   example: Implement login
 *                 state:
 *                   type: string
 *                   enum: [opened, closed]
 *                   example: opened
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   example: 2026-10-05T12:00:00.000Z
 *             mergeRequest:
 *               allOf:
 *                 - $ref: '#/components/schemas/GitlabMergeRequest'
 *               nullable: true
 *             pipeline:
 *               allOf:
 *                 - $ref: '#/components/schemas/GitlabPipeline'
 *               nullable: true
 *             commitsCount:
 *               type: integer
 *               nullable: true
 *               maximum: 100
 *               example: 3
 *             hasMoreCommits:
 *               type: boolean
 *               example: false
 *         lastSyncedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: When the GitLab data was last fetched from GitLab
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
 *     GitlabIssue:
 *       type: object
 *       description: Issue data fetched from GitLab (or rebuilt from the snapshot when stale)
 *       properties:
 *         id:
 *           type: integer
 *           example: 9001
 *         iid:
 *           type: integer
 *           example: 12
 *         title:
 *           type: string
 *           nullable: true
 *           example: Implement login
 *         state:
 *           type: string
 *           nullable: true
 *           enum: [opened, closed]
 *           example: opened
 *         webUrl:
 *           type: string
 *           example: https://gitlab.example.com/group/project/-/issues/12
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: 2026-10-05T12:00:00.000Z
 *     GitlabMergeRequest:
 *       type: object
 *       description: Merge request data fetched from GitLab
 *       properties:
 *         id:
 *           type: integer
 *           example: 5001
 *         iid:
 *           type: integer
 *           example: 7
 *         title:
 *           type: string
 *           example: Implement login
 *         state:
 *           type: string
 *           enum: [opened, closed, locked, merged]
 *           example: opened
 *         draft:
 *           type: boolean
 *           example: false
 *         webUrl:
 *           type: string
 *           example: https://gitlab.example.com/group/project/-/merge_requests/7
 *         sourceBranch:
 *           type: string
 *           example: 12-implement-login
 *         targetBranch:
 *           type: string
 *           example: develop
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: 2026-10-05T12:00:00.000Z
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: 2026-10-05T12:00:00.000Z
 *         mergedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: null
 *     GitlabPipeline:
 *       type: object
 *       description: Pipeline data fetched from GitLab
 *       properties:
 *         id:
 *           type: integer
 *           example: 287
 *         status:
 *           type: string
 *           description: GitLab pipeline status (e.g. running, success, failed, canceled)
 *           example: success
 *         ref:
 *           type: string
 *           example: 12-implement-login
 *         sha:
 *           type: string
 *           example: 50f0acb76a40e34a4ff304f7347dcc6587da8a14
 *         webUrl:
 *           type: string
 *           example: https://gitlab.example.com/group/project/-/pipelines/287
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: 2026-10-05T12:00:00.000Z
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: 2026-10-05T12:00:00.000Z
 *     GitlabCommit:
 *       type: object
 *       description: Commit data fetched from GitLab
 *       properties:
 *         id:
 *           type: string
 *           example: 12d65c8dd2b2676fa3ac47d955accc085a37a9c1
 *         shortId:
 *           type: string
 *           example: 12d65c8d
 *         title:
 *           type: string
 *           example: Add login form
 *         authorName:
 *           type: string
 *           example: Jane Doe
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: 2026-10-05T12:00:00.000Z
 *         webUrl:
 *           type: string
 *           nullable: true
 *           example: https://gitlab.example.com/group/project/-/commit/12d65c8dd2b2676fa3ac47d955accc085a37a9c1
 */

module.exports = {
  attributes: {
    //  ╔═╗╦═╗╦╔╦╗╦╔╦╗╦╦  ╦╔═╗╔═╗
    //  ╠═╝╠╦╝║║║║║ ║ ║╚╗╔╝║╣ ╚═╗
    //  ╩  ╩╚═╩╩ ╩╩ ╩ ╩ ╚╝ ╚═╝╚═╝

    issueId: {
      type: 'number',
      required: true,
      columnName: 'issue_id',
    },
    issueIid: {
      type: 'number',
      required: true,
      columnName: 'issue_iid',
    },
    issueUrl: {
      type: 'string',
      required: true,
      columnName: 'issue_url',
    },
    branchName: {
      type: 'string',
      allowNull: true,
      columnName: 'branch_name',
    },
    branchUrl: {
      type: 'string',
      allowNull: true,
      columnName: 'branch_url',
    },
    snapshot: {
      type: 'json',
    },
    lastSyncedAt: {
      type: 'ref',
      columnName: 'last_synced_at',
    },
    // Internal (periodic sync queue order), never presented to clients
    lastSyncAttemptedAt: {
      type: 'ref',
      columnName: 'last_sync_attempted_at',
    },

    //  ╔═╗╔╦╗╔╗ ╔═╗╔╦╗╔═╗
    //  ║╣ ║║║╠╩╗║╣  ║║╚═╗
    //  ╚═╝╩ ╩╚═╝╚═╝═╩╝╚═╝

    //  ╔═╗╔═╗╔═╗╔═╗╔═╗╦╔═╗╔╦╗╦╔═╗╔╗╔╔═╗
    //  ╠═╣╚═╗╚═╗║ ║║  ║╠═╣ ║ ║║ ║║║║╚═╗
    //  ╩ ╩╚═╝╚═╝╚═╝╚═╝╩╩ ╩ ╩ ╩╚═╝╝╚╝╚═╝

    cardId: {
      model: 'Card',
      required: true,
      columnName: 'card_id',
    },
    gitlabIntegrationId: {
      model: 'GitlabIntegration',
      required: true,
      columnName: 'gitlab_integration_id',
    },
  },

  tableName: 'gitlab_card_link',
};
