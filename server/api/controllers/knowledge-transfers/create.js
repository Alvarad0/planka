/**
 * @swagger
 * /cards/{id}/knowledge-transfers:
 *   post:
 *     summary: Add a user to a card's knowledge transfer
 *     description: Records that a user must learn what the card is about. Any active user can be added, not only board members; a user can be added once per card. Requires board editor permissions.
 *     tags:
 *       - Knowledge Transfers
 *     operationId: createCardKnowledgeTransfer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the card
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 description: ID of the user who must learn it
 *                 example: "1357158568008091265"
 *     responses:
 *       200:
 *         description: User added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *                 - included
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/CardKnowledgeTransfer'
 *                 included:
 *                   type: object
 *                   required:
 *                     - users
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/KnowledgeTransferUser'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       422:
 *         $ref: '#/components/responses/UnprocessableEntity'
 */

const { idInput } = require('../../../utils/inputs');

const Errors = {
  NOT_ENOUGH_RIGHTS: {
    notEnoughRights: 'Not enough rights',
  },
  CARD_NOT_FOUND: {
    cardNotFound: 'Card not found',
  },
  USER_NOT_FOUND: {
    userNotFound: 'User not found',
  },
  USER_DEACTIVATED: {
    userDeactivated: 'User deactivated',
  },
  USER_ALREADY_ASSIGNED: {
    userAlreadyAssigned: 'User already assigned',
  },
};

module.exports = {
  inputs: {
    id: {
      ...idInput,
      required: true,
    },
    userId: {
      ...idInput,
      required: true,
    },
  },

  exits: {
    notEnoughRights: {
      responseType: 'forbidden',
    },
    cardNotFound: {
      responseType: 'notFound',
    },
    userNotFound: {
      responseType: 'notFound',
    },
    userDeactivated: {
      responseType: 'unprocessableEntity',
    },
    userAlreadyAssigned: {
      responseType: 'conflict',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const { card, board } = await sails.helpers.knowledgeTransfers.getCardContext
      .with({
        currentUser,
        cardId: inputs.id,
        requireEditor: true,
      })
      .intercept('cardNotFound', () => Errors.CARD_NOT_FOUND)
      .intercept('notEnoughRights', () => Errors.NOT_ENOUGH_RIGHTS);

    const user = await User.qm.getOneById(inputs.userId);

    if (!user) {
      throw Errors.USER_NOT_FOUND;
    }

    if (user.isDeactivated) {
      throw Errors.USER_DEACTIVATED;
    }

    const knowledgeTransfer = await sails.helpers.knowledgeTransfers.createOne
      .with({
        board,
        values: {
          card,
          user,
        },
        actorUser: currentUser,
        request: this.req,
      })
      .intercept('userAlreadyAssigned', () => Errors.USER_ALREADY_ASSIGNED);

    return {
      item: sails.helpers.knowledgeTransfers.presentOne(knowledgeTransfer),
      included: {
        users: sails.helpers.knowledgeTransfers.presentUsers([user], currentUser),
      },
    };
  },
};
