import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

function startOfDay(dateValue) {
  const [y, m, d] = String(dateValue).split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfDay(dateValue) {
  const [y, m, d] = String(dateValue).split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function daysInclusive(fromDate, toDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.floor((toDate - fromDate) / msPerDay) + 1);
}

// Submit a list (create snapshot)
router.post('/', async (req, res) => {
  try {
    const { listId, notes, items } = req.body;
    // items: [{ itemId, checked, score, comment, numberValue }]
    const submission = await prisma.submission.create({
      data: {
        listId,
        notes: notes || null,
        items: {
          create: items.map(i => ({
            itemId: i.itemId,
            checked: i.checked ?? null,
            score: i.score ?? null,
            comment: i.comment || null,
            numberValue: i.numberValue ?? null,
          })),
        },
      },
      include: { items: true },
    });
    res.json(submission);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all submissions for a list (summary)
router.get('/list/:listId', async (req, res) => {
  try {
    const submissions = await prisma.submission.findMany({
      where: { listId: req.params.listId },
      orderBy: { submittedAt: 'desc' },
      select: { id: true, submittedAt: true, notes: true },
    });
    res.json(submissions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Detailed analytics for a list (all submissions with individual values)
router.get('/list/:listId/detailed-analytics', async (req, res) => {
  try {
    const list = await prisma.list.findUnique({
      where: { id: req.params.listId },
      include: {
        items: { orderBy: { position: 'asc' } },
      },
    });
    if (!list) return res.status(404).json({ error: 'List not found' });

    const { from, to } = req.query;
    const fromDate = from ? startOfDay(from) : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const toDate = to ? endOfDay(to) : endOfDay(new Date());

    const submissions = await prisma.submission.findMany({
      where: {
        listId: req.params.listId,
        submittedAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        items: true,
      },
      orderBy: { submittedAt: 'asc' },
    });

    // Group submissions by date
    const submissionsByDate = {};
    submissions.forEach(sub => {
      const dateStr = sub.submittedAt.toISOString().slice(0, 10);
      if (!submissionsByDate[dateStr]) {
        submissionsByDate[dateStr] = sub;
      }
    });
    const dates = Object.keys(submissionsByDate).sort();

    // For each item, build values per date
    const itemData = list.items.map(item => {
      const valuesByDate = {};
      dates.forEach(date => {
        const sub = submissionsByDate[date];
        if (sub) {
          const subItem = sub.items.find(si => si.itemId === item.id);
          if (subItem) {
            valuesByDate[date] = {
              checked: subItem.checked ?? null,
              score: subItem.score ?? null,
              numberValue: subItem.numberValue ?? null,
            };
          }
        }
      });

      return {
        id: item.id,
        parentId: item.parentId,
        title: item.title,
        unit: item.unit,
        collapsed: item.collapsed,
        valuesByDate,
      };
    });

    res.json({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      dates,
      items: itemData,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Checklist analytics for a list in a date range
router.get('/list/:listId/analytics', async (req, res) => {
  try {
    const list = await prisma.list.findUnique({
      where: { id: req.params.listId },
      include: {
        items: { orderBy: { position: 'asc' } },
      },
    });
    if (!list) return res.status(404).json({ error: 'List not found' });

    const { from, to } = req.query;
    const fromDate = from ? startOfDay(from) : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const toDate = to ? endOfDay(to) : endOfDay(new Date());

    const submissions = await prisma.submission.findMany({
      where: {
        listId: req.params.listId,
        submittedAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        items: true,
      },
      orderBy: { submittedAt: 'desc' },
    });

    const checkedDaysByItemId = {};
    for (const submission of submissions) {
      const dayKey = submission.submittedAt.toISOString().slice(0, 10);
      for (const item of submission.items) {
        if (!item.checked) continue;
        if (!checkedDaysByItemId[item.itemId]) checkedDaysByItemId[item.itemId] = new Set();
        checkedDaysByItemId[item.itemId].add(dayKey);
      }
    }

    res.json({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      rangeDays: daysInclusive(fromDate, toDate),
      items: list.items.map((item) => ({
        id: item.id,
        parentId: item.parentId,
        title: item.title,
        unit: item.unit,
        checkedDays: checkedDaysByItemId[item.id]?.size || 0,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get a single submission with items
router.get('/:id', async (req, res) => {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: {
        items: {
          include: { item: true },
        },
      },
    });
    if (!submission) return res.status(404).json({ error: 'Not found' });
    res.json(submission);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete submission
router.delete('/:id', async (req, res) => {
  try {
    await prisma.submission.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
