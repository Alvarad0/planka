// GitLab Bridge: stores the web URL of the branch created for a card, so the card can link to it
// without calling GitLab.
//
// A branch may belong to one card only: push events (webhooks) are mapped to a card by branch
// name. NULLs are distinct in PostgreSQL, so cards without a branch are not affected.

exports.up = (knex) =>
  knex.schema.alterTable('gitlab_card_link', (table) => {
    /* Columns */

    table.text('branch_url');

    /* Indexes */

    table.unique(['gitlab_integration_id', 'branch_name']);
  });

exports.down = (knex) =>
  knex.schema.alterTable('gitlab_card_link', (table) => {
    table.dropUnique(['gitlab_integration_id', 'branch_name']);
    table.dropColumn('branch_url');
  });
