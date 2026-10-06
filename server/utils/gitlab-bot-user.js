// The GitLab Bridge bot user: the actor of automatic card moves, so the activity log reads
// "GitLab Bot moved ...". Created lazily on first need and cached per process.
//
// It is deactivated (nobody can log in as it) and has a random password that is hashed like any
// other and never kept. It is created through the query method rather than
// `sails.helpers.users.createOne`, which requires an actor user (for its outgoing webhook) that
// does not exist here; so no `userCreate` broadcast or webhook is sent, and admins see the user
// after a reload.
//
// Adoption safety: an existing user is used only when it holds the sentinel email (`.invalid` is
// a reserved TLD, so it cannot belong to a person). A different user named `gitlab-bot` is never
// taken over: an error is logged once and automatic moves are skipped until a restart.

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const BOT_USERNAME = 'gitlab-bot';
const BOT_NAME = 'GitLab Bot';
const BOT_EMAIL = 'gitlab-bot@planka.invalid';

const USERNAME_CONSTRAINT = 'user_account_username_unique';

// Promise of the bot user, or of null when it cannot be used
let cachedPromise = null;

const isUsernameConflict = (error) =>
  !!error &&
  error.name === 'AdapterError' &&
  !!error.raw &&
  error.raw.constraint === USERNAME_CONSTRAINT;

const isEmailConflict = (error) => !!error && error.code === 'E_UNIQUE';

const refuse = () => {
  sails.log.error(
    `GitLab Bridge: a user named "${BOT_USERNAME}" already exists without the email ` +
      `${BOT_EMAIL}; it is not used as the GitLab bot, so cards are not moved automatically`,
  );

  return null;
};

const createBotUser = async () => {
  const password = crypto.randomBytes(32).toString('base64');

  return User.qm.createOne({
    email: BOT_EMAIL,
    password: await bcrypt.hash(password, 10),
    role: User.Roles.BOARD_USER,
    name: BOT_NAME,
    username: BOT_USERNAME,
    isDeactivated: true,
  });
};

const resolveBotUser = async () => {
  const existingUser = await User.qm.getOneByEmail(BOT_EMAIL);

  if (existingUser) {
    return existingUser;
  }

  try {
    return await createBotUser();
  } catch (error) {
    if (!isUsernameConflict(error) && !isEmailConflict(error)) {
      throw error;
    }

    // Either another process created the bot meanwhile, or a person owns the username
    const concurrentUser = await User.qm.getOneByEmail(BOT_EMAIL);

    if (concurrentUser) {
      return concurrentUser;
    }

    if (isUsernameConflict(error)) {
      return refuse();
    }

    throw error;
  }
};

const getBotUser = () => {
  if (!cachedPromise) {
    cachedPromise = resolveBotUser().catch((error) => {
      // Not cached, so the next move tries again
      cachedPromise = null;

      throw error;
    });
  }

  return cachedPromise;
};

const resetBotUserCache = () => {
  cachedPromise = null;
};

module.exports = {
  BOT_USERNAME,
  BOT_NAME,
  BOT_EMAIL,
  getBotUser,
  resetBotUserCache,
};
