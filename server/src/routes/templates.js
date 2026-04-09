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

// Get all templates
router.get('/', async (_req, res) => {
  try {
    const templates = await prisma.template.findMany({ orderBy: { updatedAt: 'desc' } });
    res.json(templates);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single template with items tree
router.get('/:id', async (req, res) => {
  try {
    const template = await prisma.template.findUnique({
      where: { id: req.params.id },
      include: {
        items: { orderBy: { position: 'asc' } },
        templateProjects: { orderBy: { position: 'asc' } },
      },
    });
    if (!template) return res.status(404).json({ error: 'Not found' });
    res.json({
      ...template,
      itemsTree: buildTree(template.items),
      projectsTree: buildTree(template.templateProjects),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create template (admin only)
router.post('/', async (req, res) => {
  try {
    const adminToken = process.env.ADMIN_TOKEN;
    if (req.headers['x-admin-token'] !== adminToken) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { title, type, description } = req.body;
    const template = await prisma.template.create({ data: { title, type, description } });
    res.json(template);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update template (admin only) — propagates to all linked lists
router.patch('/:id', async (req, res) => {
  try {
    const adminToken = process.env.ADMIN_TOKEN;
    if (req.headers['x-admin-token'] !== adminToken) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { title, description, items } = req.body;
    const template = await prisma.template.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
      },
    });

    // If items provided, replace all template items
    if (items) {
      await prisma.templateItem.deleteMany({ where: { templateId: req.params.id } });
      const idMap = {};
      for (const item of items) {
        const ti = await prisma.templateItem.create({
          data: {
            templateId: req.params.id,
            title: item.title,
            position: item.position,
            unit: item.unit || null,
            parentId: null,
          },
        });
        idMap[item.tempId] = ti.id;
      }
      for (const item of items) {
        if (item.tempParentId && idMap[item.tempParentId]) {
          await prisma.templateItem.update({
            where: { id: idMap[item.tempId] },
            data: { parentId: idMap[item.tempParentId] },
          });
        }
      }

      // Auto-sync all lists using this template
      const linkedLists = await prisma.list.findMany({ where: { templateId: req.params.id } });
      for (const list of linkedLists) {
        await prisma.listItem.deleteMany({ where: { listId: list.id } });
        const liMap = {};
        for (const item of items) {
          const li = await prisma.listItem.create({
            data: { listId: list.id, title: item.title, position: item.position, unit: item.unit || null, parentId: null },
          });
          liMap[item.tempId] = li.id;
        }
        for (const item of items) {
          if (item.tempParentId && liMap[item.tempParentId]) {
            await prisma.listItem.update({
              where: { id: liMap[item.tempId] },
              data: { parentId: liMap[item.tempParentId] },
            });
          }
        }
      }
    }

    res.json(template);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete template (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const adminToken = process.env.ADMIN_TOKEN;
    if (req.headers['x-admin-token'] !== adminToken) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma.template.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add template item (admin only)
router.post('/:id/items', async (req, res) => {
  try {
    const adminToken = process.env.ADMIN_TOKEN;
    if (req.headers['x-admin-token'] !== adminToken) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { title, parentId, unit } = req.body;
    const maxPos = await prisma.templateItem.aggregate({
      where: { templateId: req.params.id, parentId: parentId || null },
      _max: { position: true },
    });
    const item = await prisma.templateItem.create({
      data: {
        templateId: req.params.id,
        title,
        position: (maxPos._max.position ?? -1) + 1,
        parentId: parentId || null,
        unit: unit || null,
      },
    });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
