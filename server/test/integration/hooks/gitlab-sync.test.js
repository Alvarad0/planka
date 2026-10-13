const { expect } = require('chai');
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = require('undici');

const { ErrorCodes, GitlabError } = require('../../../utils/gitlab-client');

const GITLAB_URL = 'https://gitlab.test';
const GITLAB_TOKEN = 'glpat-sync-hook-test-token';
const GITLAB_PROJECT_ID = 42;
const OTHER_GITLAB_PROJECT_ID = 43;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const createProjectWithBoard = async (name) => {
  const project = await Project.create({ name, isHidden: false }).fetch();

  const board = await Board.create({
    projectId: project.id,
    position: 65536,
    name: 'Development',
    defaultView: 'kanban',
    defaultCardType: 'project',
    limitCardTypesToDefaultOne: false,
    alwaysDisplayCardCreator: false,
  }).fetch();

  const list = await List.create({
    boardId: board.id,
    type: List.Types.ACTIVE,
    position: 65536,
    name: 'To Do',
  }).fetch();

  return { project, board, list };
};

const createIntegration = (project, gitlabProjectId) =>
  GitlabIntegration.qm.createOne({
    gitlabProjectId,
    projectId: project.id,
    gitlabProjectPath: `company/project-${gitlabProjectId}`,
    defaultBranch: 'main',
    webhookSecretHash: 'not-a-real-hash',
  });

