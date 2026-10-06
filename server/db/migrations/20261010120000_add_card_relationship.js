// GitLab Bridge: dependencies and "related" links between cards.
//
// Relationships are stored in canonical form only, and each view is derived from the side it is
// read from:
// - (A, B, 'depends_on') means "A depends on B", i.e. "B blocks A";
// - (A, B, 'related') is symmetric, so it is stored once with card_id < related_card_id.
//
// Like the other Bridge tables, this one declares real foreign keys: core deletes cards with hard
// deletes (directly, or through lists, boards and projects), so relationships disappear with
// either card without patching core delete helpers. Users are hard deleted too, so the creator
// reference is nulled instead of removing the relationship.

exports.up = async (knex) => {
  await knex.schema.createTable('card_relationship', (table) => {
    /* Columns */

    table.bigInteger('id').primary().defaultTo(knex.raw('next_id()'));

    table.bigInteger('card_id').notNullable().references('id').inTable('card').onDelete('CASCADE');
    table
      .bigInteger('related_card_id')
      .notNullable()
      .references('id')
      .inTable('card')
      .onDelete('CASCADE');
    table
      .bigInteger('creator_user_id')
      .references('id')
      .inTable('user_account')
      .onDelete('SET NULL');

    table.text('type').notNullable();

    table.timestamp('created_at', true);
    table.timestamp('updated_at', true);

    /* Indexes */

    // Also serves lookups by card_id (leftmost column)
    table.unique(['card_id', 'related_card_id', 'type']);
    table.index('related_card_id');
  });

  await knex.raw(`
    ALTER TABLE card_relationship
      ADD CONSTRAINT card_relationship_type_check CHECK (type IN ('depends_on', 'related')),
      ADD CONSTRAINT card_relationship_not_self_check CHECK (card_id <> related_card_id),
      ADD CONSTRAINT card_relationship_related_order_check
        CHECK (type <> 'related' OR card_id < related_card_id)
  `);
};

exports.down = (knex) => knex.schema.dropTable('card_relationship');
