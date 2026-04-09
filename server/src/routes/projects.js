import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

function buildTree(items) {
  const map = {};
  items.forEach(i => { map[i.id] = { ...i, children: [] }; });
  const roots = [];
  items.forEach(i => {
    if (i.parentId && map[i.parentId]) {
      map[i.parentId].children.push(map[i.id]);
    } else {
      roots.push(map[i.id]);
    }
  });
  return roots;
}

// Get all projects for a user
router.get('/user/:token', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { position: 'asc' },
    });
    res.json(buildTree(projects));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create project
router.post('/user/:token', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { title, parentId, color, templateProjectId } = req.body;
    const maxPos = await prisma.project.aggregate({
      where: { userId: user.id, parentId: parentId || null },
      _max: { position: true },
    });
    const position = (maxPos._max.position ?? -1) + 1;
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        title,
        parentId: parentId || null,
        color: color || null,
        templateProjectId: templateProjectId || null,
        position,
      },
    });
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update project
router.patch('/:id', async (req, res) => {
  try {
    const { title, color, parentId, position } = req.body;
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(color !== undefined && { color }),
        ...(parentId !== undefined && { parentId }),
        ...(position !== undefined && { position }),
      },
    });
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
