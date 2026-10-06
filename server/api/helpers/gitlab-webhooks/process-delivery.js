// Processes an accepted GitLab webhook delivery, after the response was sent.
//
// The event only tells which card links may have changed; each of them is re-synchronized from
// GitLab (coalesced per link), never patched from the payload. The outcome is stored on the
// delivery: `ignored` when the event concerns no card, `failed` when a sync failed (the periodic
// sync repairs it later), `processed` otherwise. It never throws.

const { isGitlabFailure } = require('../../../utils/gitlab-errors');
const { resolveEventTarget } = require('../../../utils/gitlab-webhook-events');

const MAX_ERROR_LENGTH = 255;

// Only safe metadata: GitLab error messages are fixed strings and statuses are numbers, so
// neither tokens nor response bodies end up in the delivery or the logs
const describeError = (error) => {
  if (isGitlabFailure(error)) {
    return `GitLab sync failed (code: ${error.code}, status: ${error.status || 'none'})`;
  }

  return 'Internal error';
};

const findLinks = async (gitlabIntegrationId, target) => {
  const gitlabCardLink = target.branchName
    ? await GitlabCardLink.qm.getOneByIntegrationIdAndBranchName(
        gitlabIntegrationId,
        target.branchName,
      )
    : await GitlabCardLink.qm.getOneByIntegrationIdAndIssueIid(
        gitlabIntegrationId,
        target.issueIid,
      );

  return gitlabCardLink ? [gitlabCardLink] : [];
};

const processDelivery = async ({ delivery, payload }) => {
  const target = resolveEventTarget(delivery.eventType, payload);

  if (!target) {
    return {
      status: GitlabWebhookDelivery.Statuses.IGNORED,
    };
  }

  const gitlabCardLinks = await findLinks(delivery.gitlabIntegrationId, target);

  if (gitlabCardLinks.length === 0) {
    return {
      status: GitlabWebhookDelivery.Statuses.IGNORED,
    };
  }

  const results = await Promise.allSettled(
    gitlabCardLinks.map((gitlabCardLink) =>
      sails.helpers.gitlabCardLinks.requestSync.with({
        id: gitlabCardLink.id,
      }),
    ),
  );

  const rejection = results.find(({ status }) => status === 'rejected');

  if (rejection) {
    throw rejection.reason;
  }

  return {
    status: GitlabWebhookDelivery.Statuses.PROCESSED,
  };
};

module.exports = {
  inputs: {
    delivery: {
      type: 'ref',
      required: true,
    },
    payload: {
      type: 'ref',
    },
  },

  async fn(inputs) {
    const { delivery } = inputs;

    let values;
    try {
      values = await processDelivery(inputs);
    } catch (error) {
      const description = describeError(error);

      if (isGitlabFailure(error)) {
        sails.log.warn(
          `GitLab webhook processing failed: ${description} ` +
            `(delivery: ${delivery.id}, integration: ${delivery.gitlabIntegrationId})`,
        );
      } else {
        sails.log.error(
          `GitLab webhook processing failed (delivery: ${delivery.id}, ` +
            `integration: ${delivery.gitlabIntegrationId}): ${error && error.stack}`,
        );
      }

      values = {
        status: GitlabWebhookDelivery.Statuses.FAILED,
        error: description.slice(0, MAX_ERROR_LENGTH),
      };
    }

    try {
      // The integration (and its deliveries) may have been removed meanwhile
      await GitlabWebhookDelivery.qm.updateOne(delivery.id, values);
    } catch (error) {
      sails.log.error(
        `GitLab webhook delivery could not be updated (delivery: ${delivery.id}): ${error.stack}`,
      );
    }

    return values.status;
  },
};
