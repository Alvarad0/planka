import socket from './socket';
import readGitlabSnapshot from '../utils/read-gitlab-snapshot';

/* Transformers */

const transformDates = (record, fieldNames) =>
  fieldNames.reduce(
    (result, fieldName) =>
      result[fieldName]
        ? {
            ...result,
            [fieldName]: new Date(result[fieldName]),
          }
        : result,
    record,
  );

export const transformGitlabIssue = (gitlabIssue) => transformDates(gitlabIssue, ['updatedAt']);

export const transformGitlabMergeRequest = (gitlabMergeRequest) =>
  transformDates(gitlabMergeRequest, ['createdAt', 'updatedAt', 'mergedAt']);

export const transformGitlabPipeline = (gitlabPipeline) =>
  transformDates(gitlabPipeline, ['createdAt', 'updatedAt']);

export const transformGitlabCommit = (gitlabCommit) => transformDates(gitlabCommit, ['createdAt']);

// The snapshot is always normalized to its current shape, so legacy links read the same way
const transformSnapshot = (snapshot) => {
  const { issue, mergeRequest, pipeline, ...rest } = readGitlabSnapshot(snapshot);

  return {
    ...rest,
    issue: transformGitlabIssue(issue),
    mergeRequest: mergeRequest && transformGitlabMergeRequest(mergeRequest),
    pipeline: pipeline && transformGitlabPipeline(pipeline),
  };
};

export const transformGitlabCardLink = (gitlabCardLink) => ({
  ...transformDates(gitlabCardLink, ['lastSyncedAt', 'createdAt', 'updatedAt']),
  ...('snapshot' in gitlabCardLink && {
    snapshot: transformSnapshot(gitlabCardLink.snapshot),
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
      ...(body.included.gitlabMergeRequest && {
        gitlabMergeRequest: transformGitlabMergeRequest(body.included.gitlabMergeRequest),
      }),
      ...(body.included.gitlabPipeline && {
        gitlabPipeline: transformGitlabPipeline(body.included.gitlabPipeline),
      }),
    },
  }),
});

/* Actions */

const getGitlabCardLink = (cardId, headers) =>
  socket.get(`/cards/${cardId}/gitlab`, undefined, headers).then(transformBody);

const syncGitlabCardLink = (cardId, headers) =>
  socket.post(`/cards/${cardId}/gitlab-sync`, undefined, headers).then(transformBody);

const createGitlabIssueForCard = (cardId, headers) =>
  socket.post(`/cards/${cardId}/gitlab-issue`, undefined, headers).then(transformBody);

const linkGitlabIssueToCard = (cardId, data, headers) =>
  socket.post(`/cards/${cardId}/gitlab-link`, data, headers).then(transformBody);

const unlinkGitlabIssueFromCard = (cardId, headers) =>
  socket.delete(`/cards/${cardId}/gitlab-link`, undefined, headers).then(transformBody);

const createGitlabBranchForCard = (cardId, data, headers) =>
  socket.post(`/cards/${cardId}/gitlab-branch`, data, headers).then(transformBody);

const createGitlabMergeRequestForCard = (cardId, headers) =>
  socket.post(`/cards/${cardId}/gitlab-merge-request`, undefined, headers).then(transformBody);

const getGitlabCommitsForCard = (cardId, headers) =>
  socket.get(`/cards/${cardId}/gitlab-commits`, undefined, headers).then((body) => ({
    ...body,
    items: body.items.map(transformGitlabCommit),
  }));

const getGitlabBranchSuggestionForCard = (cardId, headers) =>
  socket.get(`/cards/${cardId}/gitlab-branch-suggestion`, undefined, headers);

/* Event handlers */

const makeHandleGitlabCardLinkCreate = (next) => (body) => {
  next(transformBody(body));
};

const makeHandleGitlabCardLinkUpdate = makeHandleGitlabCardLinkCreate;

const makeHandleGitlabCardLinkDelete = makeHandleGitlabCardLinkCreate;

export default {
  getGitlabCardLink,
  syncGitlabCardLink,
  createGitlabIssueForCard,
  linkGitlabIssueToCard,
  unlinkGitlabIssueFromCard,
  createGitlabBranchForCard,
  createGitlabMergeRequestForCard,
  getGitlabCommitsForCard,
  getGitlabBranchSuggestionForCard,
  makeHandleGitlabCardLinkCreate,
  makeHandleGitlabCardLinkUpdate,
  makeHandleGitlabCardLinkDelete,
};
