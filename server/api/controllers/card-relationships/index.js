/**
 * @swagger
 * /cards/{id}/card-relationships:
 *   get:
 *     summary: Get relationships of a card
 *     description: Returns the relationships of a card seen from that card (`dependsOn`, `blocks`, `related`), the cards it is a subtask of (cards having a task linked to it) and how many of the cards it depends on are still open. Cards the current user cannot read are returned without any detail (`relatedCard` null, or only the `id` in `parentCards`). Requires read access to the card.
 *     tags:
 *       - Card Relationships
 *     operationId: getCardRelationships
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
 *         description: Relationships retrieved successfully
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
 *                     $ref: '#/components/schemas/CardRelationshipView'
 *                 included:
 *                   type: object
 *                   required:
 *                     - parentCards
 *                     - blockingOpenCount
 *                   properties:
 *                     parentCards:
 *                       type: array
 *                       description: Cards having a task linked to this card (read-only "subtask of"). Cards the current user cannot read contain only their `id`.
 *                       items:
 *                         oneOf:
 *                           - $ref: '#/components/schemas/CardRelationshipCardSummary'
 *                           - type: object
 *                             required:
 *                               - id
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: "1357158568008091268"
 *                     blockingOpenCount:
 *                       type: integer
 *                       description: Number of cards this card depends on that are not closed, including the ones the current user cannot read
 *                       example: 1
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

    const { card, project } = await sails.helpers.cards
      .getPathToProjectById(inputs.id)
      .intercept('pathNotFound', () => Errors.CARD_NOT_FOUND);

    // Same rule as cards/show.js
    if (currentUser.role !== User.Roles.ADMIN || project.ownerProjectManagerId) {
      const isProjectManager = await sails.helpers.users.isProjectManager(
        currentUser.id,
        project.id,
      );

      if (!isProjectManager) {
        const boardMembership = await BoardMembership.qm.getOneByBoardIdAndUserId(
          card.boardId,
          currentUser.id,
        );

        if (!boardMembership) {
          throw Errors.CARD_NOT_FOUND; // Forbidden
        }
      }
    }

    const cardRelationships = await CardRelationship.qm.getByCardId(card.id);

    // Derived "subtask of": cards with a task linked to this card
    const parentCardIds = await CardRelationship.qm.getParentCardIds(card.id);

    const relatedCardIds = cardRelationships.map((cardRelationship) =>
      cardRelationship.cardId === card.id
        ? cardRelationship.relatedCardId
        : cardRelationship.cardId,
    );

    const { cardsById, summariesById } =
      await sails.helpers.cardRelationships.getCardSummaries.with({
        currentUser,
        cardIds: [...relatedCardIds, ...parentCardIds],
      });

    const items = cardRelationships.map((cardRelationship) =>
      sails.helpers.cardRelationships.presentForCard.with({
        summariesById,
        record: cardRelationship,
        cardId: card.id,
      }),
    );

    const parentCards = parentCardIds
      .filter((id) => cardsById[id])
      .map((id) => summariesById[id] || { id });

    // Counted even for cards the user cannot read: the warning is the point of the relationship,
    // and a count discloses no names
    const blockingOpenCount = items.filter(
      (item) =>
        item.type === CardRelationship.ViewTypes.DEPENDS_ON &&
        cardsById[item.relatedCardId] &&
        !cardsById[item.relatedCardId].isClosed,
    ).length;

    return {
      items,
      included: {
        parentCards,
        blockingOpenCount,
      },
    };
  },
};
