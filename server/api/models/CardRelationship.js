/**
 * CardRelationship.js
 *
 * @description :: Dependency or "related" link between two cards (GitLab Bridge). Stored in
 *                 canonical form: (cardId, relatedCardId, 'depends_on') means "card depends on
 *                 related card"; 'related' rows always have cardId < relatedCardId.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CardRelationship:
 *       type: object
 *       description: Relationship in canonical (stored) form
 *       required:
 *         - id
 *         - cardId
 *         - relatedCardId
 *         - type
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the relationship
 *           example: "1357158568008091264"
 *         cardId:
 *           type: string
 *           description: ID of the source card (the dependent card for `depends_on`)
 *           example: "1357158568008091265"
 *         relatedCardId:
 *           type: string
 *           description: ID of the target card (the blocking card for `depends_on`)
 *           example: "1357158568008091266"
 *         type:
 *           type: string
 *           enum: [depends_on, related]
 *           description: Canonical relationship type
 *           example: depends_on
 *     CardRelationshipView:
 *       type: object
 *       description: Relationship seen from one of its cards
 *       required:
 *         - id
 *         - type
 *         - relatedCardId
 *         - relatedCard
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the relationship
 *           example: "1357158568008091264"
 *         type:
 *           type: string
 *           enum: [dependsOn, blocks, related]
 *           description: Relationship type from the perspective of the requested card
 *           example: dependsOn
 *         relatedCardId:
 *           type: string
 *           description: ID of the other card
 *           example: "1357158568008091266"
 *         relatedCard:
 *           allOf:
 *             - $ref: '#/components/schemas/CardRelationshipCardSummary'
 *           nullable: true
 *           description: The other card, or null when the current user cannot read it
 *     CardRelationshipCardSummary:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - isClosed
 *         - boardId
 *         - boardName
 *         - listName
 *       properties:
 *         id:
 *           type: string
 *           example: "1357158568008091266"
 *         name:
 *           type: string
 *           example: Implement login
 *         isClosed:
 *           type: boolean
 *           example: false
 *         boardId:
 *           type: string
 *           example: "1357158568008091267"
 *         boardName:
 *           type: string
 *           example: Development
 *         listName:
 *           type: string
 *           nullable: true
 *           description: Name of the list (null for system lists without a name, e.g. archive or trash)
 *           example: To Do
 */

const Types = {
  DEPENDS_ON: 'depends_on',
  RELATED: 'related',
};

// Types as seen from one side of the relationship (API input and output)
const ViewTypes = {
  DEPENDS_ON: 'dependsOn',
  BLOCKS: 'blocks',
  RELATED: 'related',
};

// Fixed key of the Postgres advisory lock that serializes 'depends_on' inserts, so two concurrent
// requests cannot each pass the cycle check and together close a cycle. It is global (not per
// project) because cards can be moved across projects after being related, so a cycle is not
// guaranteed to stay within one project; relationship creation is rare and the lock is held for
// a couple of short queries only.
const DEPENDENCY_LOCK_KEY = '7203418265093472';

module.exports = {
  Types,
  ViewTypes,
  DEPENDENCY_LOCK_KEY,

  attributes: {
    //  ╔═╗╦═╗╦╔╦╗╦╔╦╗╦╦  ╦╔═╗╔═╗
    //  ╠═╝╠╦╝║║║║║ ║ ║╚╗╔╝║╣ ╚═╗
    //  ╩  ╩╚═╩╩ ╩╩ ╩ ╩ ╚╝ ╚═╝╚═╝

    type: {
      type: 'string',
      isIn: Object.values(Types),
      required: true,
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
    relatedCardId: {
      model: 'Card',
      required: true,
      columnName: 'related_card_id',
    },
    creatorUserId: {
      model: 'User',
      columnName: 'creator_user_id',
    },
  },

  tableName: 'card_relationship',
};
