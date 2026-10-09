/**
 * @swagger
 * /knowledge-transfers/{id}:
 *   patch:
 *     summary: Mark a knowledge transfer as explained or not
 *     description: Ticks or unticks "explained". When ticked, the current user and time are stored as who explained it and when (an already explained transfer keeps its explainer). Explained transfers are locked: only admins can untick them, which clears both; others get 422 `Knowledge transfer is already explained`. Requires board editor permissions on the card's board, admins included.
 *     tags:
 *       - Knowledge Transfers
 *     operationId: updateCardKnowledgeTransfer
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isExplained
 *             properties:
 *               isExplained:
 *                 type: boolean
 *                 description: Whether it was explained to the user
 *                 example: true
 *     responses:
 *       200:
 *         description: Knowledge transfer updated successfully
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
 *                       description: The user who explained it, when explained
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
    isExplained: {
      type: 'boolean',
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

    // Resolved from the card, so the card's current board is used after the card was moved
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
    if (
      knowledgeTransfer.isExplained &&
      !inputs.isExplained &&
      currentUser.role !== User.Roles.ADMIN
    ) {
      throw Errors.KNOWLEDGE_TRANSFER_IS_LOCKED;
    }

    const updatedKnowledgeTransfer = await sails.helpers.knowledgeTransfers.updateOne.with({
      board,
      record: knowledgeTransfer,
      isExplained: inputs.isExplained,
      actorUser: currentUser,
      request: this.req,
    });

    if (!updatedKnowledgeTransfer) {
      throw Errors.KNOWLEDGE_TRANSFER_NOT_FOUND;
    }

    const explainedByUser =
      updatedKnowledgeTransfer.explainedByUserId &&
      (await User.qm.getOneById(updatedKnowledgeTransfer.explainedByUserId));

    return {
      item: sails.helpers.knowledgeTransfers.presentOne(updatedKnowledgeTransfer),
      included: {
        users: explainedByUser
          ? sails.helpers.knowledgeTransfers.presentUsers([explainedByUser], currentUser)
          : [],
      },
    };
  },
};
