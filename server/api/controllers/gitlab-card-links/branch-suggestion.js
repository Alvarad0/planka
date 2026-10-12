/**
 * @swagger
 * /cards/{id}/gitlab-branch-suggestion:
 *   get:
 *     summary: Get suggested GitLab branch for a card
 *     description: Returns the current prefilled values of the "Create branch" form, without calling GitLab. The name is `<issue IID>-<slug of the card's "ID" custom field, or of the card name when it is missing or empty>`, or null when the card already has a branch; the base branch is the default branch of the project's GitLab integration. Requires board editor permissions.
 *     tags:
 *       - GitLab Card Links
 *     operationId: getCardGitlabBranchSuggestion
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
 *         description: Branch suggestion retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *               properties:
 *                 item:
 *                   type: object
 *                   required:
 *                     - suggestedBranchName
 *                     - defaultBranch
 *                   properties:
 *                     suggestedBranchName:
 *                       type: string
 *                       nullable: true
 *                       description: Branch name suggested for the card, null when the card already has a branch
 *                       example: 12-dev-00065
 *                     defaultBranch:
 *                       type: string
 *                       description: Default branch of the project's GitLab integration
 *                       example: main
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
const { buildBranchName } = require('../../../utils/git-branch-name');

const Errors = {
  NOT_ENOUGH_RIGHTS: {
    notEnoughRights: 'Not enough rights',
  },
  CARD_NOT_FOUND: {
    cardNotFound: 'Card not found',
  },
  CARD_IS_NOT_LINKED_TO_GITLAB_ISSUE: {
    cardIsNotLinkedToGitlabIssue: 'Card is not linked to a GitLab issue',
  },
  CARD_WAS_MOVED_TO_ANOTHER_PROJECT: {
    cardWasMovedToAnotherProject: 'Card was moved to a project linked to another GitLab project',
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
    cardIsNotLinkedToGitlabIssue: {
      responseType: 'unprocessableEntity',
    },
    cardWasMovedToAnotherProject: {
      responseType: 'unprocessableEntity',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    // Same access and checks as create-branch, so the suggestion is offered only where it applies
    const { card, gitlabIntegration, gitlabCardLink } =
      await sails.helpers.gitlabCardLinks.getCardContext
        .with({
          currentUser,
          cardId: inputs.id,
          requireEditor: true,
        })
        .intercept('cardNotFound', () => Errors.CARD_NOT_FOUND)
        .intercept('notEnoughRights', () => Errors.NOT_ENOUGH_RIGHTS);

    if (!gitlabCardLink) {
      throw Errors.CARD_IS_NOT_LINKED_TO_GITLAB_ISSUE;
    }

    // The link's integration is the current one, so its default branch is the current one too
    if (!gitlabIntegration || gitlabCardLink.gitlabIntegrationId !== gitlabIntegration.id) {
      throw Errors.CARD_WAS_MOVED_TO_ANOTHER_PROJECT;
    }

    const suggestedBranchName = gitlabCardLink.branchName
      ? null
      : buildBranchName(
          gitlabCardLink.issueIid,
          await sails.helpers.gitlabCardLinks.getBranchNameSource(card),
        );

    return {
      item: {
        suggestedBranchName,
        defaultBranch: gitlabIntegration.defaultBranch,
      },
    };
  },
};
