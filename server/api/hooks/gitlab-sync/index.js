/**
 * gitlab-sync hook
 *
 * @description :: GitLab Bridge periodic sync. Every GITLAB_SYNC_INTERVAL minutes it re-syncs the
 *                 card links that were not synced for that long (repairing missed or failed
 *                 webhooks) and prunes old webhook deliveries.
 * @docs        :: https://sailsjs.com/docs/concepts/extending-sails/hooks
 */

const { ErrorCodes } = require('../../../utils/gitlab-client');
const { isGitlabFailure } = require('../../../utils/gitlab-errors');

// Fixed key of the Postgres advisory lock that lets only one Planka process run a tick
const ADVISORY_LOCK_KEY = '7203418265093471';

// Links synced per tick; the rest are picked by the next ticks (least recently attempted first)
const LINKS_LIMIT = 50;

// Parallel link syncs; each one makes up to four GitLab calls
const CONCURRENCY = 4;

// Consecutive failures that mean GitLab itself (or the token) is down, not a single link.
// UNAVAILABLE covers 5xx answers, timeouts, unreachable hosts and invalid responses.
const OUTAGE_THRESHOLD = 3;
const OUTAGE_CODES = new Set([
  ErrorCodes.UNAVAILABLE,
  ErrorCodes.UNAUTHORIZED,
  'gitlabNotConfigured',
]);

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

