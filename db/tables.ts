/**
 * Markdown Editor - write and manage markdown documents.
 *
 * Design goals:
 * - Core entities: Documents + Versions.
 * - Ready for future features like publishing, preview themes, etc.
 */

import { defineTable, column, NOW } from "astro:db";

export const MarkdownDocuments = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),

    title: column.text({ optional: true }),             // doc title or first heading
    slug: column.text({ optional: true }),              // for future publishing
    description: column.text({ optional: true }),

    folder: column.text({ optional: true }),            // simple "virtual folder" path
    tags: column.text({ optional: true }),              // comma-separated or JSON

    isPinned: column.boolean({ default: false }),
    isArchived: column.boolean({ default: false }),

    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const MarkdownDocumentVersions = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    documentId: column.text({
      references: () => MarkdownDocuments.columns.id,
    }),
    userId: column.text(),

    versionLabel: column.text({ optional: true }),      // "v1", "initial", "autosave #3"
    content: column.text(),                             // full markdown
    isAutosave: column.boolean({ default: false }),
    isCurrent: column.boolean({ default: false }),

    createdAt: column.date({ default: NOW }),
  },
});

export const tables = {
  MarkdownDocuments,
  MarkdownDocumentVersions,
} as const;
