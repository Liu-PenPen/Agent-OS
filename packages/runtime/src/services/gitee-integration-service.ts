import {
  listEnterprisePrograms,
  type GiteeEnvConfig,
} from "../gitee/client.js";
import {
  resolveGiteeCredentials,
  updateStoredGiteeCredentials,
  viewGiteeCredentials,
  type GiteeCredentialsView,
  type UpdateGiteeCredentialsInput,
} from "../gitee/credentials.js";
import { GiteeProjectsStore } from "../gitee/projects.js";

export type GiteeIntegrationSnapshot = GiteeCredentialsView & {
  projectsConfigPath: string;
  projectsConfigViaEnv: boolean;
  allowlistCount: number;
};

export class GiteeIntegrationService {
  constructor(
    private readonly dataDir: string,
    private readonly projects: GiteeProjectsStore,
  ) {}

  async get(): Promise<GiteeIntegrationSnapshot> {
    const view = viewGiteeCredentials(this.dataDir);
    const allowlist = await this.projects.loadLocalAllowlist();
    const viaEnv = Boolean(
      process.env.ML_AOS_GITEE_PROJECTS_CONFIG?.trim() ||
        process.env.GITEE_PROJECTS_CONFIG?.trim(),
    );
    return {
      ...view,
      projectsConfigPath: this.projects.allowlistPath(),
      projectsConfigViaEnv: viaEnv,
      allowlistCount: allowlist.length,
    };
  }

  async update(
    input: UpdateGiteeCredentialsInput,
  ): Promise<GiteeIntegrationSnapshot> {
    updateStoredGiteeCredentials(input, this.dataDir);
    return this.get();
  }

  async testConnection(): Promise<{
    ok: boolean;
    message: string;
    programCount?: number;
  }> {
    let config: GiteeEnvConfig;
    try {
      config = resolveGiteeCredentials(this.dataDir);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "凭证不完整",
      };
    }
    try {
      const programs = await listEnterprisePrograms({ page: 1, perPage: 5 });
      return {
        ok: true,
        message: `连接成功（企业 ${config.enterpriseId}，可见 ${programs.length} 个项目样本）`,
        programCount: programs.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "连接失败";
      return { ok: false, message };
    }
  }
}
