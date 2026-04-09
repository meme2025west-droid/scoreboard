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

// Get all lists for a user
router.get('/user/:token', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const lists = await prisma.list.findMany({
      where: { userId: user.id },
      include: { template: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(lists);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get a single list with items tree
router.get('/:id', async (req, res) => {
  try {
    const list = await prisma.list.findUnique({
      where: { id: req.params.id },
      include: {
        items: { orderBy: { position: 'asc' } },
        template: { select: { id: true, title: true, updatedAt: true } },
      },
    });
    if (!list) return res.status(404).json({ error: 'List not found' });
    const tree = buildTree(list.items);
    res.json({ ...list, itemsTree: tree });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create a list (blank or from template)
router.post('/user/:token', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { title, type, templateId } = req.body;

    const list = await prisma.list.create({
      data: { userId: user.id, title, type: type || 'CHECKLIST', templateId: templateId || null },
    });

    // If from template, copy items
    if (templateId) {
      const tItems = await prisma.templateItem.findMany({
        where: { templateId },
        orderBy: { position: 'asc' },
      });
      // Map old template item IDs to new ListItem IDs
      const idMap = {};
      // first pass: create items without parentId
      for (const ti of tItems) {
        const li = await prisma.listItem.create({
          data: {
            listId: list.id,
            title: ti.title,
            position: ti.position,
            unit: ti.unit || null,
            parentId: null,
          },
        });
        idMap[ti.id] = li.id;
      }
      // second pass: set parentId
      for (const ti of tItems) {
        if (ti.parentId && idMap[ti.parentId]) {
          await prisma.listItem.update({
            where: { id: idMap[ti.id] },
            data: { parentId: idMap[ti.parentId] },
          });
        }
      }
    }

    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update list title / type
router.patch('/:id', async (req, res) => {
  try {
    const { title, type } = req.body;
    const list = await prisma.list.update({
      where: { id: req.params.id },
      data: { ...(title && { title }), ...(type && { type }) },
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a list
router.delete('/:id', async (req, res) => {
  try {
    await prisma.list.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- List Items ----------

// Add item
router.post('/:id/items', async (req, res) => {
  try {
    const { title, parentId, unit } = req.body;
    const maxPos = await prisma.listItem.aggregate({
      where: { listId: req.params.id, parentId: parentId || null },
      _max: { position: true },
    });
    const position = (maxPos._max.position ?? -1) + 1;
    const item = await prisma.listItem.create({
      data: { listId: req.params.id, title, position, parentId: parentId || null, unit: unit || null },
    });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update item
router.patch('/items/:itemId', async (req, res) => {
  try {
    const { title, unit, collapsed, position, parentId } = req.body;
    const item = await prisma.listItem.update({
      where: { id: req.params.itemId },
      data: {
        ...(title !== undefined && { title }),
        ...(unit !== undefined && { unit }),
        ...(collapsed !== undefined && { collapsed }),
        ...(position !== undefined && { position }),
        ...(parentId !== undefined && { parentId }),
      },
    });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete item
router.delete('/items/:itemId', async (req, res) => {
  try {
    await prisma.listItem.delete({ where: { id: req.params.itemId } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sync list from template (pull latest template changes)
router.post('/:id/sync-template', async (req, res) => {
  try {
    const list = await prisma.list.findUnique({ where: { id: req.params.id } });
    if (!list || !list.templateId) return res.status(400).json({ error: 'No template linked' });

    const tItems = await prisma.templateItem.findMany({
      where: { templateId: list.templateId },
      orderBy: { position: 'asc' },
    });

    // Delete existing items, re-create from template
    await prisma.listItem.deleteMany({ where: { listId: list.id } });

    const idMap = {};
    for (const ti of tItems) {
      const li = await prisma.listItem.create({
        data: { listId: list.id, title: ti.title, position: ti.position, unit: ti.unit || null, parentId: null },
      });
      idMap[ti.id] = li.id;
    }
    for (const ti of tItems) {
      if (ti.parentId && idMap[ti.parentId]) {
        await prisma.listItem.update({
          where: { id: idMap[ti.id] },
          data: { parentId: idMap[ti.parentId] },
        });
      }
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
