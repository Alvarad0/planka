// GitLab Bridge: one row per received GitLab webhook delivery, for idempotency and audit.
//
// event_uuid is unique: GitLab retries a delivery with the same Idempotency-Key, so a retry is
// detected by the insert failing. Like the other GitLab Bridge tables, this one declares a real
// foreign key with ON DELETE CASCADE, so deliveries disappear with their integration. Rows are
// pruned by age (created_at) by the periodic sync.

exports.up = (knex) =>
  knex.schema.createTable('gitlab_webhook_delivery', (table) => {
    /* Columns */

    table.bigInteger('id').primary().defaultTo(knex.raw('next_id()'));

    table
      .bigInteger('gitlab_integration_id')
      .notNullable()
      .references('id')
      .inTable('gitlab_integration')
      .onDelete('CASCADE');

    table.text('event_uuid').notNullable();
    table.text('event_type').notNullable();
    // received / processed / ignored / failed
    table.text('status').notNullable();
    // Short description of a processing failure; never contains tokens or secrets
    table.text('error');

    table.timestamp('created_at', true);
    table.timestamp('updated_at', true);

    /* Indexes */

    table.unique('event_uuid');
    table.index('gitlab_integration_id');
    table.index('created_at');
  });

exports.down = (knex) => knex.schema.dropTable('gitlab_webhook_delivery');
