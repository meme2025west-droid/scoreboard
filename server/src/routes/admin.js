import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

function requireAdmin(req, res) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (req.headers['x-admin-token'] !== adminToken) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// Verify admin token
router.get('/verify', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true });
});

// Get all users
router.get('/users', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, token: true, timezone: true, createdAt: true },
    });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all lists for a specific user (admin view)
router.get('/users/:userId/lists', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const lists = await prisma.list.findMany({
      where: { userId: req.params.userId },
      include: { template: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(lists);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get timelog entries for a specific user (admin view)
router.get('/users/:userId/timelog', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { from, to } = req.query;
    const where = { userId: req.params.userId };
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

// Get stats overview for all users
router.get('/overview', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [userCount, listCount, submissionCount, timelogCount] = await Promise.all([
      prisma.user.count(),
      prisma.list.count(),
      prisma.submission.count(),
      prisma.timelogEntry.count(),
    ]);
    res.json({ userCount, listCount, submissionCount, timelogCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
