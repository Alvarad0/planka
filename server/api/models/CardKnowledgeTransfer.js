/**
 * CardKnowledgeTransfer.js
 *
 * @description :: A user who must learn what a card is about, and whether it was explained to them.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CardKnowledgeTransfer:
 *       type: object
 *       required:
 *         - id
 *         - cardId
 *         - userId
 *         - isExplained
 *         - explainedByUserId
 *         - explainedAt
 *         - creatorUserId
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the knowledge transfer
 *           example: "1357158568008091264"
 *         cardId:
 *           type: string
 *           description: ID of the card whose knowledge is transferred
 *           example: "1357158568008091265"
 *         userId:
 *           type: string
 *           description: ID of the user who must learn it
 *           example: "1357158568008091266"
 *         isExplained:
 *           type: boolean
 *           description: Whether it was explained to the user
 *           example: true
 *         explainedByUserId:
 *           type: string
 *           nullable: true
 *           description: ID of the user who marked it as explained (null when not explained or when that user was deleted)
 *           example: "1357158568008091267"
 *         explainedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: When it was marked as explained
 *           example: 2026-10-09T12:00:00.000Z
 *         creatorUserId:
 *           type: string
 *           nullable: true
 *           description: ID of the user who added the assignee
 *           example: "1357158568008091267"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: When the knowledge transfer was created
 *           example: 2026-10-09T12:00:00.000Z
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: When the knowledge transfer was last updated
 *           example: 2026-10-09T12:00:00.000Z
 *     KnowledgeTransferUser:
 *       type: object
 *       description: Public fields of a user, as other users see them
 *       required:
 *         - id
 *         - name
 *       properties:
 *         id:
 *           type: string
 *           example: "1357158568008091266"
 *         name:
 *           type: string
 *           example: Jane Doe
 *         username:
 *           type: string
 *           nullable: true
 *           example: jane
 *         avatar:
 *           type: object
 *           nullable: true
 *           properties:
 *             url:
 *               type: string
 *               format: uri
 *             thumbnailUrls:
 *               type: object
 *               properties:
 *                 cover180:
 *                   type: string
 *                   format: uri
 *         gravatarUrl:
 *           type: string
 *           format: uri
 *           description: Present only when Gravatar is enabled
 *         isDeactivated:
 *           type: boolean
 *           example: false
 */

module.exports = {
  attributes: {
    //  ╔═╗╦═╗╦╔╦╗╦╔╦╗╦╦  ╦╔═╗╔═╗
    //  ╠═╝╠╦╝║║║║║ ║ ║╚╗╔╝║╣ ╚═╗
    //  ╩  ╩╚═╩╩ ╩╩ ╩ ╩ ╚╝ ╚═╝╚═╝

    isExplained: {
      type: 'boolean',
      defaultsTo: false,
      columnName: 'is_explained',
    },
    explainedAt: {
      type: 'ref',
      columnName: 'explained_at',
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
    userId: {
      model: 'User',
      required: true,
      columnName: 'user_id',
    },
    explainedByUserId: {
      model: 'User',
      columnName: 'explained_by_user_id',
    },
    creatorUserId: {
      model: 'User',
      columnName: 'creator_user_id',
    },
  },

  tableName: 'card_knowledge_transfer',
};
