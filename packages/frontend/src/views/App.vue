<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Checkbox from "primevue/checkbox";
import Dropdown from "primevue/dropdown";
import InputText from "primevue/inputtext";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import Textarea from "primevue/textarea";
import { computed, onMounted, ref, watch } from "vue";

import { useSDK } from "@/plugins/sdk";


const sdk = useSDK();
const hasSDK = computed(() => sdk !== undefined && sdk !== null);


const STORAGE_COLLECTIONS = "global-match-replace-collections";
const STORAGE_SELECTED_COLLECTION = "global-match-replace-selected-collection";


type Workspace = { id: string; name: string };
const workspaces = ref<Workspace[]>([]);
const selectedWorkspace = ref<Workspace | undefined>(undefined);
const isLoadingWorkspaces = ref(false);

const loadWorkspaces = async () => {
  isLoadingWorkspaces.value = true;
  try {
    
    const result = await sdk.backend.getAllProjects();
    if (result.kind === "Ok" && result.value.length > 0) {
      workspaces.value = result.value;
      const currentResult = await sdk.backend.getCurrentProject();
      if (currentResult.kind === "Ok" && currentResult.value !== undefined) {
        const current = workspaces.value.find((w) => w.id === currentResult.value?.id);
        selectedWorkspace.value = current ?? workspaces.value[0];
      } else {
      selectedWorkspace.value = workspaces.value[0];
      }
      isLoadingWorkspaces.value = false;
      return;
    }

    
    if ("graphql" in sdk && typeof sdk.graphql === "object" && sdk.graphql !== null && "query" in sdk.graphql) {
      try {
        const queries = [
          `query { projects(first: 100) { nodes { id name } } }`,
          `query { projects { nodes { id name } } }`,
          `query { projects { edges { node { id name } } } }`
        ];

        for (const query of queries) {
          try {
            const result = await (sdk.graphql as { query: <T>(q: string) => Promise<T> }).query<{ 
              projects?: { 
                nodes?: Array<{ id: string; name: string }> 
                edges?: Array<{ node: { id: string; name: string } }>
              } 
            }>(query);
            
            let nodes: Array<{ id: string; name: string }> = [];
            
            if (result?.projects) {
              if (Array.isArray(result.projects.nodes)) {
                nodes = result.projects.nodes;
              } else if (Array.isArray(result.projects.edges)) {
                nodes = result.projects.edges.map(e => e.node);
              }
            }
            
    if (nodes.length > 0) {
      workspaces.value = nodes.map((n) => ({ id: n.id, name: n.name }));
              const currentResult = await sdk.backend.getCurrentProject();
              if (currentResult.kind === "Ok" && currentResult.value !== undefined) {
                const current = workspaces.value.find((w) => w.id === currentResult.value?.id);
                selectedWorkspace.value = current ?? workspaces.value[0];
              } else {
      selectedWorkspace.value = workspaces.value[0];
              }
              isLoadingWorkspaces.value = false;
      return;
    }
          } catch {
            continue;
          }
        }
      } catch {
        
      }
    }

    
    const currentResult = await sdk.backend.getCurrentProject();
    if (currentResult.kind === "Ok" && currentResult.value !== undefined) {
      const w = { id: currentResult.value.id, name: currentResult.value.name };
      workspaces.value = [w];
      selectedWorkspace.value = w;
    } else {
      const fallback = { id: "current", name: "Current Project" };
      workspaces.value = [fallback];
      selectedWorkspace.value = fallback;
    }
  } catch {
    const currentResult = await sdk.backend.getCurrentProject();
    if (currentResult.kind === "Ok" && currentResult.value !== undefined) {
      const w = { id: currentResult.value.id, name: currentResult.value.name };
      workspaces.value = [w];
      selectedWorkspace.value = w;
    } else {
  const fallback = { id: "current", name: "Current Project" };
  workspaces.value = [fallback];
  selectedWorkspace.value = fallback;
    }
  } finally {
    isLoadingWorkspaces.value = false;
  }
};


type SectionOption = {
  label: string;
  value:
    | "RequestHeader"
    | "RequestBody"
    | "RequestMethod"
    | "RequestPath"
    | "RequestQuery"
    | "ResponseHeader"
    | "ResponseBody"
    | "ResponseStatusCode";
};

type Rule = {
  id: string;
  name: string;
  section: SectionOption["value"];
  matcher: string;
  value: string;
  active: boolean;
  matcherType?: string; 
  replacerType?: string; 
  condition?: string;
  workflowId?: string;
};

const sectionOptions: SectionOption[] = [
  { label: "Request Header", value: "RequestHeader" },
  { label: "Request Body", value: "RequestBody" },
  { label: "Request Method", value: "RequestMethod" },
  { label: "Request Path", value: "RequestPath" },
  { label: "Request Query", value: "RequestQuery" },
  { label: "Response Header", value: "ResponseHeader" },
  { label: "Response Body", value: "ResponseBody" },
  { label: "Response Status", value: "ResponseStatusCode" },
];


type Collection = {
  id: string;
  name: string;
  rules: Rule[];
};

const collections = ref<Collection[]>([]);
const selectedCollectionId = ref<string | undefined>(undefined);
const newCollectionName = ref<string>("");
const isCreatingCollection = ref(false);


const rules = computed(() => {
  const collection = collections.value.find(c => c.id === selectedCollectionId.value);
  return collection ? collection.rules : [];
});


const ensureGlobalPrefix = (name: string): string => {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("global")) {
    return trimmed;
  }
  return `Global ${trimmed}`;
};


const collectionName = computed(() => {
  const collection = collections.value.find(c => c.id === selectedCollectionId.value);
  return collection ? collection.name : "";
});




const availableProjectRules = ref<Array<{ id: string; name: string; collectionName: string }>>([]);
const selectedProjectRule = ref<string | undefined>(undefined);
const isLoadingProjectRules = ref(false);
const editingRuleId = ref<string | undefined>(undefined);
const editingRuleName = ref<string>("");


const canValidate = computed(() => {
  
  return collections.value.some(c => c.rules.length > 0 && c.name.trim().length > 0);
});


const normalizeHttpqlQuery = (query: string): string => {
  if (query.trim().length === 0) {
    return "";
  }
  let normalized = query.trim();
  normalized = normalized.replace(/~([^\s])/g, "~ $1");
  normalized = normalized.replace(/([^\s])~/g, "$1 ~");
  return normalized;
};


