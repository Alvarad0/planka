/**
 * @swagger
 * /card-relationships/{id}:
 *   delete:
 *     summary: Delete a card relationship
 *     description: Removes a relationship between two cards. Requires board editor permissions on the board of either card, since removing a relationship discloses nothing about the other card.
 *     tags:
 *       - Card Relationships
 *     operationId: deleteCardRelationship
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the relationship
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     responses:
 *       200:
 *         description: Relationship deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/CardRelationship'
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
  CARD_RELATIONSHIP_NOT_FOUND: {
    cardRelationshipNotFound: 'Card relationship not found',
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
    cardRelationshipNotFound: {
      responseType: 'notFound',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const cardRelationship = await CardRelationship.qm.getOneById(inputs.id);

    if (!cardRelationship) {
      throw Errors.CARD_RELATIONSHIP_NOT_FOUND;
    }

    const cards = await Card.qm.getByIds([cardRelationship.cardId, cardRelationship.relatedCardId]);

    const boardIds = sails.helpers.utils.mapRecords(cards, 'boardId', true);

    const boardMemberships = await BoardMembership.qm.getByBoardIdsAndUserId(
      boardIds,
      currentUser.id,
    );

    // Same rule as cards/update.js (board membership), on either board
    if (boardMemberships.length === 0) {
      throw Errors.CARD_RELATIONSHIP_NOT_FOUND; // Forbidden
    }

    const isEditor = boardMemberships.some(
      (boardMembership) => boardMembership.role === BoardMembership.Roles.EDITOR,
    );

    if (!isEditor) {
      throw Errors.NOT_ENOUGH_RIGHTS;
    }

    const deletedCardRelationship = await sails.helpers.cardRelationships.deleteOne.with({
      boardIds,
      record: cardRelationship,
      request: this.req,
    });

    if (!deletedCardRelationship) {
      throw Errors.CARD_RELATIONSHIP_NOT_FOUND;
    }

    return {
      item: _.pick(deletedCardRelationship, ['id', 'cardId', 'relatedCardId', 'type']),
    };
  },
};
