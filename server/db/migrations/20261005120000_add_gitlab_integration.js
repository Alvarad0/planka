// GitLab Bridge: one GitLab project per Planka project.
//
// Unlike core tables, this one declares real foreign keys. Core deletes projects and lists with
// hard deletes and cleans related rows in application code; relying on the database here keeps
// the Bridge consistent without patching core delete helpers.

exports.up = (knex) =>
  knex.schema.createTable('gitlab_integration', (table) => {
    /* Columns */

    table.bigInteger('id').primary().defaultTo(knex.raw('next_id()'));

    table
      .bigInteger('project_id')
      .notNullable()
      .references('id')
      .inTable('project')
      .onDelete('CASCADE');
    table.bigInteger('review_list_id').references('id').inTable('list').onDelete('SET NULL');
    table.bigInteger('completed_list_id').references('id').inTable('list').onDelete('SET NULL');

    table.integer('gitlab_project_id').notNullable();
    table.text('gitlab_project_path').notNullable();
    table.text('default_branch').notNullable();
    table.boolean('auto_move_on_mr_open').notNullable().defaultTo(false);
    table.boolean('auto_move_on_mr_merge').notNullable().defaultTo(false);
    table.text('webhook_secret_hash').notNullable();

    table.timestamp('last_synced_at', true);
    table.timestamp('created_at', true);
    table.timestamp('updated_at', true);

    /* Indexes */

    table.unique('project_id');
    table.index('gitlab_project_id');
  });

exports.down = (knex) => knex.schema.dropTable('gitlab_integration');