const load = () => {
  try {
    
    const storedCollections = localStorage.getItem(STORAGE_COLLECTIONS);
    if (storedCollections) {
      try {
        const parsed = JSON.parse(storedCollections) as unknown;
        
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validatedCollections: Collection[] = [];
          for (const col of parsed) {
            if (typeof col === "object" && col !== null) {
              const c = col as Record<string, unknown>;
              if (
                typeof c.id === "string" &&
                typeof c.name === "string" &&
                Array.isArray(c.rules)
              ) {
                
                const validatedRules: Rule[] = [];
                for (const rule of c.rules) {
                  if (typeof rule === "object" && rule !== null) {
                    const r = rule as Record<string, unknown>;
                    if (
                      typeof r.id === "string" &&
                      typeof r.name === "string" &&
                      typeof r.section === "string" &&
                      typeof r.matcher === "string" &&
                      typeof r.value === "string" &&
                      typeof r.active === "boolean"
                    ) {
                      const condition = r.condition && typeof r.condition === "string" 
                        ? normalizeHttpqlQuery(r.condition) 
                        : "";
                      
                      validatedRules.push({
                        id: r.id,
                        name: r.name,
                        section: r.section as SectionOption["value"],
                        matcher: r.matcher,
                        value: r.value,
                        active: r.active,
                        matcherType: typeof r.matcherType === "string" ? r.matcherType : "regex",
                        replacerType: typeof r.replacerType === "string" ? r.replacerType : "term",
                        condition,
                        workflowId: typeof r.workflowId === "string" ? r.workflowId : undefined,
                      });
                    }
                  }
                }
                validatedCollections.push({
                  id: c.id,
                  name: c.name,
                  rules: validatedRules,
                });
              }
            }
          }
          collections.value = validatedCollections;
        } else {
          
          const oldRules = localStorage.getItem("global-match-replace-rules");
          const oldName = localStorage.getItem("global-match-replace-collection-name");
          if (oldRules || oldName) {
            const defaultCollection: Collection = {
              id: `${Date.now()}`,
              name: oldName && oldName.trim().length > 0 ? ensureGlobalPrefix(oldName) : "Global Template",
              rules: [],
            };
            if (oldRules) {
              try {
                const parsedRules = JSON.parse(oldRules) as unknown;
                if (Array.isArray(parsedRules)) {
                  defaultCollection.rules = parsedRules as Rule[];
                }
              } catch {
                
              }
            }
            collections.value = [defaultCollection];
            selectedCollectionId.value = defaultCollection.id;
            persist();
            
            localStorage.removeItem("global-match-replace-rules");
            localStorage.removeItem("global-match-replace-collection-name");
          } else {
            
            const defaultCollection: Collection = {
              id: `${Date.now()}`,
              name: "Global Template",
              rules: [],
            };
            collections.value = [defaultCollection];
            selectedCollectionId.value = defaultCollection.id;
          }
        }
      } catch {
        
        const defaultCollection: Collection = {
          id: `${Date.now()}`,
          name: "Global Template",
          rules: [],
        };
        collections.value = [defaultCollection];
        selectedCollectionId.value = defaultCollection.id;
      }
    } else {
      
      const defaultCollection: Collection = {
        id: `${Date.now()}`,
        name: "Global Template",
        rules: [],
      };
      collections.value = [defaultCollection];
      selectedCollectionId.value = defaultCollection.id;
    }
    
    
    const storedSelected = localStorage.getItem(STORAGE_SELECTED_COLLECTION);
    if (storedSelected && storedSelected.trim().length > 0) {
      const found = collections.value.find(c => c.id === storedSelected);
      if (found) {
        selectedCollectionId.value = found.id;
      } else if (collections.value.length > 0) {
        selectedCollectionId.value = collections.value[0].id;
      }
    } else if (collections.value.length > 0) {
      selectedCollectionId.value = collections.value[0].id;
    }
  } catch {
    const defaultCollection: Collection = {
      id: `${Date.now()}`,
      name: "Global Template",
      rules: [],
    };
    collections.value = [defaultCollection];
    selectedCollectionId.value = defaultCollection.id;
  }
};

const persist = () => {
  try {
    
    if (selectedCollectionId.value) {
      const collection = collections.value.find(c => c.id === selectedCollectionId.value);
      if (collection) {
        
        collection.rules = rules.value.map(r => ({
          ...r,
          condition: r.condition && r.condition.trim().length > 0 ? normalizeHttpqlQuery(r.condition) : "",
        }));
      }
    }
    
    
    localStorage.setItem(STORAGE_COLLECTIONS, JSON.stringify(collections.value));
    if (selectedCollectionId.value) {
      localStorage.setItem(STORAGE_SELECTED_COLLECTION, selectedCollectionId.value);
    }
  } catch {
    if (sdk) {
      sdk.window.showToast("Failed to save collections", { variant: "error" });
    }
  }
};


const createCollection = () => {
  if (newCollectionName.value.trim().length === 0) {
    sdk.window.showToast("Collection name is required", { variant: "error" });
    return;
  }
  
  const name = ensureGlobalPrefix(newCollectionName.value);
  const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  collections.value.push({
    id,
    name,
    rules: [],
  });
  
  selectedCollectionId.value = id;
  newCollectionName.value = "";
  persist();
  sdk.window.showToast(`Collection "${name}" created`, { variant: "success" });
};

const deleteCollection = (collectionId: string) => {
  if (collections.value.length <= 1) {
    sdk.window.showToast("Cannot delete the last collection", { variant: "error" });
    return;
  }
  
  const collection = collections.value.find(c => c.id === collectionId);
  if (collection) {
    collections.value = collections.value.filter(c => c.id !== collectionId);
    
    
    if (selectedCollectionId.value === collectionId) {
      selectedCollectionId.value = collections.value[0]?.id;
    }
    
    persist();
    sdk.window.showToast(`Collection "${collection.name}" deleted`, { variant: "success" });
  }
};

const switchCollection = (collectionId: string | undefined) => {
  if (collectionId) {
    selectedCollectionId.value = collectionId;
    persist();
  }
};


onMounted(() => {
  
  load();
  
  
  if (hasSDK.value && sdk) {
    
    const loadCurrentProjectOnly = async () => {
      try {
        const currentResult = await sdk.backend.getCurrentProject();
        if (currentResult.kind === "Ok" && currentResult.value !== undefined) {
          const w = { id: currentResult.value.id, name: currentResult.value.name };
          workspaces.value = [w];
          selectedWorkspace.value = w;
        } else {
          const fallback = { id: "current", name: "Current Project" };
          workspaces.value = [fallback];
          selectedWorkspace.value = fallback;
        }
      } catch {
        
        const fallback = { id: "current", name: "Current Project" };
        workspaces.value = [fallback];
        selectedWorkspace.value = fallback;
      }
    };
    loadCurrentProjectOnly();
  } else {
    
    watch(hasSDK, (available) => {
      if (available && sdk) {
        const loadCurrentProjectOnly = async () => {
          try {
            const currentResult = await sdk.backend.getCurrentProject();
            if (currentResult.kind === "Ok" && currentResult.value !== undefined) {
              const w = { id: currentResult.value.id, name: currentResult.value.name };
              workspaces.value = [w];
              selectedWorkspace.value = w;
            } else {
              const fallback = { id: "current", name: "Current Project" };
              workspaces.value = [fallback];
              selectedWorkspace.value = fallback;
            }
          } catch {
            
            const fallback = { id: "current", name: "Current Project" };
            workspaces.value = [fallback];
            selectedWorkspace.value = fallback;
          }
        };
        loadCurrentProjectOnly();
      }
    }, { immediate: true });
  }
});