const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('gitlab-sync hook', () => {
  const originalCustom = {};

  let hook;
  let path;
  let integration;
  let otherPath;
  let otherIntegration;
  let issueIidCounter = 0;

  // Creates a card with a link whose last sync was `lastSyncedAgo` ms ago (null: never synced)
  const createLink = async ({ lastSyncedAgo = null, targetIntegration = integration } = {}) => {
    issueIidCounter += 1;

    const targetPath = targetIntegration === integration ? path : otherPath;

    const card = await Card.create({
      name: `Card ${issueIidCounter}`,
      boardId: targetPath.board.id,
      listId: targetPath.list.id,
      type: 'project',
      position: 65536,
    }).fetch();

    const link = await GitlabCardLink.qm.createOne({
      cardId: card.id,
      gitlabIntegrationId: targetIntegration.id,
      issueId: 9000 + issueIidCounter,
      issueIid: issueIidCounter,
      issueUrl: `${GITLAB_URL}/company/erp/-/issues/${issueIidCounter}`,
    });

    if (lastSyncedAgo === null) {
      return link;
    }

    return GitlabCardLink.qm.updateOne(link.id, {
      lastSyncedAt: isoAgo(lastSyncedAgo),
    });
  };

  // Fake syncLink that records the order in which links are started
  const recordingSyncLink = (implementation = async () => null) => {
    const calls = [];

    const syncLink = async (id) => {
      calls.push(id);

      return implementation(id);
    };

    syncLink.calls = calls;

    return syncLink;
  };

  const captureLogs = (levels) => {
    const logs = {};
    const originals = {};

    levels.forEach((level) => {
      logs[level] = [];
      originals[level] = sails.log[level];

      sails.log[level] = (message) => {
        logs[level].push(message);
      };
    });

    logs.restore = () => {
      Object.assign(sails.log, originals);
    };

    return logs;
  };

  before(() => {
    hook = sails.hooks['gitlab-sync'];

    [
      'gitlabUrl',
      'gitlabToken',
      'outgoingProxy',
      'gitlabSyncInterval',
      'gitlabWebhookDeliveryRetentionDays',
    ].forEach((key) => {
      originalCustom[key] = sails.config.custom[key];
    });
  });

  after(() => {
    Object.assign(sails.config.custom, originalCustom);
  });

  beforeEach(async () => {
    Object.assign(sails.config.custom, {
      gitlabUrl: GITLAB_URL,
      gitlabToken: GITLAB_TOKEN,
      outgoingProxy: undefined,
      gitlabSyncInterval: 10,
      gitlabWebhookDeliveryRetentionDays: 30,
    });

    path = await createProjectWithBoard('ERP');
    integration = await createIntegration(path.project, GITLAB_PROJECT_ID);

    otherPath = await createProjectWithBoard('CRM');
    otherIntegration = await createIntegration(otherPath.project, OTHER_GITLAB_PROJECT_ID);
  });

  afterEach(async () => {
    await sails.sendNativeQuery('DELETE FROM gitlab_webhook_delivery');
    await sails.sendNativeQuery('DELETE FROM gitlab_card_link');
    await sails.sendNativeQuery('DELETE FROM gitlab_integration');
    await Card.destroy({});
    await List.destroy({});
    await Board.destroy({});
    await Project.destroy({});
  });

  describe('enabling', () => {
    it('does nothing when the interval is 0', async () => {
      sails.config.custom.gitlabSyncInterval = 0;
      await createLink();

      const syncLink = recordingSyncLink();

      expect(await hook.isEnabled()).to.equal(false);
      expect(await hook.tick({ syncLink })).to.deep.equal({
        status: 'disabled',
      });
      expect(syncLink.calls).to.deep.equal([]);
    });

    it('does nothing when GitLab is not configured', async () => {
      await createLink();

      const syncLink = recordingSyncLink();

      sails.config.custom.gitlabToken = undefined;
      expect(await hook.isEnabled()).to.equal(false);
      expect(await hook.tick({ syncLink })).to.deep.equal({
        status: 'disabled',
      });

      sails.config.custom.gitlabToken = GITLAB_TOKEN;
      sails.config.custom.gitlabUrl = null;
      expect(await hook.isEnabled()).to.equal(false);
      expect(await hook.tick({ syncLink })).to.deep.equal({
        status: 'disabled',
      });

      expect(syncLink.calls).to.deep.equal([]);
    });

    it('is enabled with GitLab configured and a positive interval', async () => {
      expect(await hook.isEnabled()).to.equal(true);
    });

    it('picks up GitLab settings saved from the UI on each check', async () => {
      Object.assign(sails.config.custom, {
        gitlabUrl: null,
        gitlabToken: undefined,
      });

      expect(await hook.isEnabled()).to.equal(false);

      try {
        await Config.qm.updateOneMain({
          gitlabUrl: GITLAB_URL,
          gitlabToken: sails.helpers.gitlab.encryptToken(GITLAB_TOKEN),
        });

        expect(await hook.isEnabled()).to.equal(true);
      } finally {
        await Config.qm.updateOneMain({
          gitlabUrl: null,
          gitlabToken: null,
        });
      }

      expect(await hook.isEnabled()).to.equal(false);
    });
  });

  describe('link selection', () => {
    it('selects stale links, never attempted first, then the least recently attempted', async () => {
      const recent = await createLink({ lastSyncedAgo: 5 * MINUTE });
      const attemptedLater = await createLink({ lastSyncedAgo: 60 * MINUTE });
      const neverA = await createLink();
      const attemptedEarlier = await createLink({ lastSyncedAgo: 120 * MINUTE });
      const neverB = await createLink();

      await GitlabCardLink.qm.updateOne(attemptedLater.id, { lastSyncAttemptedAt: isoAgo(MINUTE) });
      await GitlabCardLink.qm.updateOne(attemptedEarlier.id, {
        lastSyncAttemptedAt: isoAgo(DAY),
      });
      // A recent attempt does not make a link stale
      await GitlabCardLink.qm.updateOne(recent.id, { lastSyncAttemptedAt: isoAgo(DAY) });

      const links = await GitlabCardLink.qm.getStaleByAttemptOrder(isoAgo(10 * MINUTE), 10);

      expect(links.map(({ id }) => id)).to.deep.equal([
        neverA.id,
        neverB.id,
        attemptedEarlier.id,
        attemptedLater.id,
      ]);
      expect(links[0].gitlabIntegrationId).to.equal(integration.id);

      const limited = await GitlabCardLink.qm.getStaleByAttemptOrder(isoAgo(10 * MINUTE), 3);

      expect(limited.map(({ id }) => id)).to.deep.equal([
        neverA.id,
        neverB.id,
        attemptedEarlier.id,
      ]);
    });

    it('records an attempt on success and failure without touching lastSyncedAt', async () => {
      const succeeding = await createLink({ lastSyncedAgo: DAY });
      const failing = await createLink({ lastSyncedAgo: DAY });

      const syncLink = recordingSyncLink(async (id) => {
        if (id === failing.id) {
          throw new GitlabError(ErrorCodes.NOT_FOUND, 'GitLab resource not found', 404);
        }

        return null;
      });

      const logs = captureLogs(['warn']);

      try {
        await hook.tick({ syncLink });
      } finally {
        logs.restore();
      }

      const reloadedSucceeding = await GitlabCardLink.qm.getOneById(succeeding.id);
      const reloadedFailing = await GitlabCardLink.qm.getOneById(failing.id);

      [reloadedSucceeding, reloadedFailing].forEach((link) => {
        expect(new Date(link.lastSyncAttemptedAt).getTime()).to.be.above(Date.now() - MINUTE);
      });

      expect(reloadedFailing.lastSyncedAt).to.deep.equal(failing.lastSyncedAt);
      expect(sails.helpers.gitlabCardLinks.presentOne(reloadedFailing)).to.not.have.property(
        'lastSyncAttemptedAt',
      );
    });

    it('processes a link that failed in the previous tick after the other stale links', async () => {
      const failing = await createLink();

      const failingSyncLink = recordingSyncLink(async () => {
        throw new GitlabError(ErrorCodes.NOT_FOUND, 'GitLab resource not found', 404);
      });

      const logs = captureLogs(['warn']);

      try {
        await hook.tick({ syncLink: failingSyncLink });
      } finally {
        logs.restore();
      }

      expect(failingSyncLink.calls).to.deep.equal([failing.id]);

      const olderAttempted = await createLink({ lastSyncedAgo: DAY });
      await GitlabCardLink.qm.updateOne(olderAttempted.id, { lastSyncAttemptedAt: isoAgo(DAY) });
      const neverAttempted = await createLink();

      const queue = await GitlabCardLink.qm.getStaleByAttemptOrder(isoAgo(10 * MINUTE), 10);

      expect(queue.map(({ id }) => id)).to.deep.equal([
        neverAttempted.id,
        olderAttempted.id,
        failing.id,
      ]);

      const syncLink = recordingSyncLink();
      await hook.tick({ syncLink });

      expect([...syncLink.calls].sort()).to.deep.equal(
        [neverAttempted.id, olderAttempted.id, failing.id].sort(),
      );
    });

    it('does not let permanently failing links starve the others', async () => {
      const { LINKS_LIMIT } = hook.constants;

      const failingIds = new Set();

      for (let index = 0; index < LINKS_LIMIT + 5; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        const link = await createLink();
        failingIds.add(link.id);
      }

      const healthy = [];

      for (let index = 0; index < 5; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        healthy.push(await createLink());
      }

      const syncLink = recordingSyncLink(async (id) => {
        if (failingIds.has(id)) {
          throw new GitlabError(ErrorCodes.NOT_FOUND, 'GitLab resource not found', 404);
        }

        return GitlabCardLink.qm.updateOne(id, { lastSyncedAt: new Date().toISOString() });
      });

      const logs = captureLogs(['warn']);

      try {
        for (let tickIndex = 0; tickIndex < 3; tickIndex += 1) {
          // eslint-disable-next-line no-await-in-loop
          await hook.tick({ syncLink });
        }
      } finally {
        logs.restore();
      }

      const reloaded = await Promise.all(healthy.map(({ id }) => GitlabCardLink.qm.getOneById(id)));

      reloaded.forEach((link) => {
        expect(link.lastSyncedAt).to.not.equal(null);
      });
    });

    it('syncs only stale links, in order, up to the limit per tick', async () => {
      const { LINKS_LIMIT } = hook.constants;

      const recent = await createLink({ lastSyncedAgo: 5 * MINUTE });
      const stale = await createLink({ lastSyncedAgo: 30 * MINUTE });

      const never = [];

      for (let index = 0; index < LINKS_LIMIT + 2; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        never.push(await createLink());
      }

      const syncLink = recordingSyncLink();
      const summary = await hook.tick({ syncLink });

      expect(summary).to.include({
        status: 'done',
        synced: LINKS_LIMIT,
        failed: 0,
        skipped: 0,
      });

      // Nothing was attempted yet, so the order is by id
      const expectedIds = [stale, ...never].map(({ id }) => id).slice(0, LINKS_LIMIT);

      // Workers record each attempt before syncing, so calls may start slightly out of order
      expect([...syncLink.calls].sort()).to.deep.equal([...expectedIds].sort());
      expect(syncLink.calls).to.not.include(recent.id);
    });

    it('treats links synced within the interval as fresh', async () => {
      sails.config.custom.gitlabSyncInterval = 60;

      await createLink({ lastSyncedAgo: 30 * MINUTE });
      const stale = await createLink({ lastSyncedAgo: 90 * MINUTE });

      const syncLink = recordingSyncLink();
      await hook.tick({ syncLink });

      expect(syncLink.calls).to.deep.equal([stale.id]);
    });
  });

  describe('lock', () => {
    it('skips the tick while another connection holds the lock', async () => {
      await createLink();

      const syncLink = recordingSyncLink();
      const { ADVISORY_LOCK_KEY } = hook.constants;

      const summary = await sails.getDatastore().leaseConnection(async (db) => {
        await sails
          .sendNativeQuery('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])
          .usingConnection(db);

        try {
          return await hook.tick({ syncLink });
        } finally {
          await sails
            .sendNativeQuery('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
            .usingConnection(db);
        }
      });

      expect(summary).to.deep.equal({ status: 'locked' });
      expect(syncLink.calls).to.deep.equal([]);
    });

    it('releases the lock after a tick, also when it crashes', async () => {
      await createLink();

      const originalGetStaleByAttemptOrder = GitlabCardLink.qm.getStaleByAttemptOrder;

      GitlabCardLink.qm.getStaleByAttemptOrder = async () => {
        throw new Error('Database exploded');
      };

      try {
        let error;

        try {
          await hook.tick({ syncLink: recordingSyncLink() });
        } catch (caughtError) {
          error = caughtError;
        }

        // Sails wraps errors thrown inside a transaction
        expect(error).to.exist; // eslint-disable-line no-unused-expressions
      } finally {
        GitlabCardLink.qm.getStaleByAttemptOrder = originalGetStaleByAttemptOrder;
      }

      const { ADVISORY_LOCK_KEY } = hook.constants;

      // Another session can take the lock, so the crashed tick did not keep it
      const acquired = await sails.getDatastore().leaseConnection(async (db) => {
        const queryResult = await sails
          .sendNativeQuery('SELECT pg_try_advisory_lock($1) AS acquired', [ADVISORY_LOCK_KEY])
          .usingConnection(db);

        await sails
          .sendNativeQuery('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
          .usingConnection(db);

        return queryResult.rows[0].acquired;
      });

      expect(acquired).to.equal(true);

      const syncLink = recordingSyncLink();

      expect(await hook.tick({ syncLink })).to.include({
        status: 'done',
        synced: 1,
      });
    });
  });

  describe('failures', () => {
    it('stops starting links after consecutive GitLab outages and logs it once', async () => {
      const { CONCURRENCY, OUTAGE_THRESHOLD } = hook.constants;
      const total = 12;

      for (let index = 0; index < total; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await createLink();
      }

      const syncLink = recordingSyncLink(async () => {
        await wait(1);

        throw new GitlabError(ErrorCodes.UNAVAILABLE, 'GitLab timed out');
      });

      const logs = captureLogs(['warn', 'error', 'info']);

      let summary;
      try {
        summary = await hook.tick({ syncLink });
      } finally {
        logs.restore();
      }

      expect(summary.status).to.equal('done');
      expect(summary.synced).to.equal(0);
      expect(summary.failed).to.equal(syncLink.calls.length);
      expect(summary.failed).to.be.at.least(OUTAGE_THRESHOLD);
      expect(summary.failed).to.be.below(OUTAGE_THRESHOLD + CONCURRENCY);
      expect(summary.skipped).to.equal(total - summary.failed);

      const breakerLogs = logs.warn.filter((message) => message.includes('looks unavailable'));

      expect(breakerLogs).to.have.length(1);
      expect(logs.error).to.deep.equal([]);
      expect(logs.warn.join('\n')).to.not.include(GITLAB_TOKEN);
      expect(logs.info).to.have.length(1);
      expect(logs.info[0]).to.match(/0 synced, \d+ failed, \d+ skipped, 0 webhook deliveries/);
    });

    it('does not stop on failures of single links', async () => {
      const total = 8;
      const links = [];

      for (let index = 0; index < total; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        links.push(await createLink());
      }

      // Missing issues, crashes and a success between outages never add up to a GitLab outage
      const outcomes = {
        [links[0].id]: () => {
          throw new GitlabError(ErrorCodes.NOT_FOUND, 'GitLab resource not found', 404);
        },
        [links[1].id]: () => {
          throw new TypeError('Cannot read properties of undefined');
        },
        [links[2].id]: () => {
          throw new GitlabError(ErrorCodes.UNAVAILABLE, 'GitLab responded with 502', 502);
        },
        [links[3].id]: () => {
          throw new GitlabError(ErrorCodes.UNAVAILABLE, 'GitLab responded with 502', 502);
        },
        [links[4].id]: () => null,
        [links[5].id]: () => {
          throw new GitlabError(ErrorCodes.UNAVAILABLE, 'GitLab responded with 502', 502);
        },
        [links[6].id]: () => {
          throw new Error('Unexpected');
        },
      };

      // Sequential outcomes make "consecutive" deterministic despite the concurrency
      let queue = Promise.resolve();

      const syncLink = recordingSyncLink((id) => {
        const outcome = outcomes[id] || (() => null);
        const result = queue.then(() => outcome());

        queue = result.catch(() => {});

        return result;
      });

      const logs = captureLogs(['warn', 'error', 'info']);

      let summary;
      try {
        summary = await hook.tick({ syncLink });
      } finally {
        logs.restore();
      }

      expect(syncLink.calls).to.have.length(total);
      expect(summary).to.include({
        status: 'done',
        synced: 2,
        failed: 6,
        skipped: 0,
      });

      expect(logs.error).to.have.length(2);
      expect(logs.warn.filter((message) => message.includes('looks unavailable'))).to.deep.equal(
        [],
      );
    });
  });

  describe('integrations', () => {
    it('marks integrations with at least one synced link as synced', async () => {
      const link = await createLink();
      const otherLink = await createLink({
        targetIntegration: otherIntegration,
      });

      const syncLink = recordingSyncLink(async (id) => {
        if (id === otherLink.id) {
          throw new GitlabError(ErrorCodes.FORBIDDEN, 'GitLab token lacks permission', 403);
        }

        return { id, gitlabIntegrationId: link.gitlabIntegrationId };
      });

      const logs = captureLogs(['warn']);

      try {
        await hook.tick({ syncLink });
      } finally {
        logs.restore();
      }

      const syncedIntegration = await GitlabIntegration.qm.getOneById(integration.id);
      const failedIntegration = await GitlabIntegration.qm.getOneById(otherIntegration.id);

      expect(syncedIntegration.lastSyncedAt).to.not.equal(null);
      expect(failedIntegration.lastSyncedAt).to.equal(null);
    });

    it('syncs a stale link from GitLab through the coalesced sync', async () => {
      const originalDispatcher = getGlobalDispatcher();
      const mockAgent = new MockAgent();

      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);

      try {
        const link = await createLink({ lastSyncedAgo: DAY });

        mockAgent
          .get(GITLAB_URL)
          .intercept({
            path: `/api/v4/projects/${GITLAB_PROJECT_ID}/issues/${link.issueIid}`,
            method: 'GET',
            headers: { 'private-token': GITLAB_TOKEN },
          })
          .reply(200, {
            iid: link.issueIid,
            id: link.issueId,
            title: 'Implement login',
            state: 'opened',
            web_url: link.issueUrl,
            updated_at: '2026-10-05T12:00:00.000Z',
          });

        const summary = await hook.tick();

        expect(summary).to.include({ status: 'done', synced: 1, failed: 0 });
        expect(mockAgent.pendingInterceptors()).to.deep.equal([]);

        const syncedLink = await GitlabCardLink.qm.getOneById(link.id);

        expect(syncedLink.snapshot.issue).to.include({ title: 'Implement login' });
        expect(new Date(syncedLink.lastSyncedAt).getTime()).to.be.above(Date.now() - MINUTE);

        const syncedIntegration = await GitlabIntegration.qm.getOneById(integration.id);

        expect(syncedIntegration.lastSyncedAt).to.not.equal(null);
      } finally {
        setGlobalDispatcher(originalDispatcher);
        await mockAgent.close();
      }
    });
  });

  describe('pruning', () => {
    const createDelivery = async (createdAgo, eventUuid) => {
      const delivery = await GitlabWebhookDelivery.qm.createOne({
        eventUuid,
        eventType: GitlabWebhookDelivery.EventTypes.ISSUE,
        status: GitlabWebhookDelivery.Statuses.PROCESSED,
        gitlabIntegrationId: integration.id,
      });

      await sails.sendNativeQuery(
        'UPDATE gitlab_webhook_delivery SET created_at = $1 WHERE id = $2',
        [isoAgo(createdAgo), delivery.id],
      );

      return delivery;
    };

    it('deletes only deliveries older than the retention', async () => {
      await createDelivery(31 * DAY, 'old-1');
      await createDelivery(90 * DAY, 'old-2');
      const recent = await createDelivery(29 * DAY, 'recent-1');
      const fresh = await createDelivery(0, 'fresh-1');

      const summary = await hook.tick({ syncLink: recordingSyncLink() });

      expect(summary).to.include({ status: 'done', pruned: 2 });

      const queryResult = await sails.sendNativeQuery(
        'SELECT id FROM gitlab_webhook_delivery ORDER BY id',
      );

      expect(queryResult.rows.map(({ id }) => id).sort()).to.deep.equal(
        [recent.id, fresh.id].sort(),
      );
    });

    it('keeps every delivery when the retention is 0', async () => {
      await createDelivery(365 * DAY, 'ancient-1');

      sails.config.custom.gitlabWebhookDeliveryRetentionDays = 0;

      const summary = await hook.tick({ syncLink: recordingSyncLink() });

      expect(summary).to.include({ status: 'done', pruned: 0 });
      expect(await GitlabWebhookDelivery.qm.getOneByEventUuid('ancient-1')).to.not.equal(undefined);
    });
  });
});