module.exports = function defineGitlabSyncHook(sails) {
  let timeout = null;
  let isStopped = true;

  const isEnabled = () => {
    const { gitlabUrl, gitlabToken, gitlabSyncInterval } = sails.config.custom;

    return !!gitlabUrl && !!gitlabToken && gitlabSyncInterval > 0;
  };

  const syncLinkById = (id) =>
    sails.helpers.gitlabCardLinks.requestSync.with({
      id,
    });

  // Syncs `links` with bounded concurrency. Per-link failures are logged and counted, never
  // thrown; after OUTAGE_THRESHOLD consecutive outage failures no further link is started.
  const syncLinks = async (links, syncLink, summary) => {
    const syncedIntegrationIds = new Set();

    let nextIndex = 0;
    let consecutiveOutages = 0;
    let isTripped = false;

    const worker = async () => {
      while (!isTripped && nextIndex < links.length) {
        const link = links[nextIndex];
        nextIndex += 1;

        try {
          // Recorded before the sync, so it counts for successes and failures alike: a link that
          // keeps failing moves to the back of the queue (lastSyncedAt still means "last fresh")
          // eslint-disable-next-line no-await-in-loop
          await GitlabCardLink.qm.updateOne(link.id, {
            lastSyncAttemptedAt: new Date().toISOString(),
          });

          // eslint-disable-next-line no-await-in-loop
          const result = await syncLink(link.id);

          consecutiveOutages = 0;
          summary.synced += 1; // eslint-disable-line no-param-reassign

          // A link removed or changed meanwhile counts as synced (nothing left to repair), but
          // only a stored snapshot marks its integration as synced
          if (result) {
            syncedIntegrationIds.add(result.gitlabIntegrationId);
          }
        } catch (error) {
          summary.failed += 1; // eslint-disable-line no-param-reassign

          if (isGitlabFailure(error)) {
            sails.log.warn(
              `GitLab periodic sync of card link failed (code: ${error.code}, ` +
                `status: ${error.status || 'none'}, link: ${link.id}, card: ${link.cardId}, ` +
                `integration: ${link.gitlabIntegrationId})`,
            );
          } else {
            sails.log.error(
              `GitLab periodic sync of card link ${link.id} crashed: ${error && error.stack}`,
            );
          }

          if (isGitlabFailure(error) && OUTAGE_CODES.has(error.code)) {
            consecutiveOutages += 1;

            if (consecutiveOutages >= OUTAGE_THRESHOLD && !isTripped) {
              isTripped = true;

              sails.log.warn(
                `GitLab looks unavailable (${consecutiveOutages} consecutive failures, ` +
                  `last code: ${error.code}), skipping the remaining links of this periodic sync`,
              );
            }
          } else {
            consecutiveOutages = 0;
          }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, links.length) }, worker));

    summary.skipped += links.length - nextIndex; // eslint-disable-line no-param-reassign

    return syncedIntegrationIds;
  };

  const runLockedTick = async (syncLink) => {
    const { gitlabSyncInterval, gitlabWebhookDeliveryRetentionDays } = sails.config.custom;

    const summary = {
      status: 'done',
      synced: 0,
      failed: 0,
      skipped: 0,
      pruned: 0,
    };

    const links = await GitlabCardLink.qm.getStaleByAttemptOrder(
      new Date(Date.now() - gitlabSyncInterval * MINUTE).toISOString(),
      LINKS_LIMIT,
    );

    const syncedIntegrationIds = await syncLinks(links, syncLink, summary);

    // Same semantics as the manual integration sync: at least one link synced successfully
    if (syncedIntegrationIds.size > 0) {
      const lastSyncedAt = new Date().toISOString();

      await Promise.all(
        [...syncedIntegrationIds].map((gitlabIntegrationId) =>
          GitlabIntegration.qm.updateOne(gitlabIntegrationId, {
            lastSyncedAt,
          }),
        ),
      );
    }

    if (gitlabWebhookDeliveryRetentionDays > 0) {
      summary.pruned = await GitlabWebhookDelivery.qm.deleteCreatedBefore(
        new Date(Date.now() - gitlabWebhookDeliveryRetentionDays * DAY).toISOString(),
      );
    }

    sails.log.info(
      `GitLab periodic sync: ${summary.synced} synced, ${summary.failed} failed, ` +
        `${summary.skipped} skipped, ${summary.pruned} webhook deliveries pruned`,
    );

    return summary;
  };

  // One tick. Callable directly (tests); `syncLink(id)` defaults to the coalesced requestSync,
  // so a periodic sync never runs concurrently with a webhook-triggered sync of the same link.
  const tick = async ({ syncLink = syncLinkById } = {}) => {
    if (!isEnabled()) {
      return {
        status: 'disabled',
      };
    }

    // A transaction-scoped lock (pg_try_advisory_xact_lock) instead of a session-level one: a
    // session lock belongs to the pooled connection that took it, so it must be released on that
    // same connection, and a failed unlock would return the connection to the pool still holding
    // it (blocking every other process for good). The transaction-scoped lock is released by
    // Postgres whenever the transaction ends (commit, rollback or lost connection). The
    // transaction only holds the lock: the syncs run on other connections and are not part of it.
    // The cost is one pooled connection idle in a transaction for the duration of the tick.
    return sails.getDatastore().transaction(async (db) => {
      const queryResult = await sails
        .sendNativeQuery('SELECT pg_try_advisory_xact_lock($1) AS acquired', [ADVISORY_LOCK_KEY])
        .usingConnection(db);

      if (!queryResult.rows[0].acquired) {
        sails.log.debug('GitLab periodic sync skipped: another process holds the lock');

        return {
          status: 'locked',
        };
      }

      return runLockedTick(syncLink);
    });
  };

  // Chained timeouts: the next tick is scheduled only after the current one settles, so ticks
  // never overlap within a process
  const scheduleNextTick = () => {
    if (isStopped) {
      return;
    }

    timeout = setTimeout(async () => {
      timeout = null;

      try {
        await tick();
      } catch (error) {
        sails.log.error(`GitLab periodic sync crashed: ${error && error.stack}`);
      }

      scheduleNextTick();
    }, sails.config.custom.gitlabSyncInterval * MINUTE);
  };

  const start = () => {
    if (!isEnabled()) {
      sails.log.info('GitLab periodic sync is disabled (GitLab not configured or interval 0)');

      return;
    }

    sails.log.info(
      `GitLab periodic sync every ${sails.config.custom.gitlabSyncInterval} minute(s)`,
    );

    isStopped = false;
    scheduleNextTick();
  };

  const stop = () => {
    isStopped = true;

    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return {
    /**
     * Runs when this Sails app loads/lifts.
     */

    async initialize() {
      sails.log.info('Initializing custom hook (`gitlab-sync`)');

      (sails.config.custom.gitlabSyncConfigWarnings || []).forEach((warning) => {
        sails.log.warn(warning);
      });

      // Tests drive ticks directly; a timer would sync and prune behind their back
      if (sails.config.environment === 'test') {
        return;
      }

      sails.on('lifted', start);
      sails.on('lower', stop);
    },

    isEnabled,
    tick,

    constants: {
      ADVISORY_LOCK_KEY,
      LINKS_LIMIT,
      CONCURRENCY,
      OUTAGE_THRESHOLD,
    },
  };
};