const removeRule = (id: string) => {
  if (selectedCollectionId.value) {
    const collection = collections.value.find(c => c.id === selectedCollectionId.value);
    if (collection) {
      collection.rules = collection.rules.filter((r) => r.id !== id);
      persist();
    }
  }
};

const toggleActive = (id: string, value: boolean) => {
  if (selectedCollectionId.value) {
    const collection = collections.value.find(c => c.id === selectedCollectionId.value);
    if (collection) {
      const rule = collection.rules.find((r) => r.id === id);
      if (rule) {
        rule.active = value;
        persist();
      }
    }
  }
};

// Import from file
const fileInputRef = ref<HTMLInputElement | null>(null);
const isImportingFile = ref(false);

const triggerFileImport = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
};

// Helper to parse GraphQL export format rule
const parseGraphQLRule = (item: Record<string, unknown>): Rule | undefined => {
  try {
    const name = typeof item.name === "string" ? item.name : "";
    if (name.length === 0) return undefined;

    // Parse section from nested structure
    let sectionType: SectionOption["value"] = "RequestHeader";
    let matcher = "";
    let matcherType: "regex" | "full" | "string" = "regex";
    let value = "";
    let replacerType: "term" | "workflow" = "term";
    let workflowId: string | undefined = undefined;

    if (item.section && typeof item.section === "object") {
      const section = item.section as Record<string, unknown>;
      
      
      const sectionKind = (section.__typename as string) || (section.kind as string) || "";
      if (sectionKind.includes("RequestHeader")) sectionType = "RequestHeader";
      else if (sectionKind.includes("RequestBody")) sectionType = "RequestBody";
      else if (sectionKind.includes("RequestMethod")) sectionType = "RequestMethod";
      else if (sectionKind.includes("RequestPath")) sectionType = "RequestPath";
      else if (sectionKind.includes("RequestQuery")) sectionType = "RequestQuery";
      else if (sectionKind.includes("ResponseHeader")) sectionType = "ResponseHeader";
      else if (sectionKind.includes("ResponseBody")) sectionType = "ResponseBody";
      else if (sectionKind.includes("ResponseStatusCode")) sectionType = "ResponseStatusCode";

      
      if (section.operation && typeof section.operation === "object") {
        const operation = section.operation as Record<string, unknown>;
        
        
        if (operation.matcher && typeof operation.matcher === "object") {
          const matcherObj = operation.matcher as Record<string, unknown>;
          const matcherKind = (matcherObj.__typename as string) || (matcherObj.kind as string) || "";
          
          
          if (matcherKind.includes("MatcherRegex") || matcherKind.includes("TamperMatcherRegex")) {
            matcherType = "regex";
            // Try regex field first, then name field
            matcher = typeof matcherObj.regex === "string" ? matcherObj.regex : (typeof matcherObj.name === "string" ? matcherObj.name : "");
          } else if (matcherKind.includes("MatcherName") || matcherKind.includes("TamperMatcherName")) {
            matcherType = "regex";
            matcher = typeof matcherObj.name === "string" ? matcherObj.name : "";
          } else if (matcherKind.includes("MatcherRawValue") || matcherKind.includes("TamperMatcherRawValue")) {
            matcherType = "string";
            matcher = typeof matcherObj.value === "string" ? matcherObj.value : "";
          } else if (matcherKind.includes("MatcherRawFull") || matcherKind.includes("TamperMatcherRawFull")) {
            matcherType = "full";
            matcher = "";
          } else if (matcherKind.includes("MatcherRaw") || matcherKind.includes("TamperMatcherRaw")) {
            // Nested raw matcher
            if (matcherObj.raw && typeof matcherObj.raw === "object") {
              const raw = matcherObj.raw as Record<string, unknown>;
              const rawKind = (raw.__typename as string) || (raw.kind as string) || "";
              if (rawKind.includes("MatcherRawRegex") || rawKind.includes("TamperMatcherRawRegex")) {
                matcherType = "regex";
                matcher = typeof raw.regex === "string" ? raw.regex : "";
              } else if (rawKind.includes("MatcherRawValue") || rawKind.includes("TamperMatcherRawValue")) {
                matcherType = "string";
                matcher = typeof raw.value === "string" ? raw.value : "";
              } else if (rawKind.includes("MatcherRawFull") || rawKind.includes("TamperMatcherRawFull")) {
                matcherType = "full";
                matcher = "";
              }
            }
          } else if (typeof matcherObj.regex === "string") {
            // Fallback: try regex field directly
            matcher = matcherObj.regex;
            matcherType = "regex";
          } else if (typeof matcherObj.name === "string") {
            // Fallback: try name field
            matcher = matcherObj.name;
            matcherType = "regex";
          }
        }

        
        if (operation.replacer && typeof operation.replacer === "object") {
          const replacerObj = operation.replacer as Record<string, unknown>;
          const replacerKind = (replacerObj.__typename as string) || (replacerObj.kind as string) || "";
          
          if (replacerKind.includes("ReplacerTerm") || replacerKind.includes("TamperReplacerTerm")) {
            replacerType = "term";
            value = typeof replacerObj.term === "string" ? replacerObj.term : "";
          } else if (replacerKind.includes("ReplacerWorkflow") || replacerKind.includes("TamperReplacerWorkflow")) {
            replacerType = "workflow";
            workflowId = typeof replacerObj.workflowId === "string" ? replacerObj.workflowId : undefined;
            value = ""; 
          }
        }
      }
    }

    
    let condition = "";
    if (item.condition && typeof item.condition === "string" && item.condition.trim().length > 0) {
      condition = normalizeHttpqlQuery(item.condition);
    } else if (item.query && typeof item.query === "string" && item.query.trim().length > 0) {
      condition = normalizeHttpqlQuery(item.query);
    }

    
    let active = true;
    if (typeof item.active === "boolean") {
      active = item.active;
    } else if (typeof item.enabled === "boolean") {
      active = item.enabled;
    } else if (typeof item.enable === "boolean") {
      active = item.enable;
    } else if (typeof item.isEnabled === "boolean") {
      active = item.isEnabled;
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Generate new ID
      name,
      section: sectionType,
      matcher,
      value,
      active,
      matcherType,
      replacerType,
      condition,
      workflowId,
    };
  } catch {
    return undefined;
  }
};

