/**
 * @swagger
 * /knowledge-transfers/{id}:
 *   delete:
 *     summary: Remove a user from a card's knowledge transfer
 *     description: Removes a user from the people who must learn what the card is about. Explained transfers are locked: only admins can remove them; others get 422 `Knowledge transfer is already explained`. Requires board editor permissions on the card's board, admins included.
 *     tags:
 *       - Knowledge Transfers
 *     operationId: deleteCardKnowledgeTransfer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the knowledge transfer
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     responses:
 *       200:
 *         description: User removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/CardKnowledgeTransfer'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/UnprocessableEntity'
 */

const { idInput } = require('../../../utils/inputs');

const Errors = {
  NOT_ENOUGH_RIGHTS: {
    notEnoughRights: 'Not enough rights',
  },
  KNOWLEDGE_TRANSFER_NOT_FOUND: {
    knowledgeTransferNotFound: 'Knowledge transfer not found',
  },
  KNOWLEDGE_TRANSFER_IS_LOCKED: {
    knowledgeTransferIsLocked: 'Knowledge transfer is already explained',
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
    knowledgeTransferNotFound: {
      responseType: 'notFound',
    },
    knowledgeTransferIsLocked: {
      responseType: 'unprocessableEntity',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const knowledgeTransfer = await CardKnowledgeTransfer.qm.getOneById(inputs.id);

    if (!knowledgeTransfer) {
      throw Errors.KNOWLEDGE_TRANSFER_NOT_FOUND;
    }

    const { board } = await sails.helpers.knowledgeTransfers.getCardContext
      .with({
        currentUser,
        cardId: knowledgeTransfer.cardId,
        requireEditor: true,
      })
      .intercept('cardNotFound', () => Errors.KNOWLEDGE_TRANSFER_NOT_FOUND)
      .intercept('notEnoughRights', () => Errors.NOT_ENOUGH_RIGHTS);

    // Explained items are locked: only admins may undo or remove them. Checked after the card
    // access rule, so the lock never discloses an item to non-members.
    if (knowledgeTransfer.isExplained && currentUser.role !== User.Roles.ADMIN) {
      throw Errors.KNOWLEDGE_TRANSFER_IS_LOCKED;
    }

    const deletedKnowledgeTransfer = await sails.helpers.knowledgeTransfers.deleteOne.with({
      board,
      record: knowledgeTransfer,
      request: this.req,
    });

    if (!deletedKnowledgeTransfer) {
      throw Errors.KNOWLEDGE_TRANSFER_NOT_FOUND;
    }

    return {
      item: sails.helpers.knowledgeTransfers.presentOne(deletedKnowledgeTransfer),
    };
  },
};
