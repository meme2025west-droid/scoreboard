import { Router } from 'express';
import { nanoid } from 'nanoid';
import prisma from '../db.js';

const router = Router();

// Create a new user, returns their unique token URL
router.post('/', async (req, res) => {
  try {
    const token = nanoid(48);
    const user = await prisma.user.create({ data: { token } });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get user by token
router.get('/:token', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update user timezone
router.patch('/:token', async (req, res) => {
  try {
    const { timezone } = req.body;
    const user = await prisma.user.update({
      where: { token: req.params.token },
      data: { timezone },
    });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
