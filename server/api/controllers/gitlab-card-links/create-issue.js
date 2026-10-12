/**
 * @swagger
 * /cards/{id}/gitlab-issue:
 *   post:
 *     summary: Create GitLab issue for a card
 *     description: Creates an issue in the GitLab project linked to the card's project, using the card name as title and the card description as description, and links it to the card. Requires board editor permissions.
 *     tags:
 *       - GitLab Card Links
 *     operationId: createCardGitlabIssue
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
 *         description: GitLab issue created and linked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *                 - included
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/GitlabCardLink'
 *                 included:
 *                   type: object
 *                   required:
 *                     - gitlabIssue
 *                     - suggestedBranchName
 *                     - defaultBranch
 *                   properties:
 *                     gitlabIssue:
 *                       $ref: '#/components/schemas/GitlabIssue'
 *                     suggestedBranchName:
 *                       type: string
 *                       description: Branch name suggested for the card (`<issue IID>-<slug of the card's "ID" custom field, or of the card name when it is missing or empty>`)
 *                       example: 12-implement-login
 *                     defaultBranch:
 *                       type: string
 *                       description: Default base branch of the project's GitLab integration
 *                       example: develop
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
const { GitlabErrors, gitlabExits, mapGitlabError } = require('../../../utils/gitlab-errors');
const { buildBranchName } = require('../../../utils/git-branch-name');
const { buildSnapshot } = require('../../../utils/gitlab-snapshot');

const Errors = {
  ...GitlabErrors,
  NOT_ENOUGH_RIGHTS: {
    notEnoughRights: 'Not enough rights',
  },
  CARD_NOT_FOUND: {
    cardNotFound: 'Card not found',
  },
  GITLAB_INTEGRATION_NOT_FOUND: {
    gitlabIntegrationNotFound: 'Project is not linked to GitLab',
  },
  CARD_ALREADY_LINKED: {
    cardAlreadyLinked: 'Card is already linked to a GitLab issue',
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
    notEnoughRights: {
      responseType: 'forbidden',
    },
    cardNotFound: {
      responseType: 'notFound',
    },
    gitlabIntegrationNotFound: {
      responseType: 'unprocessableEntity',
    },
    cardAlreadyLinked: {
      responseType: 'conflict',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const { card, board, project, gitlabIntegration, gitlabCardLink } =
      await sails.helpers.gitlabCardLinks.getCardContext
        .with({
          currentUser,
          cardId: inputs.id,
          requireEditor: true,
        })
        .intercept('cardNotFound', () => Errors.CARD_NOT_FOUND)
        .intercept('notEnoughRights', () => Errors.NOT_ENOUGH_RIGHTS);

    if (!gitlabIntegration) {
      throw Errors.GITLAB_INTEGRATION_NOT_FOUND;
    }

    if (gitlabCardLink) {
      throw Errors.CARD_ALREADY_LINKED;
    }

    let gitlabIssue;
    try {
      const client = sails.helpers.gitlab.makeClient();

      gitlabIssue = await client.createIssue(gitlabIntegration.gitlabProjectId, {
        title: card.name,
        description: card.description || undefined,
      });
    } catch (error) {
      throw mapGitlabError(error, {
        notFoundError: Errors.GITLAB_PROJECT_NOT_FOUND,
        projectId: project.id,
        integrationId: gitlabIntegration.id,
      });
    }

    const nextGitlabCardLink = await sails.helpers.gitlabCardLinks.createOne
      .with({
        board,
        values: {
          cardId: card.id,
          gitlabIntegrationId: gitlabIntegration.id,
          issueId: gitlabIssue.id,
          issueIid: gitlabIssue.iid,
          issueUrl: gitlabIssue.webUrl,
          snapshot: buildSnapshot({ issue: gitlabIssue }),
          lastSyncedAt: new Date().toISOString(),
        },
        request: this.req,
      })
      .intercept('alreadyLinked', () => {
        // Lost a race with a concurrent request; the new issue stays unlinked in GitLab
        sails.log.warn(
          `GitLab issue ${gitlabIssue.iid} was created but card ${card.id} was linked concurrently ` +
            `(integration: ${gitlabIntegration.id})`,
        );

        return Errors.CARD_ALREADY_LINKED;
      });

    return {
      item: sails.helpers.gitlabCardLinks.presentOne(nextGitlabCardLink),
      included: {
        gitlabIssue,
        suggestedBranchName: buildBranchName(
          gitlabIssue.iid,
          await sails.helpers.gitlabCardLinks.getBranchNameSource(card),
        ),
        defaultBranch: gitlabIntegration.defaultBranch,
      },
    };
  },
};
