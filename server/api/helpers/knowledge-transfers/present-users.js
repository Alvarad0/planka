// Presents users referenced by knowledge transfers (and the ones that can be assigned) through the
// core user presenter, as the current user sees them, then keeps only the fields needed to show a
// person. Board editors may list every active user, not only the ones sharing a board with them,
// so contact and profile fields (phone, organization, ...) are left out on purpose.

const FIELD_NAMES = ['id', 'name', 'username', 'avatar', 'gravatarUrl', 'isDeactivated'];

module.exports = {
  sync: true,

  inputs: {
    records: {
      type: 'ref',
      required: true,
    },
    user: {
      type: 'ref',
      required: true,
    },
  },

  fn(inputs) {
    return _.uniqBy(inputs.records, 'id').map((record) =>
      _.pick(sails.helpers.users.presentOne(record, inputs.user), FIELD_NAMES),
    );
  },
};
