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

export type Collection = {
  id: string;
  name: string;
  rules: Rule[];
};

export type Result<T> =
  | { kind: "Error"; error: string }
  | { kind: "Ok"; value: T };


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


const syncTemplateToProject = async (
  sdk: SDK,
  collectionName: string,
  rules: Rule[]
): Promise<Result<number>> => {
  return { kind: "Ok", value: rules.length };
};

const getCollections = async (sdk: SDK): Promise<Result<Collection[]>> => {
  try {
    const db = await sdk.meta.db();
    const stmt = await db.prepare(`SELECT value FROM config WHERE key = ?`);
    const result = await stmt.get<{ value: string }>("global-match-replace-collections");
    
    if (result === undefined || result.value === undefined) {
      return { kind: "Ok", value: [] };
    }
    
    const collections = JSON.parse(result.value) as Collection[];
    return { kind: "Ok", value: collections };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to read collections: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const getSelectedCollectionId = async (sdk: SDK): Promise<Result<string | undefined>> => {
  try {
    const db = await sdk.meta.db();
    const stmt = await db.prepare(`SELECT value FROM config WHERE key = ?`);
    const result = await stmt.get<{ value: string }>("global-match-replace-selected-collection");
    
    if (result === undefined || result.value === undefined) {
      return { kind: "Ok", value: undefined };
    }
    
    return { kind: "Ok", value: result.value };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to read selected collection: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const saveCollections = async (sdk: SDK, collections: Collection[]): Promise<Result<void>> => {
  try {
    const db = await sdk.meta.db();
    const value = JSON.stringify(collections);
    const stmt = await db.prepare(`
      INSERT OR REPLACE INTO config (key, value) 
      VALUES (?, ?)
    `);
    await stmt.run("global-match-replace-collections", value);
    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to save collections: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const saveSelectedCollectionId = async (sdk: SDK, collectionId: string): Promise<Result<void>> => {
  try {
    const db = await sdk.meta.db();
    const stmt = await db.prepare(`
      INSERT OR REPLACE INTO config (key, value) 
      VALUES (?, ?)
    `);
    await stmt.run("global-match-replace-selected-collection", collectionId);
    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to save selected collection: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

export type API = DefineAPI<{
  getCurrentProject: typeof getCurrentProject;
  syncTemplateToProject: typeof syncTemplateToProject;
  getCollections: typeof getCollections;
  getSelectedCollectionId: typeof getSelectedCollectionId;
  saveCollections: typeof saveCollections;
  saveSelectedCollectionId: typeof saveSelectedCollectionId;
}>;

export async function init(sdk: SDK<API>) {
  // Create database table once at plugin startup
  const db = await sdk.meta.db();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  
  sdk.api.register("getCurrentProject", getCurrentProject);
  sdk.api.register("syncTemplateToProject", syncTemplateToProject);
  sdk.api.register("getCollections", getCollections);
  sdk.api.register("getSelectedCollectionId", getSelectedCollectionId);
  sdk.api.register("saveCollections", saveCollections);
  sdk.api.register("saveSelectedCollectionId", saveSelectedCollectionId);
}
