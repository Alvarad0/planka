/**
 * @swagger
 * /cards/{id}/gitlab-link:
 *   post:
 *     summary: Link existing GitLab issue to a card
 *     description: Links an existing issue of the GitLab project linked to the card's project. An issue can be linked to only one card. Requires board editor permissions.
 *     tags:
 *       - GitLab Card Links
 *     operationId: linkCardGitlabIssue
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - issueIid
 *             properties:
 *               issueIid:
 *                 type: integer
 *                 minimum: 1
 *                 description: Project-scoped IID of the GitLab issue (a numeric string is also accepted)
 *                 example: 12
 *     responses:
 *       200:
 *         description: GitLab issue linked successfully
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
 *                   properties:
 *                     gitlabIssue:
 *                       $ref: '#/components/schemas/GitlabIssue'
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

// Upper bound of the integer column storing the IID
const MAX_ISSUE_IID = 2147483647;

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
  ISSUE_ALREADY_LINKED: {
    issueAlreadyLinked: 'GitLab issue is already linked to another card',
  },
};

module.exports = {
  inputs: {
    id: {
      ...idInput,
      required: true,
    },
    issueIid: {
      type: 'number',
      isInteger: true,
      min: 1,
      max: MAX_ISSUE_IID,
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
    issueAlreadyLinked: {
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

    const issueGitlabCardLink = await GitlabCardLink.qm.getOneByIntegrationIdAndIssueIid(
      gitlabIntegration.id,
      inputs.issueIid,
    );

    if (issueGitlabCardLink) {
      throw Errors.ISSUE_ALREADY_LINKED;
    }

    let gitlabIssue;
    try {
      const client = sails.helpers.gitlab.makeClient();

      gitlabIssue = await client.getIssue(gitlabIntegration.gitlabProjectId, inputs.issueIid);
    } catch (error) {
      throw mapGitlabError(error, {
        notFoundError: Errors.GITLAB_ISSUE_NOT_FOUND,
        projectId: project.id,
        integrationId: gitlabIntegration.id,
      });
    }

    let nextGitlabCardLink;
    try {
      nextGitlabCardLink = await sails.helpers.gitlabCardLinks.createOne.with({
        board,
        values: {
          cardId: card.id,
          gitlabIntegrationId: gitlabIntegration.id,
          issueId: gitlabIssue.id,
          issueIid: gitlabIssue.iid,
          issueUrl: gitlabIssue.webUrl,
          snapshot: _.pick(gitlabIssue, ['title', 'state', 'updatedAt']),
          lastSyncedAt: new Date().toISOString(),
        },
        request: this.req,
      });
    } catch (error) {
      if (error.code !== 'alreadyLinked') {
        throw error;
      }

      // Lost a race with a concurrent request: tell which side of the link was taken
      const cardGitlabCardLink = await GitlabCardLink.qm.getOneByCardId(card.id);

      throw cardGitlabCardLink ? Errors.CARD_ALREADY_LINKED : Errors.ISSUE_ALREADY_LINKED;
    }

    return {
      item: sails.helpers.gitlabCardLinks.presentOne(nextGitlabCardLink),
      included: {
        gitlabIssue,
      },
    };
  },
};
