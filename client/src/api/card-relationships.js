import socket from './socket';

/* Actions */

const getCardRelationships = (cardId, headers) =>
  socket.get(`/cards/${cardId}/card-relationships`, undefined, headers);

const createCardRelationship = (cardId, data, headers) =>
  socket.post(`/cards/${cardId}/card-relationships`, data, headers);

const deleteCardRelationship = (id, headers) =>
  socket.delete(`/card-relationships/${id}`, undefined, headers);

export default {
  getCardRelationships,
  createCardRelationship,
  deleteCardRelationship,
};
