const { expect } = require('chai');

const {
  DEFAULT_SYNC_INTERVAL,
  DEFAULT_WEBHOOK_DELIVERY_RETENTION_DAYS,
  MAX_SYNC_INTERVAL,
  parseNonNegativeInteger,
  parseGitlabSyncConfig,
} = require('../../utils/gitlab-sync-config');

describe('gitlab-sync-config', () => {
  describe('parseNonNegativeInteger', () => {
    const options = { defaultValue: 10, max: 100 };

    it('returns the default for unset values without flagging them', () => {
      [undefined, null, '', '   '].forEach((rawValue) => {
        expect(parseNonNegativeInteger(rawValue, options)).to.deep.equal({
          value: 10,
          isValid: true,
        });
      });
    });

    it('accepts non-negative integers, including 0 and surrounding spaces', () => {
      expect(parseNonNegativeInteger('0', options)).to.deep.equal({
        value: 0,
        isValid: true,
      });
      expect(parseNonNegativeInteger(' 15 ', options)).to.deep.equal({
        value: 15,
        isValid: true,
      });
      expect(parseNonNegativeInteger('100', options)).to.deep.equal({
        value: 100,
        isValid: true,
      });
    });

    it('flags invalid values and returns the default for them', () => {
      ['-1', 'abc', '10abc', '1.5', '1e3', '101'].forEach((rawValue) => {
        expect(parseNonNegativeInteger(rawValue, options)).to.deep.equal({
          value: 10,
          isValid: false,
        });
      });
    });
  });

  describe('parseGitlabSyncConfig', () => {
    it('uses the defaults when nothing is set', () => {
      expect(parseGitlabSyncConfig({})).to.deep.equal({
        gitlabSyncInterval: DEFAULT_SYNC_INTERVAL,
        gitlabWebhookDeliveryRetentionDays: DEFAULT_WEBHOOK_DELIVERY_RETENTION_DAYS,
        warnings: [],
      });

      expect(DEFAULT_SYNC_INTERVAL).to.equal(10);
      expect(DEFAULT_WEBHOOK_DELIVERY_RETENTION_DAYS).to.equal(30);
    });

    it('reads valid values, where 0 disables', () => {
      expect(
        parseGitlabSyncConfig({
          GITLAB_SYNC_INTERVAL: '0',
          GITLAB_WEBHOOK_DELIVERY_RETENTION_DAYS: '7',
        }),
      ).to.deep.equal({
        gitlabSyncInterval: 0,
        gitlabWebhookDeliveryRetentionDays: 7,
        warnings: [],
      });
    });

    it('falls back to the defaults with a warning for invalid values', () => {
      const config = parseGitlabSyncConfig({
        GITLAB_SYNC_INTERVAL: '-5',
        GITLAB_WEBHOOK_DELIVERY_RETENTION_DAYS: 'forever',
      });

      expect(config.gitlabSyncInterval).to.equal(DEFAULT_SYNC_INTERVAL);
      expect(config.gitlabWebhookDeliveryRetentionDays).to.equal(
        DEFAULT_WEBHOOK_DELIVERY_RETENTION_DAYS,
      );

      expect(config.warnings).to.have.length(2);
      expect(config.warnings[0]).to.include('GITLAB_SYNC_INTERVAL');
      expect(config.warnings[1]).to.include('GITLAB_WEBHOOK_DELIVERY_RETENTION_DAYS');
      expect(config.warnings.join(' ')).to.not.include('forever');
    });

    it('rejects intervals that setTimeout cannot represent', () => {
      const config = parseGitlabSyncConfig({
        GITLAB_SYNC_INTERVAL: `${MAX_SYNC_INTERVAL + 1}`,
      });

      expect(config.gitlabSyncInterval).to.equal(DEFAULT_SYNC_INTERVAL);
      expect(config.warnings).to.have.length(1);
      expect(MAX_SYNC_INTERVAL * 60 * 1000).to.be.at.most(2 ** 31 - 1);
    });
  });
});
