const { makeRowToModelTransformer } = require('../helpers');

const transformRowToModel = makeRowToModelTransformer(CardRelationship);

const PG_FOREIGN_KEY_VIOLATION = '23503';

// Whether `fromCardId` already depends, directly or transitively, on `toCardId`. UNION (not UNION
// ALL) keeps the walk finite even if a cycle existed.
const DEPENDS_ON_PATH_QUERY = `
  WITH RECURSIVE reachable(card_id) AS (
    SELECT related_card_id FROM card_relationship WHERE card_id = $1 AND type = $3
    UNION
    SELECT card_relationship.related_card_id
    FROM card_relationship
    JOIN reachable ON card_relationship.card_id = reachable.card_id
    WHERE card_relationship.type = $3
  )
  SELECT 1 FROM reachable WHERE card_id = $2 LIMIT 1
`;

/* Query methods */

// Whether a failed native query was rejected by Postgres with the given error code.
// sails-hook-orm attaches the driver report as `raw` (the driver error is `raw.error`), and the
// transaction wrapper may wrap that error again (as `raw` or `cause`).
const hasPgErrorCode = (error, code, depth = 0) => {
  if (!error || depth > 4) {
    return false;
  }

  if (error.code === code) {
    return true;
  }

  return [error.raw, error.error, error.cause].some((nested) =>
    hasPgErrorCode(nested, code, depth + 1),
  );
};

// Inserts a canonical relationship. Returns { cardRelationship } on success, or one of:
// - { isDuplicate: true } when the same relationship already exists;
// - { wouldCreateCycle: true } when a 'depends_on' relationship would close a dependency cycle;
// - { isCardMissing: true } when either card was deleted concurrently.
const createOne = async (values) => {
  try {
    return await sails.getDatastore().transaction(async (db) => {
      if (values.type === CardRelationship.Types.DEPENDS_ON) {
        await sails
          .sendNativeQuery('SELECT pg_advisory_xact_lock($1)', [
            CardRelationship.DEPENDENCY_LOCK_KEY,
          ])
          .usingConnection(db);

        // "card depends on related card" closes a cycle if related card already reaches card
        const pathResult = await sails
          .sendNativeQuery(DEPENDS_ON_PATH_QUERY, [
            values.relatedCardId,
            values.cardId,
            CardRelationship.Types.DEPENDS_ON,
          ])
          .usingConnection(db);

        if (pathResult.rowCount > 0) {
          return {
            wouldCreateCycle: true,
          };
        }
      }

      const now = new Date().toISOString();

      const queryResult = await sails
        .sendNativeQuery(
          'INSERT INTO card_relationship ' +
            '(card_id, related_card_id, type, creator_user_id, created_at, updated_at) ' +
            'VALUES ($1, $2, $3, $4, $5, $5) ' +
            'ON CONFLICT (card_id, related_card_id, type) DO NOTHING RETURNING *',
          [values.cardId, values.relatedCardId, values.type, values.creatorUserId || null, now],
        )
        .usingConnection(db);

      if (queryResult.rowCount === 0) {
        return {
          isDuplicate: true,
        };
      }

      return {
        cardRelationship: transformRowToModel(queryResult.rows[0]),
      };
    });
  } catch (error) {
    // The failed insert aborted the transaction, which has been rolled back by now
    if (hasPgErrorCode(error, PG_FOREIGN_KEY_VIOLATION)) {
      return {
        isCardMissing: true,
      };
    }

    throw error;
  }
};

const getByCardId = (cardId) =>
  CardRelationship.find({
    or: [{ cardId }, { relatedCardId: cardId }],
  }).sort('id');

// Ids of the cards having a task linked to the given card (the cards it is a subtask of), oldest
// first. Tasks of a card linked to the card itself are ignored.
const getParentCardIds = async (cardId) => {
  const queryResult = await sails.sendNativeQuery(
    'SELECT DISTINCT task_list.card_id FROM task ' +
      'JOIN task_list ON task_list.id = task.task_list_id ' +
      'WHERE task.linked_card_id = $1 AND task_list.card_id <> $1 ' +
      'ORDER BY task_list.card_id',
    [cardId],
  );

  return queryResult.rows.map((row) => row.card_id);
};

const getOneById = (id) => CardRelationship.findOne(id);

const deleteOne = (criteria) => CardRelationship.destroyOne(criteria);

module.exports = {
  createOne,
  getByCardId,
  getParentCardIds,
  getOneById,
  deleteOne,
};
