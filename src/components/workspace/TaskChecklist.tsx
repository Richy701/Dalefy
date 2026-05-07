import { useState } from "react";
import { Plus, Check, Trash, CalendarDots, User, Tag } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse } from "date-fns";
import type { TripTask } from "@/types";

interface TaskChecklistProps {
  tasks: TripTask[];
  onUpdate: (tasks: TripTask[]) => void;
  travelers?: Array<{ id: string; name: string; initials: string }>;
}

const CATEGORIES: { value: TripTask["category"]; label: string; color: string }[] = [
  { value: "booking", label: "Booking", color: "bg-blue-500" },
  { value: "documents", label: "Documents", color: "bg-amber-500" },
  { value: "logistics", label: "Logistics", color: "bg-purple-500" },
  { value: "communication", label: "Comms", color: "bg-green-500" },
  { value: "other", label: "Other", color: "bg-slate-400" },
];

export function TaskChecklist({ tasks, onUpdate, travelers }: TaskChecklistProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<TripTask["category"]>("other");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [showForm, setShowForm] = useState(false);

  const completed = tasks.filter(t => t.completed).length;
  const total = tasks.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    const task: TripTask = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      completed: false,
      category: newCategory,
      assignee: newAssignee || undefined,
      dueDate: newDueDate || undefined,
      createdAt: new Date().toISOString(),
    };
    onUpdate([...tasks, task]);
    setNewTitle("");
    setNewCategory("other");
    setNewAssignee("");
    setNewDueDate("");
    setShowForm(false);
  };

  const handleToggle = (id: string) => {
    onUpdate(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const handleDelete = (id: string) => {
    onUpdate(tasks.filter(t => t.id !== id));
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  const getCategoryColor = (cat?: string) => CATEGORIES.find(c => c.value === cat)?.color ?? "bg-slate-400";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-[#1f1f1f]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-brand">TASKS</span>
          <span className="text-[10px] font-bold text-slate-500 dark:text-[#888] uppercase tracking-wider">
            {completed}/{total}
          </span>
        </div>
        {total > 0 && (
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-[#1f1f1f] overflow-hidden">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {sortedTasks.length === 0 && !showForm && (
          <div className="text-center py-8 text-slate-400 dark:text-[#555]">
            <p className="text-xs font-bold uppercase tracking-wider">No tasks yet</p>
            <p className="text-[10px] mt-1 opacity-70">Add tasks to track trip preparation</p>
          </div>
        )}
        {sortedTasks.map(task => {
          const isOverdue = task.dueDate && !task.completed && new Date(task.dueDate) < new Date();
          return (
            <div
              key={task.id}
              className={`group flex items-start gap-2.5 p-2.5 rounded-xl transition-all ${
                task.completed
                  ? "opacity-50"
                  : "hover:bg-slate-50 dark:hover:bg-[#0a0a0a]"
              }`}
            >
              <button
                onClick={() => handleToggle(task.id)}
                className={`mt-0.5 h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                  task.completed
                    ? "bg-brand border-brand"
                    : "border-slate-300 dark:border-[#333] hover:border-brand"
                }`}
              >
                {task.completed && <Check className="h-3 w-3 text-black" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold leading-tight ${
                  task.completed ? "line-through text-slate-400 dark:text-[#555]" : "text-slate-800 dark:text-white"
                }`}>
                  {task.title}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {task.category && (
                    <span className="flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${getCategoryColor(task.category)}`} />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#666]">
                        {CATEGORIES.find(c => c.value === task.category)?.label}
                      </span>
                    </span>
                  )}
                  {task.assignee && (
                    <span className="text-[9px] font-bold text-slate-400 dark:text-[#666] uppercase tracking-wider">
                      {travelers?.find(t => t.id === task.assignee)?.name?.split(" ")[0] || task.assignee}
                    </span>
                  )}
                  {task.dueDate && (
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${
                      isOverdue ? "text-red-500" : "text-slate-400 dark:text-[#666]"
                    }`}>
                      {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(task.id)}
                className="opacity-0 group-hover:opacity-100 h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all shrink-0"
              >
                <Trash className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add task form */}
      {showForm ? (
        <div className="p-3 border-t border-slate-200 dark:border-[#1f1f1f] space-y-2.5 bg-slate-50/50 dark:bg-[#0a0a0a]/50">
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowForm(false); }}
            placeholder="Task title..."
            className="w-full h-9 px-3 rounded-lg text-xs font-semibold bg-white dark:bg-[#111] border border-slate-200 dark:border-[#252525] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#555] focus:outline-none focus:border-brand transition-colors"
          />
          <div className="flex items-center gap-2">
            {/* Category selector */}
            <div className="flex items-center gap-1">
              <Tag className="h-3 w-3 text-slate-400" />
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value as TripTask["category"])}
                className="text-[10px] font-bold uppercase bg-transparent border-none text-slate-500 dark:text-[#888] focus:outline-none cursor-pointer"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            {/* Due date */}
            <Popover>
              <PopoverTrigger className="h-7 px-2 rounded-lg bg-white dark:bg-[#111] border border-slate-200 dark:border-[#252525] hover:border-brand/50 flex items-center gap-1.5 transition-colors cursor-pointer">
                <CalendarDots className="h-3 w-3 text-slate-400 dark:text-[#666] shrink-0" />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${newDueDate ? "text-slate-700 dark:text-white" : "text-slate-400 dark:text-[#555]"}`}>
                  {newDueDate ? format(parse(newDueDate, "yyyy-MM-dd", new Date()), "MMM d") : "Due date"}
                </span>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0 border border-slate-200 dark:border-[#2a2a2a] shadow-2xl rounded-2xl bg-white dark:bg-[#1a1a1a]">
                <Calendar mode="single" selected={newDueDate ? parse(newDueDate, "yyyy-MM-dd", new Date()) : undefined} onSelect={d => d && setNewDueDate(format(d, "yyyy-MM-dd"))} />
              </PopoverContent>
            </Popover>
            {/* Assignee */}
            {travelers && travelers.length > 0 && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3 text-slate-400" />
                <select
                  value={newAssignee}
                  onChange={e => setNewAssignee(e.target.value)}
                  className="text-[10px] font-bold uppercase bg-transparent border-none text-slate-500 dark:text-[#888] focus:outline-none cursor-pointer max-w-[80px]"
                >
                  <option value="">Unassigned</option>
                  {travelers.map(t => (
                    <option key={t.id} value={t.id}>{t.name.split(" ")[0]}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newTitle.trim()}
              className="flex-1 h-8 rounded-lg bg-brand text-black text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              Add Task
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 border-t border-slate-200 dark:border-[#1f1f1f]">
          <button
            onClick={() => setShowForm(true)}
            className="w-full h-9 rounded-xl border-2 border-dashed border-slate-200 dark:border-[#252525] hover:border-brand text-slate-400 dark:text-[#555] hover:text-brand flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Add Task</span>
          </button>
        </div>
      )}
    </div>
  );
}
