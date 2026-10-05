/**
 * @swagger
 * /cards/{id}/gitlab-link:
 *   delete:
 *     summary: Unlink GitLab issue from a card
 *     description: Removes the link between a card and its GitLab issue. The issue itself is left untouched in GitLab. Requires board editor permissions.
 *     tags:
 *       - GitLab Card Links
 *     operationId: unlinkCardGitlabIssue
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
 *         description: GitLab issue unlinked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/GitlabCardLink'
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
  GITLAB_CARD_LINK_NOT_FOUND: {
    gitlabCardLinkNotFound: 'GitLab card link not found',
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
    gitlabCardLinkNotFound: {
      responseType: 'notFound',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const { board, gitlabCardLink } = await sails.helpers.gitlabCardLinks.getCardContext
      .with({
        currentUser,
        cardId: inputs.id,
        requireEditor: true,
      })
      .intercept('cardNotFound', () => Errors.CARD_NOT_FOUND)
      .intercept('notEnoughRights', () => Errors.NOT_ENOUGH_RIGHTS);

    if (!gitlabCardLink) {
      throw Errors.GITLAB_CARD_LINK_NOT_FOUND;
    }

    const deletedGitlabCardLink = await sails.helpers.gitlabCardLinks.deleteOne.with({
      board,
      record: gitlabCardLink,
      request: this.req,
    });

    if (!deletedGitlabCardLink) {
      throw Errors.GITLAB_CARD_LINK_NOT_FOUND;
    }

    return {
      item: sails.helpers.gitlabCardLinks.presentOne(deletedGitlabCardLink),
    };
  },
};