const importFromFile = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;

  if (!selectedCollectionId.value) {
    sdk.window.showToast("Please select a collection first", { variant: "error" });
    return;
  }

  isImportingFile.value = true;
  const allImportedRules: Rule[] = [];
  let fileCount = 0;

  try {
    // Process all selected files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        let parsedData: unknown;
        try {
          parsedData = JSON.parse(text);
        } catch {
          continue; 
        }

        
        const items = Array.isArray(parsedData) ? parsedData : [parsedData];

        for (const item of items) {
          if (typeof item === "object" && item !== null) {
            const rule = item as Record<string, unknown>;
            
            // A revoir celui-la
            if (rule.__typename || (rule.section && typeof rule.section === "object" && "operation" in (rule.section as Record<string, unknown>))) {
              const parsedRule = parseGraphQLRule(rule);
              if (parsedRule) {
                allImportedRules.push(parsedRule);
                continue;
              }
            }
            
            // Try simple format (flat structure)
            if (
              typeof rule.name === "string" &&
              typeof rule.section === "string" &&
              typeof rule.matcher === "string" &&
              typeof rule.value === "string"
            ) {
              const normalizedCondition = rule.condition && typeof rule.condition === "string" && rule.condition.trim().length > 0
                ? normalizeHttpqlQuery(rule.condition) 
                : "";
              
              allImportedRules.push({
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                name: rule.name,
                section: rule.section as SectionOption["value"],
                matcher: rule.matcher,
                value: rule.value,
                active: typeof rule.active === "boolean" ? rule.active : (typeof rule.enabled === "boolean" ? rule.enabled : true),
                matcherType: typeof rule.matcherType === "string" ? rule.matcherType : "regex",
                replacerType: typeof rule.replacerType === "string" ? rule.replacerType : "term",
                condition: normalizedCondition,
                workflowId: typeof rule.workflowId === "string" ? rule.workflowId : undefined,
              });
            }
          }
        }
        fileCount++;
      } catch {
        // Continue with next file
      }
    }

    if (allImportedRules.length === 0) {
      sdk.window.showToast("No valid rules found in selected files", { variant: "warning" });
      return;
    }

    // Add imported rules to selected collection
    const collection = collections.value.find(c => c.id === selectedCollectionId.value);
    if (collection) {
      collection.rules.push(...allImportedRules);
      try {
        persist();
        const fileText = fileCount === 1 ? "file" : "files";
        sdk.window.showToast(`Imported ${allImportedRules.length} rule(s) from ${fileCount} ${fileText}`, { variant: "success" });
      } catch {
        sdk.window.showToast(`Imported ${allImportedRules.length} rule(s) but failed to save`, { variant: "warning" });
      }
    }
    
    // Reset file input
    if (target) {
      target.value = "";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sdk.window.showToast(`Failed to import files: ${message}`, { variant: "error" });
  } finally {
    isImportingFile.value = false;
  }
};

// Load rules from current project  
// Une fois le listener de chgt de projet dispo modifier cette partie aussi
const loadProjectRules = async () => {
  if (!hasSDK.value || !sdk) return;
  
  isLoadingProjectRules.value = true;
  try {
    const collections = await sdk.matchReplace.getCollections();
    let allRules: Array<{ id: string; name: string; section: unknown; enabled?: boolean; query?: string }> = [];
    
    try {
      allRules = sdk.matchReplace.getRules();
    } catch {
      availableProjectRules.value = [];
      isLoadingProjectRules.value = false;
      return;
    }

    // Build list of rules with their collection names
    const rulesWithCollection: Array<{ id: string; name: string; collectionName: string }> = [];
    
    for (const collection of collections) {
      const collectionRuleIds = collection.ruleIds || [];
      for (const ruleId of collectionRuleIds) {
        const rule = allRules.find(r => r.id === ruleId);
        if (rule) {
          rulesWithCollection.push({
            id: rule.id,
            name: rule.name,
            collectionName: collection.name,
          });
        }
      }
    }
    
    availableProjectRules.value = rulesWithCollection;
  } catch {
    availableProjectRules.value = [];
  } finally {
    isLoadingProjectRules.value = false;
  }
};

// Import a single rule from current project
const importProjectRule = async () => {
  if (!selectedProjectRule.value || !hasSDK.value || !sdk) {
    sdk.window.showToast("Please select a rule to import", { variant: "error" });
    return;
  }

  try {
    const allRules = sdk.matchReplace.getRules();
    const rule = allRules.find(r => r.id === selectedProjectRule.value);
    
    if (!rule) {
      sdk.window.showToast("Rule not found", { variant: "error" });
      return;
    }

    const section = rule.section;
    let sectionType: SectionOption["value"] = "RequestHeader";
    let matcher = "";
    let matcherType: "regex" | "full" | "string" = "regex";
    let value = "";
    let replacerType: "term" | "workflow" = "term";
    let workflowId: string | undefined = undefined;

    // Parse section based on type
    if (section && typeof section === "object") {
      if ("kind" in section) {
        const kind = section.kind as string;
        if (kind.includes("RequestHeader")) sectionType = "RequestHeader";
        else if (kind.includes("RequestBody")) sectionType = "RequestBody";
        else if (kind.includes("RequestMethod")) sectionType = "RequestMethod";
        else if (kind.includes("RequestPath")) sectionType = "RequestPath";
        else if (kind.includes("RequestQuery")) sectionType = "RequestQuery";
        else if (kind.includes("ResponseHeader")) sectionType = "ResponseHeader";
        else if (kind.includes("ResponseBody")) sectionType = "ResponseBody";
        else if (kind.includes("ResponseStatusCode")) sectionType = "ResponseStatusCode";

        // Extract operation details
        if ("operation" in section && section.operation && typeof section.operation === "object") {
          const op = section.operation as Record<string, unknown>;
          
          // Parse matcher
          if ("matcher" in op && op.matcher && typeof op.matcher === "object") {
            const m = op.matcher as Record<string, unknown>;
            if ("kind" in m) {
              const matcherKind = m.kind as string;
              if (matcherKind.includes("MatcherRawRegex") || matcherKind.includes("MatcherRegex")) {
                matcherType = "regex";
                matcher = typeof m.regex === "string" ? m.regex : (typeof m.name === "string" ? m.name : "");
              } else if (matcherKind.includes("MatcherRawValue") || matcherKind.includes("MatcherValue")) {
                matcherType = "string";
                matcher = typeof m.value === "string" ? m.value : "";
              } else if (matcherKind.includes("MatcherRawFull") || matcherKind.includes("MatcherFull")) {
                matcherType = "full";
                matcher = "";
              } else if (matcherKind.includes("MatcherName")) {
                matcherType = "regex";
                matcher = typeof m.name === "string" ? m.name : "";
              } else if ("raw" in m && typeof m.raw === "object") {
                const raw = m.raw as Record<string, unknown>;
                if (raw.kind && typeof raw.kind === "string") {
                  if (raw.kind.includes("MatcherRawRegex")) {
                    matcherType = "regex";
                    matcher = typeof raw.regex === "string" ? raw.regex : "";
                  } else if (raw.kind.includes("MatcherRawValue")) {
                    matcherType = "string";
                    matcher = typeof raw.value === "string" ? raw.value : "";
                  } else if (raw.kind.includes("MatcherRawFull")) {
                    matcherType = "full";
                    matcher = "";
                  }
                }
              }
            } else if ("name" in m && typeof m.name === "string") {
              matcher = m.name;
            }
          }
          
          // Parse replacer
          if ("replacer" in op && op.replacer && typeof op.replacer === "object") {
            const r = op.replacer as Record<string, unknown>;
            if ("kind" in r) {
              const replacerKind = r.kind as string;
              if (replacerKind.includes("ReplacerWorkflow")) {
                replacerType = "workflow";
                workflowId = typeof r.workflowId === "string" ? r.workflowId : undefined;
                value = "";
              } else if (replacerKind.includes("ReplacerTerm")) {
                replacerType = "term";
                value = typeof r.term === "string" ? r.term : "";
              }
            } else if ("term" in r && typeof r.term === "string") {
              value = r.term;
            } else if ("raw" in r && typeof r.raw === "string") {
              value = r.raw;
            }
          }
        }
      }
    }

    // Try to extract condition/query if available 
    let condition = "";
    if ("query" in rule && typeof rule.query === "string" && rule.query.trim().length > 0) {
      condition = normalizeHttpqlQuery(rule.query);
    }

    const importedRule: Rule = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: rule.name || sectionType,
      section: sectionType,
      matcher,
      value: value || "",
      active: rule.enabled ?? true,
      matcherType,
      replacerType,
      condition,
      workflowId,
    };

    if (!selectedCollectionId.value) {
      sdk.window.showToast("Please select a collection first", { variant: "error" });
      return;
    }

    const collection = collections.value.find(c => c.id === selectedCollectionId.value);
    if (collection) {
      collection.rules.push(importedRule);
      persist();
      selectedProjectRule.value = undefined;
      sdk.window.showToast(`Imported rule "${importedRule.name}"`, { variant: "success" });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sdk.window.showToast(`Failed to import rule: ${message}`, { variant: "error" });
  }
};

