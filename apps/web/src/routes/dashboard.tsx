import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/utils/orpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Trash2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";

// Define types for our filter state to ensure type safety
type Priority = "low" | "medium" | "high" | "urgent";
type SortBy = "createdAt" | "dueDate" | "priority" | "title";
type SortOrder = "asc" | "desc";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) redirect({ to: "/login" });
    return { session };
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();

  // --- State Management for Filters and Sorting ---
  const [completed, setCompleted] = useState<boolean | undefined>(undefined);
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  // --- API Calls ---
  const { data: todos, isLoading } = useQuery(
    orpc.todos.getTodos.queryOptions({
      input: {
        completed,
        priority,
        sortBy,
        sortOrder,
        search: debouncedSearch || undefined,
      },
    })
  );

  const invalidateTodos = () => {
    queryClient.invalidateQueries({ queryKey: ["todos", "getTodos"] });
  };

  const { mutate: createTodo, isPending: isCreating } = useMutation({
    ...orpc.todos.createTodo.mutationOptions(),
    onSuccess: () => {
      toast.success("Todo created!");
      invalidateTodos();
      form.reset();
    },
    onError: (err) => toast.error(err.message),
  });

  const { mutate: updateTodo } = useMutation({
    ...orpc.todos.updateTodo.mutationOptions(),
    onSuccess: invalidateTodos,
    onError: (err) => toast.error(err.message),
  });

  const { mutate: deleteTodo } = useMutation({
    ...orpc.todos.deleteTodo.mutationOptions(),
    onSuccess: () => {
      toast.success("Todo deleted");
      invalidateTodos();
    },
    onError: (err) => toast.error(err.message),
  });

  const form = useForm({
    defaultValues: { title: "" },
    onSubmit: async ({ value }) => createTodo({ title: value.title }),
    validators: {
      onSubmit: z.object({ title: z.string().min(1, "Title is required") }),
    },
  });

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>My Super Todos</CardTitle>
          <CardDescription>
            Welcome back, {session.data?.user.name}!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg bg-muted/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Select
              onValueChange={(val) =>
                setCompleted(val === "all" ? undefined : val === "true")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="false">Pending</SelectItem>
                <SelectItem value="true">Completed</SelectItem>
              </SelectContent>
            </Select>

            <Select
              onValueChange={(val: Priority | "all") =>
                setPriority(val === "all" ? undefined : val)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(val: SortBy) => setSortBy(val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Created Date</SelectItem>
                <SelectItem value="dueDate">Due Date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="title">Title</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sortOrder}
              onValueChange={(val: SortOrder) => setSortOrder(val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending</SelectItem>
                <SelectItem value="asc">Ascending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="flex gap-2 mb-6"
          >
            <form.Field name="title">
              {(field) => (
                // FIX: Manually bind the required props from the 'field' object
                <Input
                  placeholder="What needs to be done?"
                  className="grow"
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  disabled={isCreating}
                />
              )}
            </form.Field>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Adding..." : "Add Todo"}
            </Button>
          </form>

          <div className="space-y-3">
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            {!isLoading && todos?.length === 0 && (
              <p className="text-center text-muted-foreground">
                No todos found. Add one to get started!
              </p>
            )}
            {todos?.map((todo) => (
              <div
                key={todo.id}
                className="flex items-center gap-3 p-3 border rounded-lg transition-colors hover:bg-accent/50"
              >
                <Checkbox
                  id={todo.id}
                  checked={todo.completed}
                  onCheckedChange={(c) =>
                    updateTodo({ id: todo.id, completed: !!c })
                  }
                />
                <div className="grow">
                  <label
                    htmlFor={todo.id}
                    className={`font-medium ${todo.completed ? "line-through text-muted-foreground" : ""}`}
                  >
                    {todo.title}
                  </label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {todo.tags.map((tag) => (
                      <Badge key={tag.id} variant="secondary">
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteTodo({ id: todo.id })}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
