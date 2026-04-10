import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

router.get('/user/:token', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { from, to } = req.query;
    const where = { userId: user.id };
    if (from || to) {
      where.loggedAt = {};
      if (from) where.loggedAt.gte = new Date(from);
      if (to) where.loggedAt.lte = new Date(to);
    }

    const entries = await prisma.effortLog.findMany({
      where,
      include: { project: true },
      orderBy: { loggedAt: 'desc' },
    });
    res.json(entries);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/user/:token', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { projectId, comment, loggedAt } = req.body;
    const entry = await prisma.effortLog.create({
      data: {
        userId: user.id,
        projectId,
        comment: comment || null,
        loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
      },
      include: { project: true },
    });
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { projectId, comment, loggedAt } = req.body;
    const entry = await prisma.effortLog.update({
      where: { id: req.params.id },
      data: {
        ...(projectId !== undefined && { projectId }),
        ...(comment !== undefined && { comment: comment || null }),
        ...(loggedAt !== undefined && { loggedAt: loggedAt ? new Date(loggedAt) : undefined }),
      },
      include: { project: true },
    });
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.effortLog.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/user/:token/analytics', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { from, to } = req.query;
    const where = { userId: user.id };
    if (from || to) {
      where.loggedAt = {};
      if (from) where.loggedAt.gte = new Date(from);
      if (to) where.loggedAt.lte = new Date(to);
    }

    const entries = await prisma.effortLog.findMany({
      where,
      include: { project: true },
    });

    const projectMap = {};
    for (const entry of entries) {
      const projectId = entry.projectId;
      if (!projectMap[projectId]) {
        projectMap[projectId] = {
          projectId,
          title: entry.project.title,
          color: entry.project.color,
          count: 0,
        };
      }
      projectMap[projectId].count += 1;
    }

    res.json(Object.values(projectMap).sort((a, b) => b.count - a.count));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;