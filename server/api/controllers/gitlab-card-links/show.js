/**
 * @swagger
 * /cards/{id}/gitlab:
 *   get:
 *     summary: Get GitLab data of a card
 *     description: Returns the GitLab issue linked to a card and, when the card has a branch, its merge request, latest pipeline and number of commits ahead of the default branch. Data is fetched live from GitLab; if any GitLab call fails, everything is returned from the last stored snapshot with `isStale` set, so the card always opens. Requires read access to the card.
 *     tags:
 *       - GitLab Card Links
 *     operationId: getCardGitlab
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
 *         description: GitLab data of the card retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *                 - included
 *               properties:
 *                 item:
 *                   allOf:
 *                     - $ref: '#/components/schemas/GitlabCardLink'
 *                   nullable: true
 *                 included:
 *                   type: object
 *                   required:
 *                     - gitlabIntegration
 *                     - gitlabIssue
 *                     - gitlabMergeRequest
 *                     - gitlabPipeline
 *                     - commitsCount
 *                     - hasMoreCommits
 *                     - isStale
 *                     - isProjectMismatch
 *                     - suggestedBranchName
 *                     - defaultBranch
 *                   properties:
 *                     gitlabIntegration:
 *                       type: object
 *                       nullable: true
 *                       description: GitLab integration of the card's current project
 *                       properties:
 *                         id:
 *                           type: string
 *                           example: "1357158568008091266"
 *                         gitlabProjectPath:
 *                           type: string
 *                           example: group/project
 *                     gitlabIssue:
 *                       allOf:
 *                         - $ref: '#/components/schemas/GitlabIssue'
 *                       nullable: true
 *                     gitlabMergeRequest:
 *                       allOf:
 *                         - $ref: '#/components/schemas/GitlabMergeRequest'
 *                       nullable: true
 *                       description: Newest open merge request of the card's branch, else its newest merged one
 *                     gitlabPipeline:
 *                       allOf:
 *                         - $ref: '#/components/schemas/GitlabPipeline'
 *                       nullable: true
 *                       description: Latest pipeline of the card's branch
 *                     commitsCount:
 *                       type: integer
 *                       nullable: true
 *                       maximum: 100
 *                       description: Number of commits of the card's branch ahead of the default branch, counted up to 100; null without a branch, once its merge request is merged, or when the branch no longer exists
 *                       example: 3
 *                     hasMoreCommits:
 *                       type: boolean
 *                       description: Whether the branch has more commits than `commitsCount` (which then is 100)
 *                       example: false
 *                     isStale:
 *                       type: boolean
 *                       description: Whether the GitLab data comes from the stored snapshot because GitLab could not be reached
 *                       example: false
 *                     isProjectMismatch:
 *                       type: boolean
 *                       description: Whether the link belongs to an integration other than the one of the card's current project (e.g. the card was moved)
 *                       example: false
 *                     suggestedBranchName:
 *                       type: string
 *                       nullable: true
 *                       description: Branch name suggested for the card (`<issue IID>-<slug of the card name>`), set only when the card is linked and has no branch yet
 *                       example: 12-implement-login
 *                     defaultBranch:
 *                       type: string
 *                       nullable: true
 *                       description: Default base branch of the GitLab integration of the card's current project
 *                       example: develop
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

const { idInput } = require('../../../utils/inputs');
const { isGitlabFailure } = require('../../../utils/gitlab-errors');
const { buildBranchName } = require('../../../utils/git-branch-name');
const { fetchSummary } = require('../../../utils/gitlab-summary');
const {
  buildSnapshot,
  readSnapshot,
  buildIssueFromSnapshot,
} = require('../../../utils/gitlab-snapshot');

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

    const { card, gitlabIntegration, gitlabCardLink } =
      await sails.helpers.gitlabCardLinks.getCardContext
        .with({
          currentUser,
          cardId: inputs.id,
        })
        .intercept('cardNotFound', () => Errors.CARD_NOT_FOUND);

    const included = {
      gitlabIntegration: gitlabIntegration
        ? _.pick(gitlabIntegration, ['id', 'gitlabProjectPath'])
        : null,
      gitlabIssue: null,
      gitlabMergeRequest: null,
      gitlabPipeline: null,
      commitsCount: null,
      hasMoreCommits: false,
      isStale: false,
      isProjectMismatch: false,
      suggestedBranchName: null,
      defaultBranch: gitlabIntegration ? gitlabIntegration.defaultBranch : null,
    };

    if (!gitlabCardLink) {
      return {
        item: null,
        included,
      };
    }

    const currentIntegrationId = gitlabIntegration ? gitlabIntegration.id : null;
    included.isProjectMismatch = gitlabCardLink.gitlabIntegrationId !== currentIntegrationId;

    if (!gitlabCardLink.branchName) {
      included.suggestedBranchName = buildBranchName(gitlabCardLink.issueIid, card.name);
    }

    let nextGitlabCardLink = gitlabCardLink;
    let summary;
    try {
      // The issue lives in the GitLab project of the link's integration, which differs from the
      // current one when the card was moved to another project
      const linkIntegration = included.isProjectMismatch
        ? await GitlabIntegration.qm.getOneById(gitlabCardLink.gitlabIntegrationId)
        : gitlabIntegration;

      // Foreign keys cascade, so a missing integration is not expected; it is reported as stale
      if (linkIntegration) {
        const client = sails.helpers.gitlab.makeClient();

        summary = await fetchSummary(client, linkIntegration, gitlabCardLink);
      }
    } catch (error) {
      // Failure isolation: GitLab problems must never prevent the card from opening
      if (!isGitlabFailure(error)) {
        throw error;
      }

      sails.log.warn(
        `GitLab card refresh failed (code: ${error.code}, status: ${error.status || 'none'}, ` +
          `card: ${card.id}, integration: ${gitlabCardLink.gitlabIntegrationId})`,
      );
    }

    if (summary) {
      const updatedGitlabCardLink = await GitlabCardLink.qm.updateOne(gitlabCardLink.id, {
        snapshot: buildSnapshot(summary),
        lastSyncedAt: new Date().toISOString(),
      });

      // The link may have been removed concurrently; still answer with what was read
      if (updatedGitlabCardLink) {
        nextGitlabCardLink = updatedGitlabCardLink;
      }

      Object.assign(included, {
        gitlabIssue: summary.issue,
        gitlabMergeRequest: summary.mergeRequest,
        gitlabPipeline: summary.pipeline,
        commitsCount: summary.commitsCount,
        hasMoreCommits: summary.hasMoreCommits,
      });
    } else {
      const snapshot = readSnapshot(gitlabCardLink.snapshot);

      Object.assign(included, {
        gitlabIssue: buildIssueFromSnapshot(gitlabCardLink),
        gitlabMergeRequest: snapshot.mergeRequest,
        gitlabPipeline: snapshot.pipeline,
        commitsCount: snapshot.commitsCount,
        hasMoreCommits: snapshot.hasMoreCommits,
        isStale: true,
      });
    }

    return {
      item: sails.helpers.gitlabCardLinks.presentOne(nextGitlabCardLink),
      included,
    };
  },
};
