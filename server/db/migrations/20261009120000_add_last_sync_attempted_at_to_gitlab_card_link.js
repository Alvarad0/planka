// GitLab Bridge: when the periodic sync last tried to sync a link (successfully or not).
//
// The periodic sync picks stale links (by last_synced_at) in order of their last attempt, so
// links that keep failing (e.g. a deleted issue) rotate to the back of the queue instead of
// starving the others. last_synced_at keeps meaning "last fresh snapshot". Internal only.

exports.up = (knex) =>
  knex.schema.alterTable('gitlab_card_link', (table) => {
    /* Columns */

    table.timestamp('last_sync_attempted_at', true);

    /* Indexes */

    table.index(['last_sync_attempted_at', 'id']);
  });

exports.down = (knex) =>
  knex.schema.alterTable('gitlab_card_link', (table) => {
    table.dropIndex(['last_sync_attempted_at', 'id']);
    table.dropColumn('last_sync_attempted_at');
  });
