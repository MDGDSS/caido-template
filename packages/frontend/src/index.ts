import { Classic } from "@caido/primevue";
import PrimeVue from "primevue/config";
import { createApp } from "vue";

import { SDKPlugin } from "./plugins/sdk";
import "./styles/index.css";
import type { FrontendSDK } from "./types";
import App from "./views/App.vue";

// This is the entry point for the frontend plugin
export const init = (sdk: FrontendSDK) => {
  const app = createApp(App);

  // Load the PrimeVue component library
  app.use(PrimeVue, {
    unstyled: true,
    pt: Classic,
  });

  // Provide the FrontendSDK
  app.use(SDKPlugin, sdk);

  // Create the root element for the app
  const root = document.createElement("div");
  Object.assign(root.style, {
    height: "100%",
    width: "100%",
  });

  // Set the ID of the root element
  // Replace this with the value of the prefixWrap plugin in caido.config.ts
  // This is necessary to prevent styling conflicts between plugins
  root.id = `plugin--frontend-vue`;

  // Mount the app to the root element
  app.mount(root);

  // Add the page to the navigation
  // Make sure to use a unique name for the page
  try {
    if (sdk.navigation && typeof sdk.navigation === "object" && "addPage" in sdk.navigation) {
      (sdk.navigation as { addPage: (path: string, options: { body: HTMLElement }) => void }).addPage("/mr-templates", {
        body: root,
      });
    }
  } catch (error) {
    console.error("Failed to add page to navigation", error);
  }

  // Add a sidebar item
  try {
    if (sdk.sidebar && typeof sdk.sidebar === "object" && "registerItem" in sdk.sidebar) {
      (sdk.sidebar as { registerItem: (name: string, path: string, options?: { icon?: string }) => void }).registerItem("Templates", "/mr-templates", {
        icon: "fa-solid fa-folder"
      });
    }
  } catch (error) {
    console.error("Failed to register sidebar item", error);
  }

  // Ensure the page is opened so the app mounts visibly
  try {
    if (sdk.navigation && typeof sdk.navigation === "object" && "setCurrent" in sdk.navigation) {
      (sdk.navigation as { setCurrent: (path: string) => void }).setCurrent("/mr-templates");
    }
  } catch (error) {
    console.error("Failed to set current navigation", error);
  }
};
