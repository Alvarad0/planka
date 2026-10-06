/**
 * @swagger
 * /gitlab-integrations/{id}/sync:
 *   post:
 *     summary: Synchronize GitLab integration
 *     description: Re-fetches the GitLab data of every card linked through a GitLab integration, stores it as each link's snapshot and broadcasts the updated links. A card that fails to synchronize does not stop the others; the counts tell how many succeeded and failed. The integration's last synchronization time is updated when at least one card succeeded. Requires project manager or admin privileges.
 *     tags:
 *       - GitLab Integrations
 *     operationId: syncGitlabIntegration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the GitLab integration to synchronize
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     responses:
 *       200:
 *         description: Synchronization finished
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *                 - included
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/GitlabIntegration'
 *                 included:
 *                   type: object
 *                   required:
 *                     - syncedCount
 *                     - failedCount
 *                   properties:
 *                     syncedCount:
 *                       type: integer
 *                       description: Number of linked cards synchronized successfully
 *                       example: 12
 *                     failedCount:
 *                       type: integer
 *                       description: Number of linked cards that could not be synchronized
 *                       example: 0
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

const { idInput } = require('../../../utils/inputs');
const { isGitlabFailure } = require('../../../utils/gitlab-errors');

// Parallel GitLab summaries; each one makes up to four GitLab calls
const CONCURRENCY = 4;

const Errors = {
  GITLAB_INTEGRATION_NOT_FOUND: {
    gitlabIntegrationNotFound: 'GitLab integration not found',
  },
};

// Runs `iteratee` over `items` with at most `concurrency` calls in flight
const mapWithConcurrency = async (items, concurrency, iteratee) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      // eslint-disable-next-line no-await-in-loop
      results[index] = await iteratee(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

  return results;
};

module.exports = {
  inputs: {
    id: {
      ...idInput,
      required: true,
    },
  },

  exits: {
    gitlabIntegrationNotFound: {
      responseType: 'notFound',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    let { gitlabIntegration } = await sails.helpers.gitlabIntegrations
      .getPathToProjectById(inputs.id)
      .intercept('pathNotFound', () => Errors.GITLAB_INTEGRATION_NOT_FOUND);

    if (currentUser.role !== User.Roles.ADMIN) {
      const isProjectManager = await sails.helpers.users.isProjectManager(
        currentUser.id,
        gitlabIntegration.projectId,
      );

      if (!isProjectManager) {
        throw Errors.GITLAB_INTEGRATION_NOT_FOUND; // Forbidden
      }
    }

    const gitlabCardLinks = await GitlabCardLink.qm.getByIntegrationId(gitlabIntegration.id);

    const results = await mapWithConcurrency(
      gitlabCardLinks,
      CONCURRENCY,
      async (gitlabCardLink) => {
        try {
          await sails.helpers.gitlabCardLinks.syncOne.with({
            record: gitlabCardLink,
            request: this.req,
          });

          return true;
        } catch (error) {
          if (!isGitlabFailure(error)) {
            sails.log.error(
              `GitLab sync of card link ${gitlabCardLink.id} crashed: ${error && error.stack}`,
            );
          } else {
            sails.log.warn(
              `GitLab sync of card link failed (code: ${error.code}, ` +
                `status: ${error.status || 'none'}, card: ${gitlabCardLink.cardId}, ` +
                `integration: ${gitlabIntegration.id})`,
            );
          }

          return false;
        }
      },
    );

    // A link removed or changed meanwhile counts as synced: there was nothing left to repair
    const syncedCount = results.filter(Boolean).length;
    const failedCount = results.length - syncedCount;

    if (syncedCount > 0) {
      gitlabIntegration = await GitlabIntegration.qm.updateOne(gitlabIntegration.id, {
        lastSyncedAt: new Date().toISOString(),
      });

      if (!gitlabIntegration) {
        throw Errors.GITLAB_INTEGRATION_NOT_FOUND;
      }
    }

    return {
      item: sails.helpers.gitlabIntegrations.presentOne(gitlabIntegration),
      included: {
        syncedCount,
        failedCount,
      },
    };
  },
};
