// GitLab connection configured from the Administration modal, as an alternative to the
// GITLAB_URL / GITLAB_TOKEN env vars (which take precedence when both are set). The token column
// holds ciphertext only (see utils/secret-box.js), never the token itself.

exports.up = (knex) =>
  knex.schema.alterTable('config', (table) => {
    /* Columns */

    table.text('gitlab_url');
    table.text('gitlab_token');
  });

exports.down = (knex) =>
  knex.schema.alterTable('config', (table) => {
    table.dropColumn('gitlab_url');
    table.dropColumn('gitlab_token');
  });
