/**
 * @swagger
 * /cards/{id}/knowledge-transfers:
 *   get:
 *     summary: Get knowledge transfers of a card
 *     description: Retrieves the users who must learn what the card is about, whether it was explained to them, and the users involved (assignees and explainers, public fields only). Requires read access to the card.
 *     tags:
 *       - Knowledge Transfers
 *     operationId: getCardKnowledgeTransfers
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
 *         description: Knowledge transfers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - items
 *                 - included
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CardKnowledgeTransfer'
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

const { idInput } = require('../../../utils/inputs');

const Errors = {
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
    cardNotFound: {
      responseType: 'notFound',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const { card } = await sails.helpers.knowledgeTransfers.getCardContext
      .with({
        currentUser,
        cardId: inputs.id,
      })
      .intercept('cardNotFound', () => Errors.CARD_NOT_FOUND);

    const knowledgeTransfers = await CardKnowledgeTransfer.qm.getByCardId(card.id);

    const userIds = _.uniq(
      _.compact(
        knowledgeTransfers.flatMap((knowledgeTransfer) => [
          knowledgeTransfer.userId,
          knowledgeTransfer.explainedByUserId,
        ]),
      ),
    );

    const users = userIds.length > 0 ? await User.qm.getByIds(userIds) : [];

    return {
      items: knowledgeTransfers.map((knowledgeTransfer) =>
        sails.helpers.knowledgeTransfers.presentOne(knowledgeTransfer),
      ),
      included: {
        users: sails.helpers.knowledgeTransfers.presentUsers(users, currentUser),
      },
    };
  },
};
