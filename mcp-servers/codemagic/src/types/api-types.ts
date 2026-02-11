/**
 * Codemagic API response types for Legacy and V3 APIs.
 */

// ---------------------------------------------------------------------------
// Legacy API Types
// ---------------------------------------------------------------------------

export interface CmWorkflow {
  readonly name: string;
  readonly instance_type?: string;
  readonly max_build_duration?: number;
}

export interface CmBranch {
  readonly workflowIds: string[];
}

export interface CmApp {
  readonly _id: string;
  readonly appName: string;
  readonly workflowIds: string[];
  readonly workflows: Record<string, CmWorkflow>;
  readonly branches: Record<string, CmBranch>;
  readonly repository?: {
    readonly url: string;
    readonly provider?: string;
  };
}

export interface CmAppsResponse {
  readonly applications: CmApp[];
}

export interface CmArtifact {
  readonly name: string;
  readonly type: string;
  readonly url: string;
  readonly md5: string;
  readonly size: number;
  readonly versionName?: string;
}

export interface CmBuild {
  readonly _id: string;
  readonly appId: string;
  readonly workflowId: string;
  readonly branch?: string;
  readonly tag?: string;
  readonly status: string;
  readonly buildProcessId?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly artefacts?: CmArtifact[];
  readonly config?: Record<string, unknown>;
}

export interface CmCache {
  readonly _id: string;
  readonly appId: string;
  readonly lastUsed?: string;
  readonly size?: number;
  readonly workflowId?: string;
}

// ---------------------------------------------------------------------------
// V3 API Types
// ---------------------------------------------------------------------------

export interface CmUser {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
  readonly avatarUrl?: string;
}

export interface CmTeam {
  readonly id: string;
  readonly name: string;
  readonly ownerId?: string;
  readonly createdAt?: string;
}

export interface CmTeamMember {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
  readonly role: string;
}

export interface CmAdvancedSecurity {
  readonly enabled: boolean;
  readonly selected_apps: string[];
}

export interface CmVariableGroup {
  readonly id: string;
  readonly name: string;
  readonly advanced_security?: CmAdvancedSecurity;
}

export interface CmVariable {
  readonly id: string;
  readonly name: string;
  readonly value?: string;
  readonly secure: boolean;
}

export interface V3BuildsResponse {
  readonly builds: CmBuild[];
  readonly total?: number;
}
