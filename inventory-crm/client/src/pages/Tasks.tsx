import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { Employee, Task, TaskPriority, TaskStatus, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TaskSummary } from "../types";
import { Button, ErrorText, Field, inputCls, Modal } from "../components/ui";

const COLUMNS: { status: TaskStatus; accent: string; dot: string }[] = [
  { status: "todo", accent: "border-t-indigo-400", dot: "bg-indigo-400" },
  { status: "in_progress", accent: "border-t-amber-400", dot: "bg-amber-400" },
  { status: "done", accent: "border-t-green-400", dot: "bg-green-400" },
];

const PRIORITY_STYLES: Record<TaskPriority, { border: string; badge: string }> = {
  high: { border: "border-r-red-400", badge: "bg-red-50 text-red-700" },
  medium: { border: "border-r-amber-400", badge: "bg-amber-50 text-amber-700" },
  low: { border: "border-r-slate-300", badge: "bg-slate-100 text-slate-600" },
};

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-teal-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-cyan-600",
  "bg-pink-500",
];

function avatarColor(name: string) {
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
}

function formatDueDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

function dueDateTone(iso: string, status: TaskStatus) {
  if (status === "done") return "bg-gray-100 text-gray-500";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(iso);
  if (due < startOfToday) return "bg-red-100 text-red-700";
  if (due < new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [modalTask, setModalTask] = useState<Task | "new" | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ status: TaskStatus; index: number } | null>(null);

  function loadTasks() {
    api.get<Task[]>("/tasks").then(setTasks);
    api.get<TaskSummary>("/tasks/summary").then(setSummary);
  }
  function loadEmployees() {
    api.get<Employee[]>("/employees").then(setEmployees);
  }
  useEffect(() => {
    loadTasks();
    loadEmployees();
  }, []);

  const columns = useMemo(() => {
    const byStatus: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) byStatus[t.status].push(t);
    for (const status of Object.keys(byStatus) as TaskStatus[]) {
      byStatus[status].sort((a, b) => a.position - b.position);
    }
    return byStatus;
  }, [tasks]);

  async function moveTask(taskId: number, targetStatus: TaskStatus, index: number) {
    const dragged = tasks.find((t) => t.id === taskId);
    if (!dragged) return;

    const targetList = columns[targetStatus].filter((t) => t.id !== taskId);
    targetList.splice(index, 0, dragged);
    const orderedIds = targetList.map((t) => t.id);

    // optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: targetStatus } : t))
    );

    try {
      await api.put(`/tasks/${taskId}/move`, { status: targetStatus, orderedIds });
    } finally {
      loadTasks();
    }
  }

  function onDrop(status: TaskStatus) {
    if (draggedId != null && dropTarget) {
      moveTask(draggedId, status, dropTarget.index);
    }
    setDraggedId(null);
    setDropTarget(null);
  }

  async function deleteTask(id: number) {
    if (!confirm("למחוק את המשימה?")) return;
    await api.delete(`/tasks/${id}`);
    setModalTask(null);
    loadTasks();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">לוח משימות</h1>
        <Button onClick={() => setModalTask("new")}>+ משימה חדשה</Button>
      </div>

      {summary && <SummaryStrip summary={summary} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {COLUMNS.map((col) => {
          const list = columns[col.status];
          return (
            <div
              key={col.status}
              className={`bg-gray-50/70 rounded-xl border border-t-4 ${col.accent} flex flex-col min-h-[200px]`}
              onDragOver={(e) => {
                e.preventDefault();
                if (list.length === 0) setDropTarget({ status: col.status, index: 0 });
              }}
              onDrop={() => onDrop(col.status)}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <h2 className="font-semibold text-gray-700">{TASK_STATUS_LABELS[col.status]}</h2>
                </div>
                <span className="text-xs bg-white border rounded-full px-2 py-0.5 text-gray-500">{list.length}</span>
              </div>

              <div className="flex-1 px-3 pb-3 space-y-2">
                {list.map((task, index) => (
                  <div key={task.id}>
                    {dropTarget?.status === col.status && dropTarget.index === index && draggedId !== task.id && (
                      <div className="h-1 mx-1 rounded-full bg-indigo-400 mb-2" />
                    )}
                    <div
                      draggable
                      onDragStart={() => setDraggedId(task.id)}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDropTarget(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const before = e.clientY < rect.top + rect.height / 2;
                        setDropTarget({ status: col.status, index: before ? index : index + 1 });
                      }}
                      onClick={() => setModalTask(task)}
                      className={`bg-white rounded-lg shadow-sm border border-r-4 ${
                        PRIORITY_STYLES[task.priority].border
                      } p-3 cursor-pointer hover:shadow-md transition-shadow ${
                        draggedId === task.id ? "opacity-40" : ""
                      }`}
                    >
                      <p className={`text-sm font-medium text-gray-800 mb-1 ${task.status === "done" ? "line-through text-gray-400" : ""}`}>
                        {task.title}
                      </p>
                      {task.description && <p className="text-xs text-gray-500 mb-2 line-clamp-2">{task.description}</p>}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[task.priority].badge}`}>
                            {TASK_PRIORITY_LABELS[task.priority]}
                          </span>
                          {task.dueDate && (
                            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${dueDateTone(task.dueDate, task.status)}`}>
                              {formatDueDate(task.dueDate)}
                            </span>
                          )}
                        </div>
                        {task.assignee && (
                          <div
                            title={task.assignee.name}
                            className={`w-6 h-6 rounded-full text-white text-[10px] flex items-center justify-center font-semibold shrink-0 ${avatarColor(
                              task.assignee.name
                            )}`}
                          >
                            {initials(task.assignee.name)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {dropTarget?.status === col.status && dropTarget.index === list.length && draggedId != null && (
                  <div className="h-1 mx-1 rounded-full bg-indigo-400" />
                )}
                {list.length === 0 && (
                  <div className="text-center text-xs text-gray-400 border border-dashed rounded-lg py-6">אין משימות בעמודה זו</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modalTask && (
        <TaskModal
          task={modalTask === "new" ? null : modalTask}
          employees={employees}
          onClose={() => setModalTask(null)}
          onSaved={() => {
            setModalTask(null);
            loadTasks();
          }}
          onDelete={modalTask !== "new" ? () => deleteTask(modalTask.id) : undefined}
          onEmployeeCreated={loadEmployees}
        />
      )}
    </div>
  );
}

function SummaryStrip({ summary }: { summary: TaskSummary }) {
  const cards = [
    { label: "סה\"כ משימות", value: summary.total, tone: "bg-white text-gray-800" },
    { label: "לביצוע", value: summary.todo, tone: "bg-white text-gray-800" },
    { label: "בתהליך", value: summary.inProgress, tone: "bg-white text-gray-800" },
    { label: "באיחור", value: summary.overdue, tone: summary.overdue > 0 ? "bg-red-50 text-red-700" : "bg-white text-gray-800" },
    { label: "להיום", value: summary.dueToday, tone: summary.dueToday > 0 ? "bg-amber-50 text-amber-700" : "bg-white text-gray-800" },
    { label: "הושלמו היום", value: summary.completedToday, tone: "bg-green-50 text-green-700" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-lg border p-3 ${c.tone}`}>
          <p className="text-xs opacity-70 mb-1">{c.label}</p>
          <p className="text-xl font-bold">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

const emptyForm = { title: "", description: "", priority: "medium" as TaskPriority, dueDate: "", assigneeId: "" };

function TaskModal({
  task,
  employees,
  onClose,
  onSaved,
  onDelete,
  onEmployeeCreated,
}: {
  task: Task | null;
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
  onEmployeeCreated: () => void;
}) {
  const [form, setForm] = useState(
    task
      ? {
          title: task.title,
          description: task.description || "",
          priority: task.priority,
          dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
          assigneeId: task.assigneeId ? String(task.assigneeId) : "",
        }
      : emptyForm
  );
  const [error, setError] = useState("");
  const [quickAddEmployee, setQuickAddEmployee] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload = {
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      dueDate: form.dueDate || null,
      assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
    };
    try {
      if (task) await api.put(`/tasks/${task.id}`, payload);
      else await api.post("/tasks", payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בשמירה");
    }
  }

  return (
    <Modal title={task ? "עריכת משימה" : "משימה חדשה"} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorText>{error}</ErrorText>
        <Field label="כותרת">
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
        </Field>
        <Field label="תיאור">
          <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="עדיפות">
            <select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}>
              {(Object.entries(TASK_PRIORITY_LABELS) as [TaskPriority, string][]).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="תאריך יעד">
            <input type="date" className={inputCls} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
        </div>
        <Field label="שיוך לעובד/ת">
          <div className="flex gap-2">
            <select className={inputCls} value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">— ללא שיוך —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                  {emp.role ? ` (${emp.role})` : ""}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={() => setQuickAddEmployee(true)}>
              + חדש
            </Button>
          </div>
        </Field>

        <div className="flex items-center justify-between mt-4">
          <Button type="submit">{task ? "שמירה" : "יצירת משימה"}</Button>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              מחיקת משימה
            </Button>
          )}
        </div>
      </form>

      {quickAddEmployee && (
        <QuickAddEmployeeModal
          onClose={() => setQuickAddEmployee(false)}
          onCreated={(id) => {
            onEmployeeCreated();
            setForm((f) => ({ ...f, assigneeId: String(id) }));
            setQuickAddEmployee(false);
          }}
        />
      )}
    </Modal>
  );
}

function QuickAddEmployeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const created = await api.post<{ id: number }>("/employees", { name, role: role || null });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה");
    }
  }

  return (
    <Modal title="עובד/ת חדש/ה" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorText>{error}</ErrorText>
        <Field label="שם">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        <Field label="תפקיד (אופציונלי)">
          <input className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} placeholder="מוכר/ת, מחסנאי/ת..." />
        </Field>
        <Button type="submit">הוספה</Button>
      </form>
    </Modal>
  );
}
