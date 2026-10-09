import socket from './socket';

/* Transformers */

export const transformKnowledgeTransfer = (knowledgeTransfer) => ({
  ...knowledgeTransfer,
  ...(knowledgeTransfer.explainedAt && {
    explainedAt: new Date(knowledgeTransfer.explainedAt),
  }),
  ...(knowledgeTransfer.createdAt && {
    createdAt: new Date(knowledgeTransfer.createdAt),
  }),
  ...(knowledgeTransfer.updatedAt && {
    updatedAt: new Date(knowledgeTransfer.updatedAt),
  }),
});

const transformBody = (body) => ({
  ...body,
  ...(body.item && {
    item: transformKnowledgeTransfer(body.item),
  }),
  ...(body.items && {
    items: body.items.map(transformKnowledgeTransfer),
  }),
  included: {
    users: [],
    ...body.included,
  },
});

/* Actions */

const getKnowledgeTransfers = (cardId, headers) =>
  socket.get(`/cards/${cardId}/knowledge-transfers`, undefined, headers).then(transformBody);

const getKnowledgeTransferCandidates = (cardId, headers) =>
  socket.get(`/cards/${cardId}/knowledge-transfer-candidates`, undefined, headers);

const createKnowledgeTransfer = (cardId, data, headers) =>
  socket.post(`/cards/${cardId}/knowledge-transfers`, data, headers).then(transformBody);

const updateKnowledgeTransfer = (id, data, headers) =>
  socket.patch(`/knowledge-transfers/${id}`, data, headers).then(transformBody);

const deleteKnowledgeTransfer = (id, headers) =>
  socket.delete(`/knowledge-transfers/${id}`, undefined, headers).then(transformBody);

/* Event handlers */

const makeHandleKnowledgeTransferCreate = (next) => (body) => {
  next(transformBody(body));
};

const makeHandleKnowledgeTransferUpdate = makeHandleKnowledgeTransferCreate;

const makeHandleKnowledgeTransferDelete = makeHandleKnowledgeTransferCreate;

export default {
  getKnowledgeTransfers,
  getKnowledgeTransferCandidates,
  createKnowledgeTransfer,
  updateKnowledgeTransfer,
  deleteKnowledgeTransfer,
  makeHandleKnowledgeTransferCreate,
  makeHandleKnowledgeTransferUpdate,
  makeHandleKnowledgeTransferDelete,
};
