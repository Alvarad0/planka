module.exports = {
  inputs: {
    id: {
      type: 'string',
      required: true,
    },
  },

  exits: {
    pathNotFound: {},
  },

  async fn(inputs) {
    const gitlabIntegration = await GitlabIntegration.qm.getOneById(inputs.id);

    if (!gitlabIntegration) {
      throw 'pathNotFound';
    }

    const project = await Project.qm.getOneById(gitlabIntegration.projectId);

    if (!project) {
      throw {
        pathNotFound: {
          gitlabIntegration,
        },
      };
    }

    return {
      gitlabIntegration,
      project,
    };
  },
};
