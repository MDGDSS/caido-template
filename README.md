# Match & Replace Rule Template Plugin

A Caido plugin for managing and syncing Match & Replace rules across multiple projects.

## How It Works

This plugin allows you to create multiple **Match & Replace collections** with your own sets of rules. Each collection can be synced to your Caido projects. When you sync a collection, the plugin will **remove any existing collection with the same name and replace it** with a fresh one containing your template rules.

> ⚠️ **Important**: Do not manually create rules under collection names you use for this plugin, as they will be erased during the next sync operation.

## Features

- **Multiple Collections**: Create and manage multiple collections, each with its own set of rules
- **Import Rules**: Import rules from JSON files (supports Caido GraphQL export format) or from your current project
- **Collection Management**: Create, switch between, and delete collections
- **Rule Editing**: Edit rule names directly in the plugin interface by double-clicking
- **Sync to Projects**: Sync collections to the selected project
- **Persistent Storage**: All collections and rules persist in local storage across Caido restarts
- **Automatic Global Prefix**: Collection names automatically get a "Global" prefix

## Collections

You can create multiple collections, each with its own set of rules. Each collection will have the "Global" prefix automatically added to its name (e.g., "Template" becomes "Global Template"). This allows you to organize different sets of rules for different purposes.

- Create new collections using the "Create" button in the Collections section
- Switch between collections by clicking on them
- Delete collections (minimum one collection is required)
- Each collection maintains its own independent set of rules

## GitHub

⭐ **Star this project on GitHub**: [https://github.com/MDGDSS/caido-template](https://github.com/MDGDSS/caido-template)

Feel free to suggest improvements or report issues on GitHub!

## Installation

1. Build the plugin: `pnpm build`
2. Install the plugin package from the `dist` folder in Caido

## Usage

1. **Create or Select a Collection**: Use the Collections section to create a new collection or select an existing one
2. **Import Rules**: Import rules from a file or from your current project. Select the target collection for imports using the dropdown
3. **Edit Rules**: Double-click rule names to edit them directly
4. **Sync**: Click the "Sync" button to sync the selected collection to the current project

Rules are automatically saved to local storage and will persist when you reload Caido.