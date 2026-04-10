import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

function insertAt(arr, index, value) {
  const out = [...arr];
  out.splice(index, 0, value);
  return out;
}

function findById(items, id) {
  return items.find(item => item.id === id);
}

function buildChildrenMap(items) {
  const map = {};
  for (const item of items) {
    const key = item.parentId || '__root__';
    if (!map[key]) map[key] = [];
    map[key].push(item.id);
  }
  return map;
}

function isDescendant(items, ancestorId, maybeDescendantId) {
  const childrenMap = buildChildrenMap(items);
  const stack = [...(childrenMap[ancestorId] || [])];
  while (stack.length > 0) {
    const curr = stack.pop();
    if (curr === maybeDescendantId) return true;
    const children = childrenMap[curr] || [];
    for (const c of children) stack.push(c);
  }
  return false;
}

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
    const { title, color, parentId, position, starred } = req.body;
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(color !== undefined && { color }),
        ...(parentId !== undefined && { parentId }),
        ...(position !== undefined && { position }),
        ...(starred !== undefined && { starred }),
      },
    });
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Move/reorder project (drag-drop support)
router.post('/:id/move', async (req, res) => {
  try {
    const { newParentId, newIndex } = req.body;
    const moving = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!moving) return res.status(404).json({ error: 'Project not found' });

    const allProjects = await prisma.project.findMany({
      where: { userId: moving.userId },
      select: { id: true, parentId: true, position: true },
      orderBy: { position: 'asc' },
    });

    const normalizedParentId = newParentId || null;
    if (normalizedParentId) {
      const parent = findById(allProjects, normalizedParentId);
      if (!parent) return res.status(400).json({ error: 'New parent not found' });
      if (parent.id === moving.id) return res.status(400).json({ error: 'Cannot parent project to itself' });
      if (isDescendant(allProjects, moving.id, normalizedParentId)) {
        return res.status(400).json({ error: 'Cannot move project under its own descendant' });
      }
    }

    const oldParentId = moving.parentId || null;
    const targetSiblings = allProjects
      .filter(p => (p.parentId || null) === normalizedParentId && p.id !== moving.id)
      .sort((a, b) => a.position - b.position)
      .map(p => p.id);

    const maxIndex = targetSiblings.length;
    const safeIndex = Math.max(0, Math.min(Number.isInteger(newIndex) ? newIndex : maxIndex, maxIndex));
    const newSiblingOrder = insertAt(targetSiblings, safeIndex, moving.id);

    const oldSiblings = allProjects
      .filter(p => (p.parentId || null) === oldParentId && p.id !== moving.id)
      .sort((a, b) => a.position - b.position)
      .map(p => p.id);

    await prisma.$transaction(async tx => {
      await tx.project.update({
        where: { id: moving.id },
        data: { parentId: normalizedParentId },
      });

      if (oldParentId !== normalizedParentId) {
        for (let i = 0; i < oldSiblings.length; i++) {
          await tx.project.update({ where: { id: oldSiblings[i] }, data: { position: i } });
        }
      }

      for (let i = 0; i < newSiblingOrder.length; i++) {
        await tx.project.update({ where: { id: newSiblingOrder[i] }, data: { position: i } });
      }
    });

    const project = await prisma.project.findUnique({ where: { id: moving.id } });
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
