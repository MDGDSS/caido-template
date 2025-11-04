import type { DefineAPI, SDK } from "caido:plugin";

export type Project = {
  id: string;
  name: string;
};

export type Workflow = {
  id: string;
  name: string;
};

export type Rule = {
  id: string;
  name: string;
  section: string;
  matcher: string; // Matcher pattern/value
  value: string; // Replacer term (if term type)
  active: boolean;
  matcherType?: string; // "regex" | "full" | "string"
  replacerType?: string; // "term" | "workflow"
  condition?: string; // HTTPQL query
  workflowId?: string; // Workflow ID (if workflow replacer)
};

export type Result<T> =
  | { kind: "Error"; error: string }
  | { kind: "Ok"; value: T };

const getAllProjects = async (sdk: SDK): Promise<Result<Project[]>> => {
  try {
    const projects = await sdk.projects.getAll();
    const mapped = projects.map((p) => ({
      id: p.getId(),
      name: p.getName(),
    }));
    return { kind: "Ok", value: mapped };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sdk.console.error(`Failed to get all projects: ${message}`);
    return { kind: "Error", error: `Failed to get all projects: ${message}` };
  }
};

const getCurrentProject = async (sdk: SDK): Promise<Result<Project | undefined>> => {
  try {
    const current = await sdk.projects.getCurrent();
    if (current === undefined) {
      return { kind: "Ok", value: undefined };
    }
    return {
      kind: "Ok",
      value: {
        id: current.getId(),
        name: current.getName(),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sdk.console.error(`Failed to get current project: ${message}`);
    return { kind: "Error", error: `Failed to get current project: ${message}` };
  }
};

const getAllWorkflows = async (sdk: SDK): Promise<Result<Workflow[]>> => {
  try {
    if ("workflows" in sdk && typeof sdk.workflows === "object" && sdk.workflows !== null) {
      const workflowsObj = sdk.workflows as Record<string, unknown>;
      
      // getWorkflows() is synchronous and returns Workflow[] with id and name properties
      if ("getWorkflows" in workflowsObj && typeof workflowsObj.getWorkflows === "function") {
        const workflows = workflowsObj.getWorkflows() as Array<{ id: string; name: string }>;
        if (Array.isArray(workflows)) {
          const mapped = workflows.map((w) => ({
            id: w.id,
            name: w.name,
          }));
          sdk.console.log(`Retrieved ${mapped.length} workflows from backend SDK`);
          return { kind: "Ok", value: mapped };
        }
      }
    }
    
    // If workflows API is not available, return empty array
    sdk.console.warn("Workflows API not available in backend SDK");
    return { kind: "Ok", value: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sdk.console.error(`Failed to get all workflows: ${message}`);
    return { kind: "Error", error: `Failed to get all workflows: ${message}` };
  }
};

const syncTemplateToProject = async (
  sdk: SDK,
  collectionName: string,
  rules: Rule[]
): Promise<Result<number>> => {
  return { kind: "Ok", value: rules.length };
};

export type API = DefineAPI<{
  getAllProjects: typeof getAllProjects;
  getCurrentProject: typeof getCurrentProject;
  getAllWorkflows: typeof getAllWorkflows;
  syncTemplateToProject: typeof syncTemplateToProject;
}>;

export function init(sdk: SDK<API>) {
  sdk.api.register("getAllProjects", getAllProjects);
  sdk.api.register("getCurrentProject", getCurrentProject);
  sdk.api.register("getAllWorkflows", getAllWorkflows);
  sdk.api.register("syncTemplateToProject", syncTemplateToProject);
}
