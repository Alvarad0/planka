// GitLab Bridge: links a Planka card to a GitLab issue.
//
// Two unique constraints keep the mapping one-to-one, which webhooks rely on to resolve an issue
// to exactly one card:
// - card_id: a card is linked to at most one issue.
// - (gitlab_integration_id, issue_iid): an issue (IIDs are unique per GitLab project) is linked to
//   at most one card.
//
// Like gitlab_integration, this table declares real foreign keys with ON DELETE CASCADE, so links
// disappear with their card or integration without patching core delete helpers.

exports.up = (knex) =>
  knex.schema.createTable('gitlab_card_link', (table) => {
    /* Columns */

    table.bigInteger('id').primary().defaultTo(knex.raw('next_id()'));

    table.bigInteger('card_id').notNullable().references('id').inTable('card').onDelete('CASCADE');
    table
      .bigInteger('gitlab_integration_id')
      .notNullable()
      .references('id')
      .inTable('gitlab_integration')
      .onDelete('CASCADE');

    table.integer('issue_id').notNullable();
    table.integer('issue_iid').notNullable();
    table.text('issue_url').notNullable();
    table.text('branch_name');
    // Last known issue data ({ title, state, updatedAt }), shown when GitLab is unreachable
    table.jsonb('snapshot');

    table.timestamp('last_synced_at', true);
    table.timestamp('created_at', true);
    table.timestamp('updated_at', true);

    /* Indexes */

    table.unique('card_id');
    table.unique(['gitlab_integration_id', 'issue_iid']);
  });

exports.down = (knex) => knex.schema.dropTable('gitlab_card_link');
