// Knowledge transfer: users who must learn what a card is about (a process, task or module), so
// future work can also be assigned to someone who received the explanation. Each row tracks whether
// the explanation was given, by whom and when.
//
// Like the GitLab Bridge tables, real foreign keys keep rows consistent without patching core
// delete helpers:
// - card_id / user_id: ON DELETE CASCADE, a row is meaningless without its card or assignee (users
//   are hard-deleted);
// - explained_by_user_id / creator_user_id: ON DELETE SET NULL, the record survives its author.

exports.up = (knex) =>
  knex.schema.createTable('card_knowledge_transfer', (table) => {
    /* Columns */

    table.bigInteger('id').primary().defaultTo(knex.raw('next_id()'));

    table.bigInteger('card_id').notNullable().references('id').inTable('card').onDelete('CASCADE');
    table
      .bigInteger('user_id')
      .notNullable()
      .references('id')
      .inTable('user_account')
      .onDelete('CASCADE');
    table
      .bigInteger('explained_by_user_id')
      .references('id')
      .inTable('user_account')
      .onDelete('SET NULL');
    table
      .bigInteger('creator_user_id')
      .references('id')
      .inTable('user_account')
      .onDelete('SET NULL');

    table.boolean('is_explained').notNullable().defaultTo(false);

    table.timestamp('explained_at', true);
    table.timestamp('created_at', true);
    table.timestamp('updated_at', true);

    /* Indexes */

    table.unique(['card_id', 'user_id']);
    // Future "who knows what" queries by user
    table.index('user_id');
  });

exports.down = (knex) => knex.schema.dropTable('card_knowledge_transfer');
