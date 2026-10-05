/**
 * @swagger
 * /cards/{id}/gitlab-commits:
 *   get:
 *     summary: Get GitLab commits of a card
 *     description: Returns the commits of the card's branch that are not in the default branch of the link's GitLab integration, newest first (at most 50). Cards without a link or a branch, and branches that no longer exist in GitLab, have no commits. Requires read access to the card.
 *     tags:
 *       - GitLab Card Links
 *     operationId: getCardGitlabCommits
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
 *         description: GitLab commits of the card retrieved successfully
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
 *                     $ref: '#/components/schemas/GitlabCommit'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/UnprocessableEntity'
 */

const { idInput } = require('../../../utils/inputs');
const { ErrorCodes } = require('../../../utils/gitlab-client');
const { GitlabErrors, gitlabExits, mapGitlabError } = require('../../../utils/gitlab-errors');

const MAX_COMMITS = 50;

const Errors = {
  ...GitlabErrors,
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
    ...gitlabExits,
    cardNotFound: {
      responseType: 'notFound',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const { project, gitlabIntegration, gitlabCardLink } =
      await sails.helpers.gitlabCardLinks.getCardContext
        .with({
          currentUser,
          cardId: inputs.id,
        })
        .intercept('cardNotFound', () => Errors.CARD_NOT_FOUND);

    if (!gitlabCardLink || !gitlabCardLink.branchName) {
      return {
        items: [],
      };
    }

    const linkIntegrationId = gitlabCardLink.gitlabIntegrationId;

    let commits;
    try {
      // The branch lives in the GitLab project of the link's integration, which differs from the
      // current one when the card was moved to another project
      const linkIntegration =
        gitlabIntegration && gitlabIntegration.id === linkIntegrationId
          ? gitlabIntegration
          : await GitlabIntegration.qm.getOneById(linkIntegrationId);

      // Foreign keys cascade, so a missing integration is not expected
      if (!linkIntegration) {
        return {
          items: [],
        };
      }

      const client = sails.helpers.gitlab.makeClient();

      commits = await client.listCommits(linkIntegration.gitlabProjectId, {
        from: linkIntegration.defaultBranch,
        to: gitlabCardLink.branchName,
        limit: MAX_COMMITS,
      });
    } catch (error) {
      // The branch was deleted in GitLab (e.g. after merging); GitLab may also answer with an
      // empty list
      if (error.code === ErrorCodes.NOT_FOUND) {
        return {
          items: [],
        };
      }

      throw mapGitlabError(error, {
        projectId: project.id,
        integrationId: linkIntegrationId,
      });
    }

    return {
      items: commits,
    };
  },
};
