import { protectedProcedure } from "../index";
import { db } from "@supertodoo/db";
// FIX: Import the 'tags' table schema for the createTag procedure
import { todos, todoTags, tags } from "@supertodoo/db/schema/todos";
import { z } from "zod";
import { and, asc, desc, eq, like, or, SQL, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

// --- Schemas (These are solid) ---
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
          // FIX 1: Correct ORPCError syntax
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

  updateTodo: protectedProcedure
    .input(updateTodoSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { id, tagIds, ...updateData } = input;

      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: todos.id })
          .from(todos)
          .where(and(eq(todos.id, id), eq(todos.userId, userId)));

        if (!existing) {
          // FIX 2: Correct ORPCError syntax
          throw new ORPCError("NOT_FOUND", { message: "Todo not found" });
        }

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

        if (tagIds !== undefined) {
          await tx.delete(todoTags).where(eq(todoTags.todoId, id));
          if (tagIds.length > 0) {
            await tx
              .insert(todoTags)
              .values(tagIds.map((tagId) => ({ todoId: id, tagId })));
          }
        }

        const [updatedTodo] = await tx.query.todos.findMany({
          where: eq(todos.id, id),
          with: { todoTags: { with: { tag: true } } },
        });

        if (!updatedTodo) {
          // FIX 3: Correct ORPCError syntax
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

  deleteTodo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const [deletedTodo] = await db
        .delete(todos)
        .where(and(eq(todos.id, input.id), eq(todos.userId, userId)))
        .returning({ id: todos.id });

      if (!deletedTodo) {
        // FIX 4: Correct ORPCError syntax
        throw new ORPCError("NOT_FOUND", { message: "Todo not found" });
      }
      return { success: true };
    }),

  getTags: protectedProcedure.handler(async ({ context }) => {
    return db.query.tags.findMany({
      where: eq(tags.userId, context.session.user.id),
      orderBy: (tags, { asc }) => [asc(tags.name)],
    });
  }),

  createTag: protectedProcedure
    .input(createTagSchema)
    .handler(async ({ input, context }) => {
      // FIX 5: Insert into the correct 'tags' table, not 'todoTags'
      const [newTag] = await db
        .insert(tags)
        .values({
          name: input.name,
          color: input.color,
          userId: context.session.user.id,
        })
        .returning();
      return newTag;
    }),
};
