import { defineAction, ActionError, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import {
  MarkdownDocumentVersions,
  MarkdownDocuments,
  and,
  db,
  eq,
} from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

async function getOwnedDocument(documentId: string, userId: string) {
  const [doc] = await db
    .select()
    .from(MarkdownDocuments)
    .where(and(eq(MarkdownDocuments.id, documentId), eq(MarkdownDocuments.userId, userId)));

  if (!doc) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Document not found.",
    });
  }

  return doc;
}

export const server = {
  createDocument: defineAction({
    input: z.object({
      title: z.string().optional(),
      slug: z.string().optional(),
      description: z.string().optional(),
      folder: z.string().optional(),
      tags: z.string().optional(),
      isPinned: z.boolean().optional(),
      isArchived: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      const [document] = await db
        .insert(MarkdownDocuments)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          title: input.title,
          slug: input.slug,
          description: input.description,
          folder: input.folder,
          tags: input.tags,
          isPinned: input.isPinned ?? false,
          isArchived: input.isArchived ?? false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        success: true,
        data: { document },
      };
    },
  }),

  updateDocument: defineAction({
    input: z
      .object({
        id: z.string().min(1),
        title: z.string().optional(),
        slug: z.string().optional(),
        description: z.string().optional(),
        folder: z.string().optional(),
        tags: z.string().optional(),
        isPinned: z.boolean().optional(),
        isArchived: z.boolean().optional(),
      })
      .refine(
        (input) =>
          input.title !== undefined ||
          input.slug !== undefined ||
          input.description !== undefined ||
          input.folder !== undefined ||
          input.tags !== undefined ||
          input.isPinned !== undefined ||
          input.isArchived !== undefined,
        { message: "At least one field must be provided to update." }
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedDocument(input.id, user.id);

      const [document] = await db
        .update(MarkdownDocuments)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.folder !== undefined ? { folder: input.folder } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
          ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
          updatedAt: new Date(),
        })
        .where(eq(MarkdownDocuments.id, input.id))
        .returning();

      return {
        success: true,
        data: { document },
      };
    },
  }),

  listDocuments: defineAction({
    input: z.object({
      includeArchived: z.boolean().default(false),
      pinnedOnly: z.boolean().default(false),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const filters = [eq(MarkdownDocuments.userId, user.id)];
      if (!input.includeArchived) {
        filters.push(eq(MarkdownDocuments.isArchived, false));
      }
      if (input.pinnedOnly) {
        filters.push(eq(MarkdownDocuments.isPinned, true));
      }

      const documents = await db.select().from(MarkdownDocuments).where(and(...filters));

      return {
        success: true,
        data: { items: documents, total: documents.length },
      };
    },
  }),

  createDocumentVersion: defineAction({
    input: z.object({
      documentId: z.string().min(1),
      versionLabel: z.string().optional(),
      content: z.string().min(1),
      isAutosave: z.boolean().optional(),
      isCurrent: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedDocument(input.documentId, user.id);

      if (input.isCurrent) {
        await db
          .update(MarkdownDocumentVersions)
          .set({ isCurrent: false })
          .where(eq(MarkdownDocumentVersions.documentId, input.documentId));
      }

      const [version] = await db
        .insert(MarkdownDocumentVersions)
        .values({
          id: crypto.randomUUID(),
          documentId: input.documentId,
          userId: user.id,
          versionLabel: input.versionLabel,
          content: input.content,
          isAutosave: input.isAutosave ?? false,
          isCurrent: input.isCurrent ?? false,
          createdAt: new Date(),
        })
        .returning();

      return {
        success: true,
        data: { version },
      };
    },
  }),

  updateDocumentVersion: defineAction({
    input: z
      .object({
        id: z.string().min(1),
        documentId: z.string().min(1),
        versionLabel: z.string().optional(),
        content: z.string().optional(),
        isAutosave: z.boolean().optional(),
        isCurrent: z.boolean().optional(),
      })
      .refine(
        (input) =>
          input.versionLabel !== undefined ||
          input.content !== undefined ||
          input.isAutosave !== undefined ||
          input.isCurrent !== undefined,
        { message: "At least one field must be provided to update." }
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedDocument(input.documentId, user.id);

      const [existing] = await db
        .select()
        .from(MarkdownDocumentVersions)
        .where(
          and(
            eq(MarkdownDocumentVersions.id, input.id),
            eq(MarkdownDocumentVersions.documentId, input.documentId)
          )
        );

      if (!existing) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Document version not found.",
        });
      }

      if (input.isCurrent) {
        await db
          .update(MarkdownDocumentVersions)
          .set({ isCurrent: false })
          .where(eq(MarkdownDocumentVersions.documentId, input.documentId));
      }

      const [version] = await db
        .update(MarkdownDocumentVersions)
        .set({
          ...(input.versionLabel !== undefined ? { versionLabel: input.versionLabel } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          ...(input.isAutosave !== undefined ? { isAutosave: input.isAutosave } : {}),
          ...(input.isCurrent !== undefined ? { isCurrent: input.isCurrent } : {}),
        })
        .where(eq(MarkdownDocumentVersions.id, input.id))
        .returning();

      return {
        success: true,
        data: { version },
      };
    },
  }),

  listDocumentVersions: defineAction({
    input: z.object({
      documentId: z.string().min(1),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedDocument(input.documentId, user.id);

      const versions = await db
        .select()
        .from(MarkdownDocumentVersions)
        .where(eq(MarkdownDocumentVersions.documentId, input.documentId));

      return {
        success: true,
        data: { items: versions, total: versions.length },
      };
    },
  }),
};
