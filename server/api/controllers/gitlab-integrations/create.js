/**
 * @swagger
 * /projects/{projectId}/gitlab-integration:
 *   post:
 *     summary: Create GitLab integration
 *     description: Links a project to a GitLab project. Requires project manager or admin privileges. The webhook secret is returned only in this response and when it is rotated.
 *     tags:
 *       - GitLab Integrations
 *     operationId: createGitlabIntegration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: projectId
 *         in: path
 *         required: true
 *         description: ID of the project to link to GitLab
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - gitlabProject
 *             properties:
 *               gitlabProject:
 *                 type: string
 *                 maxLength: 255
 *                 description: Numeric ID or full path of the GitLab project
 *                 example: group/subgroup/project
 *               defaultBranch:
 *                 type: string
 *                 maxLength: 255
 *                 description: Branch new branches are created from (defaults to the GitLab default branch)
 *                 example: develop
 *     responses:
 *       200:
 *         description: GitLab integration created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *               properties:
 *                 item:
 *                   allOf:
 *                     - $ref: '#/components/schemas/GitlabIntegration'
 *                     - type: object
 *                       properties:
 *                         webhookUrl:
 *                           type: string
 *                           description: URL to configure as the GitLab webhook
 *                           example: https://planka.example.com/api/gitlab/webhooks/1357158568008091266
 *                         webhookSecret:
 *                           type: string
 *                           description: Secret token to configure in the GitLab webhook (shown only once)
 *                           example: 4ZpQd1L0yYb7Hn2sXw9TcVe3RkMa6UjF8gNqBoCi
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       422:
 *         $ref: '#/components/responses/UnprocessableEntity'
 */

const { idInput } = require('../../../utils/inputs');
const { GitlabErrors, gitlabExits, mapGitlabError } = require('../../../utils/gitlab-errors');

const WEBHOOK_SECRET_LENGTH = 40;

const Errors = {
  ...GitlabErrors,
  PROJECT_NOT_FOUND: {
    projectNotFound: 'Project not found',
  },
  GITLAB_INTEGRATION_ALREADY_EXISTS: {
    gitlabIntegrationAlreadyExists: 'GitLab integration already exists',
  },
  DEFAULT_BRANCH_MUST_BE_PRESENT: {
    defaultBranchMustBePresent: 'Default branch must be present',
  },
};

module.exports = {
  inputs: {
    projectId: {
      ...idInput,
      required: true,
    },
    gitlabProject: {
      type: 'string',
      isNotEmptyString: true,
      maxLength: 255,
      required: true,
    },
    defaultBranch: {
      type: 'string',
      isNotEmptyString: true,
      maxLength: 255,
    },
  },

  exits: {
    ...gitlabExits,
    projectNotFound: {
      responseType: 'notFound',
    },
    gitlabIntegrationAlreadyExists: {
      responseType: 'conflict',
    },
    defaultBranchMustBePresent: {
      responseType: 'unprocessableEntity',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    const project = await Project.qm.getOneById(inputs.projectId);

    if (!project) {
      throw Errors.PROJECT_NOT_FOUND;
    }

    if (currentUser.role !== User.Roles.ADMIN) {
      const isProjectManager = await sails.helpers.users.isProjectManager(
        currentUser.id,
        project.id,
      );

      if (!isProjectManager) {
        throw Errors.PROJECT_NOT_FOUND; // Forbidden
      }
    }

    const existingGitlabIntegration = await GitlabIntegration.qm.getOneByProjectId(project.id);

    if (existingGitlabIntegration) {
      throw Errors.GITLAB_INTEGRATION_ALREADY_EXISTS;
    }

    let gitlabProject;
    let notFoundError = Errors.GITLAB_PROJECT_NOT_FOUND;
    try {
      const client = sails.helpers.gitlab.makeClient();

      gitlabProject = await client.getProject(inputs.gitlabProject);

      if (inputs.defaultBranch) {
        notFoundError = Errors.GITLAB_BRANCH_NOT_FOUND;
        await client.getBranch(gitlabProject.id, inputs.defaultBranch);
      }
    } catch (error) {
      throw mapGitlabError(error, {
        notFoundError,
        projectId: project.id,
      });
    }

    // A GitLab project without commits has no default branch
    const defaultBranch = inputs.defaultBranch || gitlabProject.defaultBranch;

    if (!defaultBranch) {
      throw Errors.DEFAULT_BRANCH_MUST_BE_PRESENT;
    }

    const webhookSecret = sails.helpers.utils.generateRandomString(WEBHOOK_SECRET_LENGTH);

    let gitlabIntegration;
    try {
      gitlabIntegration = await GitlabIntegration.qm.createOne({
        defaultBranch,
        projectId: project.id,
        gitlabProjectId: gitlabProject.id,
        gitlabProjectPath: gitlabProject.pathWithNamespace,
        webhookSecretHash: sails.helpers.utils.hash(webhookSecret),
      });
    } catch (error) {
      // Lost a race with a concurrent request for the same project
      if (error.code === 'E_UNIQUE') {
        throw Errors.GITLAB_INTEGRATION_ALREADY_EXISTS;
      }

      throw error;
    }

    return {
      item: {
        ...sails.helpers.gitlabIntegrations.presentOne(gitlabIntegration),
        webhookSecret,
      },
    };
  },
};
