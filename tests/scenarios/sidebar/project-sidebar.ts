import type { Project } from '../../../src/shared/contracts';
import {
  mainWorktreeFactory,
  projectConfigFactory,
  projectFactory,
} from '../../factories';

export interface ProjectSidebarScenario {
  homeDirectory: string;
  projects: Project[];
  firstProject: Project;
  secondProject: Project;
}

export function buildProjectSidebarScenario(): ProjectSidebarScenario {
  const firstProject = buildProject('trunk');
  const secondProject = buildProject('main');

  return {
    homeDirectory: '/Users/developer',
    projects: [firstProject, secondProject],
    firstProject,
    secondProject,
  };
}

function buildProject(mainBranch: string): Project {
  const projectConfig = projectConfigFactory.build();
  const mainWorktree = mainWorktreeFactory.build({
    id: `${projectConfig.id}:main`,
    projectId: projectConfig.id,
    path: projectConfig.path,
    branch: mainBranch,
  });

  return projectFactory.build(projectConfig, {
    associations: { worktrees: [mainWorktree] },
  });
}
