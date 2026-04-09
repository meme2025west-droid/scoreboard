import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

// Get all timelog entries for a user (optionally filtered by date range)
router.get('/user/:token', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { from, to } = req.query;
    const where = { userId: user.id };
    if (from || to) {
      where.startTime = {};
      if (from) where.startTime.gte = new Date(from);
      if (to) where.startTime.lte = new Date(to);
    }

    const entries = await prisma.timelogEntry.findMany({
      where,
      include: { project: true },
      orderBy: { startTime: 'desc' },
    });
    res.json(entries);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get last entry for a user (to calculate default duration)
router.get('/user/:token/last', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const entry = await prisma.timelogEntry.findFirst({
      where: { userId: user.id },
      orderBy: { submittedAt: 'desc' },
    });
    res.json(entry || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create timelog entry
router.post('/user/:token', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { projectId, comment, startTime, endTime } = req.body;
    const entry = await prisma.timelogEntry.create({
      data: {
        userId: user.id,
        projectId,
        comment: comment || null,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
      },
      include: { project: true },
    });
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update timelog entry
router.patch('/:id', async (req, res) => {
  try {
    const { projectId, comment, startTime, endTime } = req.body;
    const entry = await prisma.timelogEntry.update({
      where: { id: req.params.id },
      data: {
        ...(projectId && { projectId }),
        ...(comment !== undefined && { comment }),
        ...(startTime && { startTime: new Date(startTime) }),
        ...(endTime !== undefined && { endTime: endTime ? new Date(endTime) : null }),
      },
      include: { project: true },
    });
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete timelog entry
router.delete('/:id', async (req, res) => {
  try {
    await prisma.timelogEntry.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Analytics: time per project for a user in a date range
router.get('/user/:token/analytics', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { from, to } = req.query;
    const where = { userId: user.id };
    if (from || to) {
      where.startTime = {};
      if (from) where.startTime.gte = new Date(from);
      if (to) where.startTime.lte = new Date(to);
    }

    const entries = await prisma.timelogEntry.findMany({
      where,
      include: { project: true },
    });

    // Aggregate duration per project
    const projectMap = {};
    for (const e of entries) {
      const start = new Date(e.startTime);
      const end = e.endTime ? new Date(e.endTime) : new Date(e.submittedAt);
      const durationMs = Math.max(0, end - start);
      const durationMin = durationMs / 60000;

      const pid = e.projectId;
      if (!projectMap[pid]) {
        projectMap[pid] = { projectId: pid, title: e.project.title, color: e.project.color, totalMinutes: 0 };
      }
      projectMap[pid].totalMinutes += durationMin;
    }

    res.json(Object.values(projectMap).sort((a, b) => b.totalMinutes - a.totalMinutes));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
