const { expect } = require('chai');

describe('Test database', () => {
  it('runs on PostgreSQL with the next_id() generator', async () => {
    const { rows } = await sails.sendNativeQuery('SELECT next_id() AS id');

    expect(String(rows[0].id)).to.match(/^[1-9][0-9]*$/);
  });

  it('has migrations applied', async () => {
    const { rows } = await sails.sendNativeQuery('SELECT COUNT(*)::int AS count FROM migration');

    expect(rows[0].count).to.be.greaterThan(0);
  });

  it('can query core models', async () => {
    const users = await User.find();

    expect(users).to.be.an('array');
  });
});
