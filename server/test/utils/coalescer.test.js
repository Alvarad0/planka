const { expect } = require('chai');

const { createCoalescer } = require('../../utils/coalescer');

const createDeferred = () => {
  const deferred = {};

  deferred.promise = new Promise((resolve, reject) => {
    Object.assign(deferred, { resolve, reject });
  });

  return deferred;
};

// Lets pending promise callbacks run
const flush = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

describe('Coalescer', () => {
  it('runs a single request once', async () => {
    const coalescer = createCoalescer();
    let runs = 0;

    const result = await coalescer.run('a', async () => {
      runs += 1;

      return 'done';
    });

    expect(result).to.equal('done');
    expect(runs).to.equal(1);
    expect(coalescer.isRunning('a')).to.equal(false);
  });

  it('runs exactly one more time for a burst of requests made while running', async () => {
    const coalescer = createCoalescer();
    const first = createDeferred();
    const calls = [];

    const firstPromise = coalescer.run('a', () => {
      calls.push('first');

      return first.promise;
    });

    await flush();

    const followUps = ['second', 'third', 'fourth'].map((name) =>
      coalescer.run('a', async () => {
        calls.push(name);

        return name;
      }),
    );

    await flush();

    // Nothing runs concurrently with the first run
    expect(calls).to.deep.equal(['first']);

    first.resolve('first');

    expect(await firstPromise).to.equal('first');

    // The follow-up uses the most recent task and every waiting caller gets its result
    expect(await Promise.all(followUps)).to.deep.equal(['fourth', 'fourth', 'fourth']);
    expect(calls).to.deep.equal(['first', 'fourth']);
    expect(coalescer.isRunning('a')).to.equal(false);
  });

  it('still runs the follow-up when the current run fails', async () => {
    const coalescer = createCoalescer();
    const first = createDeferred();

    const firstPromise = coalescer.run('a', () => first.promise);
    const secondPromise = coalescer.run('a', async () => 'second');

    first.reject(new Error('boom'));

    let firstError;
    try {
      await firstPromise;
    } catch (error) {
      firstError = error;
    }

    expect(firstError.message).to.equal('boom');
    expect(await secondPromise).to.equal('second');
  });

  it('propagates the failure of a follow-up run to its callers', async () => {
    const coalescer = createCoalescer();
    const first = createDeferred();

    coalescer.run('a', () => first.promise);
    const secondPromise = coalescer.run('a', async () => {
      throw new Error('follow-up failed');
    });

    first.resolve();

    let secondError;
    try {
      await secondPromise;
    } catch (error) {
      secondError = error;
    }

    expect(secondError.message).to.equal('follow-up failed');
    expect(coalescer.isRunning('a')).to.equal(false);
  });

  it('starts a new follow-up for requests made during a follow-up', async () => {
    const coalescer = createCoalescer();
    const first = createDeferred();
    const second = createDeferred();
    const calls = [];

    coalescer.run('a', () => {
      calls.push('first');

      return first.promise;
    });

    const secondPromise = coalescer.run('a', () => {
      calls.push('second');

      return second.promise;
    });

    first.resolve();
    await flush();

    expect(calls).to.deep.equal(['first', 'second']);

    const thirdPromise = coalescer.run('a', async () => {
      calls.push('third');
    });

    await flush();
    expect(calls).to.deep.equal(['first', 'second']);

    second.resolve('second');

    expect(await secondPromise).to.equal('second');
    await thirdPromise;

    expect(calls).to.deep.equal(['first', 'second', 'third']);
    expect(coalescer.isRunning('a')).to.equal(false);
  });

  it('runs different keys concurrently', async () => {
    const coalescer = createCoalescer();
    const first = createDeferred();
    const calls = [];

    const aPromise = coalescer.run('a', () => {
      calls.push('a');

      return first.promise;
    });

    const bPromise = coalescer.run('b', async () => {
      calls.push('b');
    });

    await bPromise;

    expect(calls).to.deep.equal(['a', 'b']);
    expect(coalescer.isRunning('a')).to.equal(true);

    first.resolve();
    await aPromise;

    expect(coalescer.isRunning('a')).to.equal(false);
  });
});