// Edit rule name
const startEditingName = (rule: Rule) => {
  editingRuleId.value = rule.id;
  editingRuleName.value = rule.name;
};

const cancelEditingName = () => {
  editingRuleId.value = undefined;
  editingRuleName.value = "";
};

const saveRuleName = (ruleId: string) => {
  if (selectedCollectionId.value) {
    const collection = collections.value.find(c => c.id === selectedCollectionId.value);
    if (collection) {
      const idx = collection.rules.findIndex(r => r.id === ruleId);
      if (idx >= 0 && editingRuleName.value.trim().length > 0) {
        collection.rules[idx].name = editingRuleName.value.trim();
        persist();
        editingRuleId.value = undefined;
        editingRuleName.value = "";
        if (sdk) {
          sdk.window.showToast("Rule name updated", { variant: "success" });
        }
      } else {
        cancelEditingName();
      }
    }
  }
};



// Helper to build matcher based on type
const buildMatcher = (matcherType: string | undefined, matcherValue: string) => {
  const value = matcherValue ?? "";
  if (matcherType === "full") {
    return { kind: "MatcherRawFull" } as const;
  }
  if (matcherType === "regex") {
    return { kind: "MatcherRawRegex", regex: value } as const;
  }
  if (matcherType === "string") {
    return { kind: "MatcherRawValue", value } as const;
  }
  // Default to regex
  return { kind: "MatcherRawRegex", regex: value } as const;
};

// Helper to build replacer based on type
const buildReplacer = (replacerType: string | undefined, termValue: string, workflowId: string | undefined) => {
  if (replacerType === "workflow" && workflowId !== undefined && workflowId.trim().length > 0) {
    return { kind: "ReplacerWorkflow", workflowId } as const;
  }
  const term = termValue ?? "";
  return { kind: "ReplacerTerm", term } as const;
};

// Helper to convert rule to section
const toSection = (r: Rule) => {
  const matcherType = r.matcherType ?? "regex";
  const replacerType = r.replacerType ?? "term";
  const replacer = buildReplacer(replacerType, r.value, r.workflowId);

  if (r.section === "RequestHeader") {
    const matcherValue = r.matcher && r.matcher.trim().length > 0 ? r.matcher : "";
    // For regex/string/full matchers, use OperationHeaderRaw (same as OperationPathRaw/OperationQueryRaw)
    // Based on SDK docs: OperationHeaderRaw has matcher: MatchReplaceMatcherRaw directly
    if (matcherType === "regex" || matcherType === "string" || matcherType === "full") {
      const rawMatcher = buildMatcher(matcherType, matcherValue || "");
    return {
      kind: "SectionRequestHeader",
      operation: {
          kind: "OperationHeaderRaw",
          matcher: rawMatcher,
          replacer,
        },
      } as const;
    }
    // For header name matching, use OperationHeaderUpdate
    return {
      kind: "SectionRequestHeader",
      operation: {
        kind: "OperationHeaderUpdate",
        matcher: { kind: "MatcherName", name: matcherValue },
        replacer,
      },
    } as const;
  }
  if (r.section === "RequestBody") {
    const rawMatcher = buildMatcher(matcherType, r.matcher);
    return {
      kind: "SectionRequestBody",
      operation: {
        kind: "OperationBodyRaw",
        matcher: { kind: "MatcherRaw", raw: rawMatcher },
        replacer,
      },
    } as const;
  }
  if (r.section === "RequestMethod") {
    return {
      kind: "SectionRequestMethod",
      operation: {
        kind: "OperationMethodUpdate",
        replacer,
      },
    } as const;
  }
  if (r.section === "RequestPath") {
    return {
      kind: "SectionRequestPath",
      operation: {
        kind: "OperationPathUpdate",
        matcher: { kind: "MatcherName", name: r.matcher },
        replacer,
      },
    } as const;
  }
  if (r.section === "RequestQuery") {
    return {
      kind: "SectionRequestQuery",
      operation: {
        kind: "OperationQueryUpdate",
        matcher: { kind: "MatcherName", name: r.matcher },
        replacer,
      },
    } as const;
  }
  if (r.section === "ResponseHeader") {
    const matcherValue = r.matcher && r.matcher.trim().length > 0 ? r.matcher : "";
    // For regex/string/full matchers, use OperationHeaderRaw (same as OperationPathRaw/OperationQueryRaw)
    // Based on SDK docs: OperationHeaderRaw has matcher: MatchReplaceMatcherRaw directly
    if (matcherType === "regex" || matcherType === "string" || matcherType === "full") {
      const rawMatcher = buildMatcher(matcherType, matcherValue || "");
    return {
      kind: "SectionResponseHeader",
      operation: {
          kind: "OperationHeaderRaw",
          matcher: rawMatcher,
          replacer,
        },
      } as const;
    }
    // For header name matching, use OperationHeaderUpdate
    return {
      kind: "SectionResponseHeader",
      operation: {
        kind: "OperationHeaderUpdate",
        matcher: { kind: "MatcherName", name: matcherValue },
        replacer,
      },
    } as const;
  }
  if (r.section === "ResponseBody") {
    const rawMatcher = buildMatcher(matcherType, r.matcher);
    return {
      kind: "SectionResponseBody",
      operation: {
        kind: "OperationBodyRaw",
        matcher: { kind: "MatcherRaw", raw: rawMatcher },
        replacer,
      },
    } as const;
  }
  return {
    kind: "SectionResponseStatusCode",
    operation: {
      kind: "OperationStatusCodeUpdate",
      replacer,
    },
  } as const;
};

