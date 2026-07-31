import { Router } from "express";
import { prisma } from "../db";
import { TASK_STATUSES, TASK_PRIORITIES } from "../lib/enums";

const router = Router();

router.get("/", async (req, res) => {
  const { assigneeId, status, priority } = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (assigneeId) where.assigneeId = Number(assigneeId);
  if (status) where.status = status;
  if (priority) where.priority = priority;
  const tasks = await prisma.task.findMany({
    where,
    include: { assignee: true },
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });
  res.json(tasks);
});

router.get("/summary", async (_req, res) => {
  const tasks = await prisma.task.findMany();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const todo = tasks.filter((t) => t.status === "todo").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const overdue = tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < startOfToday).length;
  const dueToday = tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate >= startOfToday && t.dueDate < endOfToday).length;
  const highPriorityOpen = tasks.filter((t) => t.status !== "done" && t.priority === "high").length;
  const completedToday = tasks.filter((t) => t.completedAt && t.completedAt >= startOfToday && t.completedAt < endOfToday).length;

  res.json({ total: tasks.length, todo, inProgress, done, overdue, dueToday, highPriorityOpen, completedToday });
});

router.post("/", async (req, res) => {
  const { title, description, priority, dueDate, assigneeId, status } = req.body ?? {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: "יש להזין כותרת למשימה" });
  if (priority && !TASK_PRIORITIES.includes(priority)) return res.status(400).json({ error: "עדיפות לא תקינה" });
  if (status && !TASK_STATUSES.includes(status)) return res.status(400).json({ error: "סטטוס לא תקין" });

  const targetStatus = status || "todo";
  const maxPosition = await prisma.task.aggregate({ where: { status: targetStatus }, _max: { position: true } });

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description: description || null,
      priority: priority || "medium",
      status: targetStatus,
      dueDate: dueDate ? new Date(dueDate) : null,
      assigneeId: assigneeId ? Number(assigneeId) : null,
      position: (maxPosition._max.position ?? -1) + 1,
    },
    include: { assignee: true },
  });
  res.status(201).json(task);
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { title, description, priority, dueDate, assigneeId } = req.body ?? {};
  if (priority && !TASK_PRIORITIES.includes(priority)) return res.status(400).json({ error: "עדיפות לא תקינה" });

  try {
    const task = await prisma.task.update({
      where: { id },
      data: {
        title,
        description,
        priority,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
        assigneeId: assigneeId !== undefined ? (assigneeId ? Number(assigneeId) : null) : undefined,
      },
      include: { assignee: true },
    });
    res.json(task);
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "משימה לא נמצאה" });
    throw e;
  }
});

// Move a task to a status column and persist the resulting order of that column
// (covers both cross-column drag and same-column reordering in a single call).
router.put("/:id/move", async (req, res) => {
  const id = Number(req.params.id);
  const { status, orderedIds } = req.body ?? {};
  if (!TASK_STATUSES.includes(status)) return res.status(400).json({ error: "סטטוס לא תקין" });
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "חסר סדר משימות" });

  const isDone = status === "done";
  await prisma.$transaction([
    prisma.task.update({
      where: { id },
      data: { status, completedAt: isDone ? new Date() : null },
    }),
    ...orderedIds.map((taskId: number, index: number) =>
      prisma.task.update({ where: { id: Number(taskId) }, data: { position: index } })
    ),
  ]);

  const task = await prisma.task.findUnique({ where: { id }, include: { assignee: true } });
  res.json(task);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await prisma.task.delete({ where: { id } }).catch(() => {});
  res.json({ ok: true });
});

export default router;
