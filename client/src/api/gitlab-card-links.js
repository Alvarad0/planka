import socket from './socket';

/* Transformers */

export const transformGitlabCardLink = (gitlabCardLink) => ({
  ...gitlabCardLink,
  ...(gitlabCardLink.snapshot && {
    snapshot: {
      ...gitlabCardLink.snapshot,
      ...(gitlabCardLink.snapshot.updatedAt && {
        updatedAt: new Date(gitlabCardLink.snapshot.updatedAt),
      }),
    },
  }),
  ...(gitlabCardLink.lastSyncedAt && {
    lastSyncedAt: new Date(gitlabCardLink.lastSyncedAt),
  }),
  ...(gitlabCardLink.createdAt && {
    createdAt: new Date(gitlabCardLink.createdAt),
  }),
  ...(gitlabCardLink.updatedAt && {
    updatedAt: new Date(gitlabCardLink.updatedAt),
  }),
});

export const transformGitlabIssue = (gitlabIssue) => ({
  ...gitlabIssue,
  ...(gitlabIssue.updatedAt && {
    updatedAt: new Date(gitlabIssue.updatedAt),
  }),
});

const transformBody = (body) => ({
  ...body,
  item: body.item && transformGitlabCardLink(body.item),
  ...(body.included && {
    included: {
      ...body.included,
      ...(body.included.gitlabIssue && {
        gitlabIssue: transformGitlabIssue(body.included.gitlabIssue),
      }),
    },
  }),
});

/* Actions */

const getGitlabCardLink = (cardId, headers) =>
  socket.get(`/cards/${cardId}/gitlab`, undefined, headers).then(transformBody);

const createGitlabIssueForCard = (cardId, headers) =>
  socket.post(`/cards/${cardId}/gitlab-issue`, undefined, headers).then(transformBody);

const linkGitlabIssueToCard = (cardId, data, headers) =>
  socket.post(`/cards/${cardId}/gitlab-link`, data, headers).then(transformBody);

const unlinkGitlabIssueFromCard = (cardId, headers) =>
  socket.delete(`/cards/${cardId}/gitlab-link`, undefined, headers).then(transformBody);

const createGitlabBranchForCard = (cardId, data, headers) =>
  socket.post(`/cards/${cardId}/gitlab-branch`, data, headers).then(transformBody);

/* Event handlers */

const makeHandleGitlabCardLinkCreate = (next) => (body) => {
  next(transformBody(body));
};

const makeHandleGitlabCardLinkUpdate = makeHandleGitlabCardLinkCreate;

const makeHandleGitlabCardLinkDelete = makeHandleGitlabCardLinkCreate;

export default {
  getGitlabCardLink,
  createGitlabIssueForCard,
  linkGitlabIssueToCard,
  unlinkGitlabIssueFromCard,
  createGitlabBranchForCard,
  makeHandleGitlabCardLinkCreate,
  makeHandleGitlabCardLinkUpdate,
  makeHandleGitlabCardLinkDelete,
};