// Sync functions
// TODO Sync only New rules or duplicate old if value local value modified
const onSyncToSelected = async () => {
  if (collections.value.length === 0) {
    sdk.window.showToast("No collections to sync", { variant: "error" });
    return;
  }

  // Check if at least one collection has rules
  const hasRules = collections.value.some(c => c.rules.length > 0);
  if (!hasRules) {
    sdk.window.showToast("At least one collection must have rules", { variant: "error" });
    return;
  }

  if (selectedWorkspace.value === undefined) {
    sdk.window.showToast("Please select a project", { variant: "error" });
    return;
  }

  try {
    const currentResult = await sdk.backend.getCurrentProject();
    if (currentResult.kind === "Ok") {
      const currentId = currentResult.value?.id;
      if (currentId !== selectedWorkspace.value.id && selectedWorkspace.value.id !== "current") {
        if ("projects" in sdk && typeof sdk.projects === "object" && sdk.projects !== null && "switch" in sdk.projects) {
          await (sdk.projects as { switch: (id: string) => Promise<void> }).switch(selectedWorkspace.value.id);
        } else if ("projects" in sdk && typeof sdk.projects === "object" && sdk.projects !== null && "setCurrent" in sdk.projects) {
          await (sdk.projects as { setCurrent: (id: string) => Promise<void> }).setCurrent(selectedWorkspace.value.id);
        }
      }
    }

    // Get existing collections in the project
    const existingCollections = await sdk.matchReplace.getCollections();
    
    let totalCollectionsSynced = 0;
    let totalRulesSynced = 0;
    const failedCollections: string[] = [];

    // Sync all collections
    for (const collection of collections.value) {
      // Skip collections with no rules
      if (collection.rules.length === 0) {
        continue;
      }

      const name = collection.name.trim();
      if (name.length === 0) {
        continue;
      }

      try {
        // Delete existing collection if it exists
        const existing = existingCollections.find((c) => c.name === name);
        if (existing !== undefined) {
          await sdk.matchReplace.deleteCollection(existing.id);
        }

        // Create new collection
        const created = await sdk.matchReplace.createCollection({ name });

        // Create rules for this collection
        let ruleCount = 0;
        for (const r of collection.rules) {
          try {
            const section = toSection(r);
            // Ensure operation is always present and properly structured
            if (section.operation === undefined) {
              continue;
            }
            // Normalize condition if present, otherwise leave empty
            const query = r.condition !== undefined && r.condition.trim().length > 0 
              ? normalizeHttpqlQuery(r.condition) 
              : "";
            
            // Validate section structure before passing to SDK
            if (!section || typeof section !== "object" || !("kind" in section)) {
              continue;
            }
            
            if (!section.operation || typeof section.operation !== "object" || !("kind" in section.operation)) {
              continue;
            }
            
            const rule = await sdk.matchReplace.createRule({
              collectionId: created.id,
              name: r.name !== undefined && r.name.length > 0 ? r.name : r.section,
              query,
              section,
            });
            await sdk.matchReplace.toggleRule(rule.id, r.active);
            ruleCount += 1;
          } catch {
            // pas la wwe hein
          }
        }

        totalCollectionsSynced += 1;
        totalRulesSynced += ruleCount;
      } catch {
        failedCollections.push(name);
      }
    }

    if (failedCollections.length > 0) {
      sdk.window.showToast(
        `Synced ${totalCollectionsSynced} collection(s) with ${totalRulesSynced} rule(s). Failed: ${failedCollections.join(", ")}`,
        { variant: "warning" }
      );
    } else {
      sdk.window.showToast(
        `Synced ${totalCollectionsSynced} collection(s) with ${totalRulesSynced} rule(s) to "${selectedWorkspace.value.name}"`,
        { variant: "success" }
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    sdk.window.showToast(`Failed to sync collections: ${message}`, { variant: "error" });
  }
};

const onSyncToAllProjects = async () => {
  const name = collectionName.value.trim();
  if (name.length === 0) {
    sdk.window.showToast("Collection name is required", { variant: "error" });
    return;
  }
  if (!Array.isArray(rules.value) || rules.value.length === 0) {
    sdk.window.showToast("Add at least one rule", { variant: "error" });
    return;
  }

  if (workspaces.value.length === 0) {
    sdk.window.showToast("No projects available", { variant: "error" });
    return;
  }

  const currentResult = await sdk.backend.getCurrentProject();
  const originalProjectId = currentResult.kind === "Ok" ? currentResult.value?.id : undefined;

  try {
    let successCount = 0;
    let failCount = 0;

    for (const workspace of workspaces.value) {
      if (workspace.id === "current") {
        continue;
      }

      try {
        if ("projects" in sdk && typeof sdk.projects === "object" && sdk.projects !== null && "switch" in sdk.projects) {
          await (sdk.projects as { switch: (id: string) => Promise<void> }).switch(workspace.id);
        } else if ("projects" in sdk && typeof sdk.projects === "object" && sdk.projects !== null && "setCurrent" in sdk.projects) {
          await (sdk.projects as { setCurrent: (id: string) => Promise<void> }).setCurrent(workspace.id);
        }

        
    const collections = await sdk.matchReplace.getCollections();
        const existing = collections.find((c) => c.name === name);
        if (existing !== undefined) {
      await sdk.matchReplace.deleteCollection(existing.id);
    }

    
    const created = await sdk.matchReplace.createCollection({ name });

        
    for (const r of rules.value) {
          try {
      const section = toSection(r);
            
            if (section.operation === undefined) {
              continue;
            }
            
            const query = r.condition !== undefined && r.condition.trim().length > 0 
              ? normalizeHttpqlQuery(r.condition) 
              : "";
            
            
            if (!section || typeof section !== "object" || !("kind" in section)) {
              continue;
            }
            
            if (!section.operation || typeof section.operation !== "object" || !("kind" in section.operation)) {
              continue;
            }
            
      const rule = await sdk.matchReplace.createRule({
        collectionId: created.id,
              name: r.name !== undefined && r.name.length > 0 ? r.name : r.section,
              query,
              section,
      });
      await sdk.matchReplace.toggleRule(rule.id, r.active);
          } catch {
            
          }
        }

        successCount += 1;
      } catch {
        failCount += 1;
      }
    }

    if (originalProjectId !== undefined) {
      if ("projects" in sdk && typeof sdk.projects === "object" && sdk.projects !== null && "switch" in sdk.projects) {
        await (sdk.projects as { switch: (id: string) => Promise<void> }).switch(originalProjectId);
      } else if ("projects" in sdk && typeof sdk.projects === "object" && sdk.projects !== null && "setCurrent" in sdk.projects) {
        await (sdk.projects as { setCurrent: (id: string) => Promise<void> }).setCurrent(originalProjectId);
      }
    }

    if (failCount === 0) {
      sdk.window.showToast(`Successfully synced to ${successCount} project(s)`, { variant: "success" });
    } else {
      sdk.window.showToast(`Synced to ${successCount} project(s), failed ${failCount}`, { variant: "warning" });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    sdk.window.showToast(`Failed to sync to all projects: ${message}`, { variant: "error" });
  }
};

const refreshCurrentProject = async () => {
  if (!hasSDK.value || !sdk) return;
  
  try {
    const currentResult = await sdk.backend.getCurrentProject();
    if (currentResult.kind === "Ok" && currentResult.value !== undefined) {
      const w = { id: currentResult.value.id, name: currentResult.value.name };
      workspaces.value = [w];
      selectedWorkspace.value = w;
      if (sdk) {
        sdk.window.showToast("Project refreshed", { variant: "success" });
      }
    } else {
      const fallback = { id: "current", name: "Current Project" };
      workspaces.value = [fallback];
      selectedWorkspace.value = fallback;
    }
  } catch {
    if (sdk) {
      sdk.window.showToast("Failed to refresh project", { variant: "error" });
    }
  }
};

const onStartOnGitHub = () => {
  const githubUrl = "https://github.com/MDGDSS/caido-template";
  window.open(githubUrl, "_blank");
};
</script>

<template>
  <div class="h-full flex flex-col gap-2 p-2" style="overflow: hidden;">
    <div class="flex items-center gap-2">
      <span class="text-sm text-surface-400">Workspace:</span>
      <span class="text-sm text-surface-200 px-2 py-1 bg-surface-800 rounded" style="min-width: 200px;">
        {{ selectedWorkspace?.name || "No workspace selected" }}
      </span>
      <Button 
        icon="fas fa-sync-alt" 
        rounded 
        text 
        size="small"
        @click="refreshCurrentProject"
        title="Refresh project"
      />
    </div>

    <!-- Main Content with Tabs -->
    <Card style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
      <template #content>
        <div style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
          <TabView 
            style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;"
            :pt="{
              root: { style: 'display: flex; flex-direction: column; height: 100%; min-height: 0;' },
              navContainer: { style: 'background-color: #1f2937; border-bottom: 2px solid #374151; padding: 0 0;' },
              nav: { style: 'display: flex; gap: 4px;' },
              panelContainer: { style: 'flex: 1; overflow: hidden; min-height: 0; display: flex; flex-direction: column;' },
              content: { style: 'flex: 1; overflow: hidden; min-height: 0; display: flex; flex-direction: column;' }
            }"
          >
          <TabPanel header="Rules" :pt="{ content: { style: 'height: 90vh; overflow: hidden;' } }">
            <div style="height: 100%; overflow-y: auto; overflow-x: hidden; padding: 12px; box-sizing: border-box;">
              <!-- Gros doute sur l UI -->
              <div style="border: 1px solid #374151; border-radius: 6px; padding: 12px; margin-bottom: 16px; background-color: #111827;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                  <h3 style="font-size: 14px; font-weight: 500; color: #d1d5db;">Collections</h3>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <InputText 
                      v-model="newCollectionName" 
                      placeholder="New collection name" 
                      style="width: 200px;" 
                      @keyup.enter="createCollection"
                    />
                    <Button 
                      icon="fas fa-plus" 
                      label="Create" 
                      severity="info"
                      :disabled="newCollectionName.trim().length === 0"
                      @click="createCollection"
                      size="small"
                    />
                    <Button :disabled="!canValidate" icon="fas fa-check" label="Sync" severity="success" @click="onSyncToSelected" />
        </div>
      </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <div
                    v-for="collection in collections"
                    :key="collection.id"
                    @click="switchCollection(collection.id)"
                    :style="{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: selectedCollectionId === collection.id ? '2px solid #60a5fa' : '1px solid #374151',
                      backgroundColor: selectedCollectionId === collection.id ? '#1e3a5f' : '#1f2937',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      position: 'relative'
                    }"
                    :title="collection.name"
                  >
                    <span :style="{ fontSize: '13px', color: '#d1d5db', fontWeight: selectedCollectionId === collection.id ? '500' : '400' }">
                      {{ collection.name }}
                    </span>
                    <span style="font-size: 11px; color: #9ca3af; padding: 2px 6px; background-color: #111827; border-radius: 4px;">
                      {{ collection.rules.length }} rule(s)
                    </span>
                    <Button 
                      v-if="collections.length > 1"
                      icon="fas fa-trash" 
                      rounded 
                      text 
                      size="small"
                      severity="danger"
                      @click.stop="deleteCollection(collection.id)"
                      style="opacity: 0.6; margin-left: 4px;"
                      title="Delete collection"
                    />
            </div>
            </div>
            </div>
              <!-- Import Section -->
              <div style="border: 1px solid #374151; border-radius: 6px; padding: 12px; margin-bottom: 16px; background-color: #111827;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                  <h3 style="font-size: 14px; font-weight: 500; color: #d1d5db;">Import Rules</h3>
            </div>

                <!-- Import from File -->
                <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px;">
                  <input
                    ref="fileInputRef"
                    type="file"
                    accept=".json,application/json"
                    multiple
                    style="display: none;"
                    @change="importFromFile"
                  />
                  <Button 
                    icon="fas fa-folder-open" 
                    label="From File" 
                    severity="info"
                    :loading="isImportingFile"
                    :disabled="isImportingFile || !selectedCollectionId"
                    @click="triggerFileImport"
                    style="min-width: 120px;"
                  />
                  <span style="font-size: 12px; color: #9ca3af;">
                    Select JSON file(s) containing rules (supports multiple files)
                  </span>
            </div>
                
                <!-- Import from Current Project -->
                <div style="display: flex; gap: 8px; align-items: center;">
                  <Dropdown
                    v-model="selectedProjectRule"
                    :options="availableProjectRules"
                    optionLabel="name"
                    optionValue="id"
                    placeholder="Select a rule from current project"
                    style="flex: 1; min-width: 200px;"
                    :loading="isLoadingProjectRules"
                    filter
                    showClear
                    @focus="loadProjectRules"
                  >
                    <template #option="slotProps">
                      <div style="display: flex; flex-direction: column;">
                        <span>{{ slotProps.option.name }}</span>
                        <span style="font-size: 11px; color: #9ca3af;">{{ slotProps.option.collectionName }}</span>
      </div>
                    </template>
                  </Dropdown>
                  <Button 
                    icon="fas fa-download" 
                    label="Import" 
                    severity="success"
                    :disabled="!selectedProjectRule || isLoadingProjectRules || !selectedCollectionId"
                    @click="importProjectRule"
                    style="min-width: 100px;"
                  />
                  <Button 
                    icon="fas fa-sync-alt" 
                    rounded 
                    text 
                    :loading="isLoadingProjectRules"
                    @click="loadProjectRules"
                    title="Refresh rules list"
                  />
            </div>
          </div>

              <!-- Rules List -->
              <div v-if="rules.length === 0" style="padding: 24px; text-align: center; color: #9ca3af; font-size: 14px;">
                No rules yet. Import rules from a file to get started.
            </div>
              <div v-else style="border: 1px solid #374151; border-radius: 6px; overflow: hidden;">
                <div style="display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); font-size: 12px; padding: 8px; color: #9ca3af; border-bottom: 1px solid #374151; background-color: #1f2937;">
                  <div style="grid-column: span 3;">Name</div>
                  <div style="grid-column: span 2;">Section</div>
                  <div style="grid-column: span 3;">Matcher</div>
                  <div style="grid-column: span 3;">Value</div>
                  <div style="grid-column: span 1; text-align: right;">Active</div>
            </div>
                <div v-for="r in rules" :key="r.id" style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #1f2937; background-color: #111827; gap: 8px;">
                  <div style="display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); flex: 1; align-items: center;">
                    <div style="grid-column: span 3; display: flex; align-items: center; gap: 8px;">
                      <InputText
                        v-if="editingRuleId === r.id"
                        v-model="editingRuleName"
                        @keyup.enter="saveRuleName(r.id)"
                        @keyup.esc="cancelEditingName"
                        @blur="saveRuleName(r.id)"
                        style="flex: 1; font-size: 13px;"
                        autofocus
                      />
                      <span v-else style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;" :title="r.name" @dblclick="startEditingName(r)">{{ r.name }}</span>
                      <Button 
                        v-if="editingRuleId !== r.id"
                        icon="fas fa-edit" 
                        rounded 
                        text 
                        size="small"
                        @click="startEditingName(r)"
                        style="opacity: 0.6;"
                        title="Edit name"
                      />
                    </div>
                    <div style="grid-column: span 2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ r.section }}</div>
                    <div style="grid-column: span 3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" :title="r.matcher">{{ r.matcher || "-" }}</div>
                    <div style="grid-column: span 3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" :title="r.value">{{ r.value }}</div>
                    <div style="grid-column: span 1; display: flex; align-items: center; justify-content: flex-end;">
                <Checkbox :model-value="r.active" :binary="true" @update:model-value="(v:boolean)=>toggleActive(r.id,v)" />
              </div>
            </div>
                  <Button icon="fas fa-trash" rounded severity="danger" text size="small" @click="removeRule(r.id)" title="Delete rule" />
          </div>
        </div>
      </div>
          </TabPanel>

          <TabPanel header="README" :pt="{ content: { style: 'height: 90vh; overflow: hidden;' } }">
            <div style="height: 100%; overflow-y: auto; overflow-x: hidden; padding: 24px; box-sizing: border-box;">
              <div style="max-width: 800px; margin: 0 auto; color: #d1d5db; line-height: 1.6;">
              <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px; color: #f3f4f6;">Match & Replace Rule Template Plugin</h1>
              
              <p style="margin-bottom: 24px; font-size: 14px;">
                A Caido plugin for managing and syncing Match & Replace rules across multiple projects.
              </p>

              <h2 style="font-size: 18px; font-weight: 600; margin-top: 24px; margin-bottom: 12px; color: #f3f4f6;">How It Works</h2>
              
              <p style="margin-bottom: 16px; font-size: 14px;">
                This plugin allows you to create multiple <strong>Match & Replace collections</strong> with your own sets of rules. Each collection can be synced to your Caido projects. When you sync a collection, the plugin will <strong>remove any existing collection with the same name and replace it</strong> with a fresh one containing your template rules.
              </p>

              <div style="background-color: #1f2937; border-left: 4px solid #fbbf24; padding: 12px; margin-bottom: 24px; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px; color: #fbbf24; font-weight: 500;">
                  ⚠️ <strong>Important</strong>: Do not manually create rules under collection names you use for this plugin, as they will be erased during the next sync operation.
                </p>
      </div>

              <h2 style="font-size: 18px; font-weight: 600; margin-top: 24px; margin-bottom: 12px; color: #f3f4f6;">Features</h2>
              
              <ul style="margin-bottom: 24px; padding-left: 20px; font-size: 14px;">
                <li style="margin-bottom: 8px;"><strong>Multiple Collections</strong>: Create and manage multiple collections, each with its own set of rules</li>
                <li style="margin-bottom: 8px;"><strong>Import Rules</strong>: Import rules from JSON files (supports Caido GraphQL export format) or from your current project</li>
                <li style="margin-bottom: 8px;"><strong>Collection Management</strong>: Create, switch between, and delete collections</li>
                <li style="margin-bottom: 8px;"><strong>Rule Editing</strong>: Edit rule names directly in the plugin interface by double-clicking</li>
                <li style="margin-bottom: 8px;"><strong>Sync to Projects</strong>: Sync collections to the selected project</li>
                <li style="margin-bottom: 8px;"><strong>Persistent Storage</strong>: All collections and rules persist in local storage across Caido restarts</li>
                <li style="margin-bottom: 8px;"><strong>Automatic Global Prefix</strong>: Collection names automatically get a "Global" prefix</li>
              </ul>

              <h2 style="font-size: 18px; font-weight: 600; margin-top: 24px; margin-bottom: 12px; color: #f3f4f6;">Collections</h2>
              
              <p style="margin-bottom: 16px; font-size: 14px;">
                You can create multiple collections, each with its own set of rules. Each collection will have the "Global" prefix automatically added to its name (e.g., "Template" becomes "Global Template"). This allows you to organize different sets of rules for different purposes.
              </p>
              
              <ul style="margin-bottom: 24px; padding-left: 20px; font-size: 14px;">
                <li style="margin-bottom: 8px;">Create new collections using the "Create" button in the Collections section</li>
                <li style="margin-bottom: 8px;">Switch between collections by clicking on them</li>
                <li style="margin-bottom: 8px;">Delete collections (minimum one collection is required)</li>
                <li style="margin-bottom: 8px;">Each collection maintains its own independent set of rules</li>
              </ul>

              <h2 style="font-size: 18px; font-weight: 600; margin-top: 24px; margin-bottom: 12px; color: #f3f4f6;">GitHub</h2>
              
              <p style="margin-bottom: 16px; font-size: 14px;">
                ⭐ <strong>Star this project on GitHub</strong>: <a href="https://github.com/MDGDSS/caido-template" target="_blank" style="color: #60a5fa; text-decoration: underline;">https://github.com/MDGDSS/caido-template</a>
              </p>

              <p style="margin-bottom: 24px; font-size: 14px;">
                Feel free to suggest improvements or report issues on GitHub!
              </p>

              <h2 style="font-size: 18px; font-weight: 600; margin-top: 24px; margin-bottom: 12px; color: #f3f4f6;">Usage</h2>
              
              <ol style="margin-bottom: 24px; padding-left: 20px; font-size: 14px;">
                <li style="margin-bottom: 8px;"><strong>Create or Select a Collection</strong>: Use the Collections section to create a new collection or select an existing one</li>
                <li style="margin-bottom: 8px;"><strong>Import Rules</strong>: Import rules from a file or from your current project. Select the target collection for imports using the dropdown</li>
                <li style="margin-bottom: 8px;"><strong>Edit Rules</strong>: Double-click rule names to edit them directly</li>
                <li style="margin-bottom: 8px;"><strong>Sync</strong>: Click the "Sync" button to sync the selected collection to the current project</li>
              </ol>

              <p style="margin-top: 24px; font-size: 14px; color: #9ca3af;">
                Rules are automatically saved to local storage and will persist when you reload Caido.
              </p>
              </div>
            </div>
          </TabPanel>
          </TabView>
        </div>
      </template>
    </Card>
  </div>
</template>
