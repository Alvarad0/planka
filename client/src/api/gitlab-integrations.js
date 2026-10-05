import socket from './socket';

/* Transformers */

export const transformGitlabIntegration = (gitlabIntegration) => ({
  ...gitlabIntegration,
  ...(gitlabIntegration.lastSyncedAt && {
    lastSyncedAt: new Date(gitlabIntegration.lastSyncedAt),
  }),
  ...(gitlabIntegration.createdAt && {
    createdAt: new Date(gitlabIntegration.createdAt),
  }),
  ...(gitlabIntegration.updatedAt && {
    updatedAt: new Date(gitlabIntegration.updatedAt),
  }),
});

/* Actions */

const getGitlabIntegration = (projectId, headers) =>
  socket.get(`/projects/${projectId}/gitlab-integration`, undefined, headers).then((body) => ({
    ...body,
    item: transformGitlabIntegration(body.item),
  }));

const createGitlabIntegration = (projectId, data, headers) =>
  socket.post(`/projects/${projectId}/gitlab-integration`, data, headers).then((body) => ({
    ...body,
    item: transformGitlabIntegration(body.item),
  }));

const updateGitlabIntegration = (id, data, headers) =>
  socket.patch(`/gitlab-integrations/${id}`, data, headers).then((body) => ({
    ...body,
    item: transformGitlabIntegration(body.item),
  }));

const deleteGitlabIntegration = (id, headers) =>
  socket.delete(`/gitlab-integrations/${id}`, undefined, headers).then((body) => ({
    ...body,
    item: transformGitlabIntegration(body.item),
  }));

const testGitlabIntegrationConnection = (id, headers) =>
  socket.post(`/gitlab-integrations/${id}/test-connection`, undefined, headers).then((body) => ({
    ...body,
    item: transformGitlabIntegration(body.item),
  }));

const rotateGitlabIntegrationWebhookSecret = (id, headers) =>
  socket
    .post(`/gitlab-integrations/${id}/rotate-webhook-secret`, undefined, headers)
    .then((body) => ({
      ...body,
      item: transformGitlabIntegration(body.item),
    }));

export default {
  getGitlabIntegration,
  createGitlabIntegration,
  updateGitlabIntegration,
  deleteGitlabIntegration,
  testGitlabIntegrationConnection,
  rotateGitlabIntegrationWebhookSecret,
};
