// Opt-in per custom field: when enabled, the value input suggests the values already used in the
// same custom field on other cards (e.g. "Area": Sales, Purchases...). Off by default, so fields
// that must stay unique (e.g. "ID") never suggest anything.

exports.up = (knex) =>
  knex.schema.alterTable('custom_field', (table) => {
    /* Columns */

    table.boolean('suggest_values').notNullable().defaultTo(false);
  });

exports.down = (knex) =>
  knex.schema.alterTable('custom_field', (table) => {
    table.dropColumn('suggest_values');
  });
