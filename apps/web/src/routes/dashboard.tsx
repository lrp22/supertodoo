// apps/web/src/routes/dashboard.tsx
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
import { Label } from "@/components/ui/label";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Trash2,
  Search,
  Plus,
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock,
  TrendingUp,
  Edit2,
  X,
  Calendar,
} from "lucide-react";
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

// Types
type Priority = "low" | "medium" | "high" | "urgent";
type SortBy = "createdAt" | "dueDate" | "priority" | "title";
type SortOrder = "asc" | "desc";

// Priority configuration
const priorityConfig = {
  low: {
    label: "Low",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: "text-blue-500",
  },
  medium: {
    label: "Medium",
    badge:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: "text-yellow-500",
  },
  high: {
    label: "High",
    badge:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    icon: "text-orange-500",
  },
  urgent: {
    label: "Urgent",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: "text-red-500",
  },
};

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

  // State for filters and sorting
  const [completed, setCompleted] = useState<boolean | undefined>(undefined);
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editingTodo, setEditingTodo] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timerId);
  }, [searchTerm]);

  // Queries
  const { data: todos, isLoading: todosLoading } = useQuery(
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

  const { data: stats } = useQuery(orpc.todos.getStats.queryOptions());

  // Mutations with proper invalidation
  const invalidateTodos = () => {
    queryClient.invalidateQueries({ queryKey: ["todos", "getTodos"] });
    queryClient.invalidateQueries({ queryKey: ["todos", "getStats"] });
  };

  const { mutate: createTodo, isPending: isCreating } = useMutation({
    ...orpc.todos.createTodo.mutationOptions(),
    onSuccess: () => {
      toast.success("Todo created successfully!");
      invalidateTodos();
      form.reset();
    },
    onError: (err) => toast.error(err.message || "Failed to create todo"),
  });

  const { mutate: updateTodo, isPending: isUpdating } = useMutation({
    ...orpc.todos.updateTodo.mutationOptions(),
    onSuccess: () => {
      toast.success("Todo updated!");
      invalidateTodos();
      setEditingTodo(null);
    },
    onError: (err) => toast.error(err.message || "Failed to update todo"),
  });

  const { mutate: deleteTodo, isPending: isDeleting } = useMutation({
    ...orpc.todos.deleteTodo.mutationOptions(),
    onSuccess: () => {
      toast.success("Todo deleted");
      invalidateTodos();
    },
    onError: (err) => toast.error(err.message || "Failed to delete todo"),
  });

  // Form for creating todos
  const form = useForm({
    defaultValues: {
      title: "",
      description: "",
      priority: "medium" as Priority,
      dueDate: "",
    },
    onSubmit: async ({ value }) => {
      if (!value.title.trim()) {
        toast.error("Please enter a todo title");
        return;
      }
      createTodo({
        title: value.title.trim(),
        description: value.description?.trim() || undefined,
        priority: value.priority,
        dueDate: value.dueDate || undefined,
      });
    },
  });

  // Helper functions
  const formatDueDate = (date: Date | null) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return { text: "Overdue", color: "text-red-600" };
    if (days === 0) return { text: "Due today", color: "text-orange-600" };
    if (days === 1) return { text: "Due tomorrow", color: "text-yellow-600" };
    if (days <= 7)
      return { text: `Due in ${days} days`, color: "text-blue-600" };
    return { text: d.toLocaleDateString(), color: "text-muted-foreground" };
  };

  const formatCreatedDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
  };

  const clearFilters = () => {
    setCompleted(undefined);
    setPriority(undefined);
    setSearchTerm("");
    setSortBy("createdAt");
    setSortOrder("desc");
  };

  const hasActiveFilters =
    completed !== undefined || priority !== undefined || debouncedSearch !== "";

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">My Todos</h1>
        <p className="text-muted-foreground">
          Welcome back, {session.data?.user.name}!
        </p>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card className="border-l-4 border-l-primary">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Circle className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-green-600">
                    {stats.completed}
                  </p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {stats.pending}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                  <p className="text-2xl font-bold text-red-600">
                    {stats.overdue}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completion</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {stats.completionRate}%
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Card */}
      <Card>
        <CardHeader>
          <CardTitle>Todo List</CardTitle>
          <CardDescription>
            Manage your tasks and stay organized
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filters */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Filters</h3>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8"
                >
                  Clear filters
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search todos..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <Select
                value={completed?.toString() ?? "all"}
                onValueChange={(val) =>
                  setCompleted(val === "all" ? undefined : val === "true")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="false">Pending</SelectItem>
                  <SelectItem value="true">Completed</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={priority ?? "all"}
                onValueChange={(val: Priority | "all") =>
                  setPriority(val === "all" ? undefined : val)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
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
                  <SelectItem value="desc">Newest First</SelectItem>
                  <SelectItem value="asc">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Add Todo Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="space-y-4 p-4 border rounded-lg bg-muted/50"
          >
            <h3 className="font-medium">Add New Todo</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="title">Title *</Label>
                <form.Field name="title">
                  {(field) => (
                    <Input
                      id="title"
                      placeholder="What needs to be done?"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      disabled={isCreating}
                    />
                  )}
                </form.Field>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <form.Field name="description">
                  {(field) => (
                    <Input
                      id="description"
                      placeholder="Add more details..."
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      disabled={isCreating}
                    />
                  )}
                </form.Field>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <form.Field name="priority">
                  {(field) => (
                    <Select
                      value={field.state.value}
                      onValueChange={(val: Priority) => field.handleChange(val)}
                      disabled={isCreating}
                    >
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </form.Field>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <form.Field name="dueDate">
                  {(field) => (
                    <Input
                      id="dueDate"
                      type="datetime-local"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      disabled={isCreating}
                    />
                  )}
                </form.Field>
              </div>
            </div>

            <Button type="submit" disabled={isCreating} className="gap-2">
              <Plus className="h-4 w-4" />
              {isCreating ? "Adding..." : "Add Todo"}
            </Button>
          </form>

          {/* Todos List */}
          <div className="space-y-2">
            {todosLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))
            ) : !todos || todos.length === 0 ? (
              <div className="text-center py-12">
                <Circle className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-medium text-muted-foreground mb-2">
                  No todos found
                </p>
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? "Try adjusting your filters"
                    : "Add your first todo to get started!"}
                </p>
              </div>
            ) : (
              todos.map((todo) => {
                const dueDate = formatDueDate(todo.dueDate);
                const isEditing = editingTodo === todo.id;

                return (
                  <div
                    key={todo.id}
                    className={`flex items-start gap-3 p-4 border rounded-lg transition-all hover:bg-accent/50 ${
                      todo.completed ? "opacity-60" : ""
                    }`}
                  >
                    <Checkbox
                      id={`checkbox-${todo.id}`}
                      checked={todo.completed}
                      onCheckedChange={(checked) =>
                        updateTodo({ id: todo.id, completed: !!checked })
                      }
                      className="mt-1"
                      disabled={isUpdating}
                    />

                    {isEditing ? (
                      <div className="flex-1 space-y-3">
                        <EditTodoForm
                          todo={todo}
                          onSave={(data) =>
                            updateTodo({ id: todo.id, ...data })
                          }
                          onCancel={() => setEditingTodo(null)}
                          isUpdating={isUpdating}
                        />
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={`checkbox-${todo.id}`}
                          className={`block font-medium cursor-pointer ${
                            todo.completed
                              ? "line-through text-muted-foreground"
                              : ""
                          }`}
                        >
                          {todo.title}
                        </label>
                        {todo.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {todo.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge
                            variant="secondary"
                            className={priorityConfig[todo.priority].badge}
                          >
                            {priorityConfig[todo.priority].label}
                          </Badge>
                          {dueDate && (
                            <Badge variant="outline" className={dueDate.color}>
                              <Clock className="h-3 w-3 mr-1" />
                              {dueDate.text}
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            <Calendar className="h-3 w-3 mr-1" />
                            Created: {formatCreatedDate(todo.createdAt)}
                          </Badge>
                          {todo.tags.map((tag) => (
                            <Badge
                              key={tag.id}
                              variant="outline"
                              style={{
                                borderColor: tag.color,
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-1 shrink-0">
                      {!isEditing && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingTodo(todo.id)}
                          disabled={isUpdating}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteTodo({ id: todo.id })}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Results count */}
          {todos && todos.length > 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Showing {todos.length} {todos.length === 1 ? "todo" : "todos"}
              {hasActiveFilters && " (filtered)"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Edit Todo Form Component
function EditTodoForm({
  todo,
  onSave,
  onCancel,
  isUpdating,
}: {
  todo: any;
  onSave: (data: {
    title: string;
    description?: string;
    priority: Priority;
    dueDate?: string | null;
  }) => void;
  onCancel: () => void;
  isUpdating: boolean;
}) {
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description || "");
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [dueDate, setDueDate] = useState(
    todo.dueDate ? new Date(todo.dueDate).toISOString().slice(0, 16) : ""
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title cannot be empty");
      return;
    }
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Todo title"
        disabled={isUpdating}
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        disabled={isUpdating}
      />
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={priority}
          onValueChange={(val: Priority) => setPriority(val)}
          disabled={isUpdating}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={isUpdating}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isUpdating}>
          {isUpdating ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isUpdating}
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
