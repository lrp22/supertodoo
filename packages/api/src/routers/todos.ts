// packages/api/src/routers/todos.ts
import { protectedProcedure } from "../index";
import { db } from "@supertodoo/db";
import { todos, todoTags, tags } from "@supertodoo/db/schema/todos";
import { z } from "zod";
import { and, asc, desc, eq, like, or, SQL, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

// --- Schemas ---
const createTodoSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().datetime().optional(),
  tagIds: z.array(z.string()).optional(),
});

const updateTodoSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  completed: z.boolean().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
});

const getTodosSchema = z.object({
  completed: z.boolean().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  search: z.string().optional(),
  tagId: z.string().optional(),
  sortBy: z
    .enum(["createdAt", "dueDate", "priority", "title"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .default("#3B82F6"),
});

export const todosRouter = {
  // Get all todos with filters
  getTodos: protectedProcedure
    .input(getTodosSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const conditions: (SQL | undefined)[] = [eq(todos.userId, userId)];

      if (input.completed !== undefined) {
        conditions.push(eq(todos.completed, input.completed));
      }
      if (input.priority) {
        conditions.push(eq(todos.priority, input.priority));
      }
      if (input.search) {
        conditions.push(
          or(
            like(todos.title, `%${input.search}%`),
            like(todos.description, `%${input.search}%`)
          )
        );
      }
      if (input.tagId) {
        const subquery = db
          .select({ todoId: todoTags.todoId })
          .from(todoTags)
          .where(eq(todoTags.tagId, input.tagId));
        conditions.push(inArray(todos.id, subquery));
      }

      const sortColumn = todos[input.sortBy];
      const sortOrder =
        input.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

      const userTodos = await db.query.todos.findMany({
        where: and(...conditions),
        orderBy: [sortOrder],
        with: { todoTags: { with: { tag: true } } },
      });

      return userTodos.map((todo) => ({
        ...todo,
        tags: todo.todoTags.map((tt) => tt.tag),
      }));
    }),

  // Get single todo
  getTodo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const [todo] = await db.query.todos.findMany({
        where: and(eq(todos.id, input.id), eq(todos.userId, userId)),
        with: { todoTags: { with: { tag: true } } },
      });

      if (!todo) {
        throw new ORPCError("NOT_FOUND", {
          message: "Todo not found or you don't have access to it",
        });
      }

      return {
        ...todo,
        tags: todo.todoTags.map((tt) => tt.tag),
      };
    }),

  // Create todo
  createTodo: protectedProcedure
    .input(createTodoSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { tagIds, ...todoData } = input;

      return db.transaction(async (tx) => {
        const [newTodo] = await tx
          .insert(todos)
          .values({
            ...todoData,
            dueDate: todoData.dueDate ? new Date(todoData.dueDate) : undefined,
            userId,
          })
          .returning();

        if (!newTodo) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Failed to create todo",
          });
        }

        if (tagIds && tagIds.length > 0) {
          await tx
            .insert(todoTags)
            .values(tagIds.map((tagId) => ({ todoId: newTodo.id, tagId })));
        }

        return newTodo;
      });
    }),

  // Update todo
  updateTodo: protectedProcedure
    .input(updateTodoSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { id, tagIds, ...updateData } = input;

      return db.transaction(async (tx) => {
        // Verify ownership
        const [existing] = await tx
          .select({ id: todos.id })
          .from(todos)
          .where(and(eq(todos.id, id), eq(todos.userId, userId)));

        if (!existing) {
          throw new ORPCError("NOT_FOUND", {
            message: "Todo not found or you don't have access to it",
          });
        }

        // Update todo fields if provided
        if (Object.keys(updateData).length > 0) {
          await tx
            .update(todos)
            .set({
              ...updateData,
              dueDate:
                updateData.dueDate === null
                  ? null
                  : updateData.dueDate
                    ? new Date(updateData.dueDate)
                    : undefined,
              updatedAt: new Date(),
            })
            .where(eq(todos.id, id));
        }

        // Update tags if provided
        if (tagIds !== undefined) {
          await tx.delete(todoTags).where(eq(todoTags.todoId, id));
          if (tagIds.length > 0) {
            await tx
              .insert(todoTags)
              .values(tagIds.map((tagId) => ({ todoId: id, tagId })));
          }
        }

        // Fetch and return updated todo with tags
        const [updatedTodo] = await tx.query.todos.findMany({
          where: eq(todos.id, id),
          with: { todoTags: { with: { tag: true } } },
        });

        if (!updatedTodo) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Could not retrieve updated todo",
          });
        }

        return {
          ...updatedTodo,
          tags: updatedTodo.todoTags.map((tt) => tt.tag),
        };
      });
    }),

  // Toggle todo completion
  toggleTodo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      // Get current state
      const [existing] = await db
        .select({ completed: todos.completed })
        .from(todos)
        .where(and(eq(todos.id, input.id), eq(todos.userId, userId)));

      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Todo not found or you don't have access to it",
        });
      }

      // Toggle completion
      const [updated] = await db
        .update(todos)
        .set({
          completed: !existing.completed,
          updatedAt: new Date(),
        })
        .where(eq(todos.id, input.id))
        .returning();

      return updated;
    }),

  // Delete todo
  deleteTodo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const [deletedTodo] = await db
        .delete(todos)
        .where(and(eq(todos.id, input.id), eq(todos.userId, userId)))
        .returning({ id: todos.id });

      if (!deletedTodo) {
        throw new ORPCError("NOT_FOUND", {
          message: "Todo not found or you don't have access to it",
        });
      }

      return { success: true, id: deletedTodo.id };
    }),

  // Get user's tags
  getTags: protectedProcedure.handler(async ({ context }) => {
    return db.query.tags.findMany({
      where: eq(tags.userId, context.session.user.id),
      orderBy: (tags, { asc }) => [asc(tags.name)],
    });
  }),

  // Create tag
  createTag: protectedProcedure
    .input(createTagSchema)
    .handler(async ({ input, context }) => {
      const [newTag] = await db
        .insert(tags) // ✅ CORRECT: Insert into tags table
        .values({
          name: input.name,
          color: input.color,
          userId: context.session.user.id,
        })
        .returning();

      if (!newTag) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to create tag",
        });
      }

      return newTag;
    }),

  // Delete tag
  deleteTag: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const [deletedTag] = await db
        .delete(tags)
        .where(and(eq(tags.id, input.id), eq(tags.userId, userId)))
        .returning({ id: tags.id });

      if (!deletedTag) {
        throw new ORPCError("NOT_FOUND", {
          message: "Tag not found or you don't have access to it",
        });
      }

      return { success: true, id: deletedTag.id };
    }),

  // Get todo statistics
  getStats: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;

    const allTodos = await db
      .select({
        completed: todos.completed,
        priority: todos.priority,
        dueDate: todos.dueDate,
      })
      .from(todos)
      .where(eq(todos.userId, userId));

    const total = allTodos.length;
    const completed = allTodos.filter((t) => t.completed).length;
    const pending = total - completed;

    const now = new Date();
    const overdue = allTodos.filter(
      (t) => !t.completed && t.dueDate && new Date(t.dueDate) < now
    ).length;

    const dueToday = allTodos.filter((t) => {
      if (!t.dueDate || t.completed) return false;
      const due = new Date(t.dueDate);
      return due.toDateString() === now.toDateString();
    }).length;

    const byPriority = {
      low: allTodos.filter((t) => t.priority === "low").length,
      medium: allTodos.filter((t) => t.priority === "medium").length,
      high: allTodos.filter((t) => t.priority === "high").length,
      urgent: allTodos.filter((t) => t.priority === "urgent").length,
    };

    const completionRate =
      total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending,
      overdue,
      dueToday,
      completionRate,
      byPriority,
    };
  }),
};
