import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

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
