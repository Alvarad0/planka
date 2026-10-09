/**
 * @swagger
 * /cards/{id}/knowledge-transfer-candidates:
 *   get:
 *     summary: Get users assignable to a card's knowledge transfer
 *     description: Retrieves every active user (public fields only), whether or not they are members of the card's board, so a board editor can pick who must learn what the card is about. Users already assigned are included; clients filter them out. Requires board editor permissions.
 *     tags:
 *       - Knowledge Transfers
 *     operationId: getCardKnowledgeTransferCandidates
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
 *     responses:
 *       200:
 *         description: Assignable users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - items
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KnowledgeTransferUser'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

const { idInput } = require('../../../utils/inputs');

const Errors = {
  NOT_ENOUGH_RIGHTS: {
    notEnoughRights: 'Not enough rights',
  },
  CARD_NOT_FOUND: {
    cardNotFound: 'Card not found',
  },
};

module.exports = {
  inputs: {
    id: {
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
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    await sails.helpers.knowledgeTransfers.getCardContext
      .with({
        currentUser,
        cardId: inputs.id,
        requireEditor: true,
      })
      .intercept('cardNotFound', () => Errors.CARD_NOT_FOUND)
      .intercept('notEnoughRights', () => Errors.NOT_ENOUGH_RIGHTS);

    // Deactivated users (the GitLab bot among them) cannot be assigned
    const users = await User.qm.getAll({
      isDeactivated: false,
    });

    return {
      items: sails.helpers.knowledgeTransfers.presentUsers(users, currentUser),
    };
  },
};
