/**
 * @swagger
 * /cards/{cardId}/card-relationships:
 *   post:
 *     summary: Relate two cards
 *     description: Creates a dependency or "related" relationship between a card and another card of the same project. The type is given from the perspective of the card in the path (`dependsOn`, `blocks` or `related`) and stored in canonical form, so the relationship is visible from both cards. A dependency that would close a cycle is rejected. Requires board editor permissions on the boards of both cards.
 *     tags:
 *       - Card Relationships
 *     operationId: createCardRelationship
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: cardId
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
 *               - relatedCardId
 *               - type
 *             properties:
 *               relatedCardId:
 *                 type: string
 *                 description: ID of the other card
 *                 example: "1357158568008091265"
 *               type:
 *                 type: string
 *                 enum: [dependsOn, blocks, related]
 *                 description: Relationship type from the perspective of the card in the path (`blocks` means the other card depends on this one)
 *                 example: dependsOn
 *     responses:
 *       200:
 *         description: Relationship created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/CardRelationshipView'
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
  RELATED_CARD_NOT_FOUND: {
    relatedCardNotFound: 'Related card not found',
  },
  CARD_CANNOT_BE_RELATED_TO_ITSELF: {
    cardCannotBeRelatedToItself: 'Card cannot be related to itself',
  },
  CARDS_MUST_BELONG_TO_SAME_PROJECT: {
    cardsMustBelongToSameProject: 'Cards must belong to the same project',
  },
  WOULD_CREATE_DEPENDENCY_CYCLE: {
    wouldCreateDependencyCycle: 'Would create dependency cycle',
  },
  CARD_RELATIONSHIP_ALREADY_EXISTS: {
    cardRelationshipAlreadyExists: 'Card relationship already exists',
  },
};

module.exports = {
  inputs: {
    cardId: {
      ...idInput,
      required: true,
    },
    relatedCardId: {
      ...idInput,
      required: true,
    },
    type: {
      type: 'string',
      isIn: Object.values(CardRelationship.ViewTypes),
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
    relatedCardNotFound: {
      responseType: 'notFound',
    },
    cardCannotBeRelatedToItself: {
      responseType: 'unprocessableEntity',
    },
    cardsMustBelongToSameProject: {
      responseType: 'unprocessableEntity',
    },
    wouldCreateDependencyCycle: {
      responseType: 'unprocessableEntity',
    },
    cardRelationshipAlreadyExists: {
      responseType: 'conflict',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    // Same rule as cards/update.js: board membership with the editor role, on both boards
    const getEditableCardPath = async (cardId, notFoundError) => {
      const pathToProject = await sails.helpers.cards
        .getPathToProjectById(cardId)
        .intercept('pathNotFound', () => notFoundError);

      const boardMembership = await BoardMembership.qm.getOneByBoardIdAndUserId(
        pathToProject.board.id,
        currentUser.id,
      );

      if (!boardMembership) {
        throw notFoundError; // Forbidden
      }

      if (boardMembership.role !== BoardMembership.Roles.EDITOR) {
        throw Errors.NOT_ENOUGH_RIGHTS;
      }

      return pathToProject;
    };

    const { card, project } = await getEditableCardPath(inputs.cardId, Errors.CARD_NOT_FOUND);

    if (inputs.relatedCardId === card.id) {
      throw Errors.CARD_CANNOT_BE_RELATED_TO_ITSELF;
    }

    const { card: relatedCard, project: relatedProject } = await getEditableCardPath(
      inputs.relatedCardId,
      Errors.RELATED_CARD_NOT_FOUND,
    );

    if (relatedProject.id !== project.id) {
      throw Errors.CARDS_MUST_BELONG_TO_SAME_PROJECT;
    }

    const cardRelationship = await sails.helpers.cardRelationships.createOne
      .with({
        values: {
          card,
          relatedCard,
          viewType: inputs.type,
        },
        actorUser: currentUser,
        request: this.req,
      })
      .intercept('cardRelationshipAlreadyExists', () => Errors.CARD_RELATIONSHIP_ALREADY_EXISTS)
      .intercept('wouldCreateDependencyCycle', () => Errors.WOULD_CREATE_DEPENDENCY_CYCLE)
      .intercept('cardNotFound', () => Errors.CARD_NOT_FOUND);

    const { summariesById } = await sails.helpers.cardRelationships.getCardSummaries.with({
      currentUser,
      cardIds: [relatedCard.id],
    });

    return {
      item: sails.helpers.cardRelationships.presentForCard.with({
        summariesById,
        record: cardRelationship,
        cardId: card.id,
      }),
    };
  },
};
