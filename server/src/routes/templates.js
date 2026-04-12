import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

function isAdmin(req) {
  return req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
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

function insertAt(arr, index, value) {
  const clone = [...arr];
  clone.splice(index, 0, value);
  return clone;
}

function isDescendant(items, ancestorId, candidateId) {
  let currentId = candidateId;

  while (currentId) {
    if (currentId === ancestorId) return true;
    currentId = items.find(item => item.id === currentId)?.parentId || null;
  }

  return false;
}

function collectDescendantIds(items, rootId) {
  const ids = [];

  function visit(itemId) {
    const children = items.filter(item => item.parentId === itemId);
    children.forEach(child => visit(child.id));
    ids.push(itemId);
  }

  visit(rootId);
  return ids;
}

async function syncLinkedListsFromTemplate(templateId) {
  const [templateItems, linkedLists] = await Promise.all([
    prisma.templateItem.findMany({
      where: { templateId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    }),
    prisma.list.findMany({
      where: { templateId },
      include: { items: true },
    }),
  ]);

  for (const list of linkedLists) {
    const existingByTemplateItemId = {};
    const existingByTitle = {};
    for (const li of list.items) {
      if (li.templateItemId) {
        existingByTemplateItemId[li.templateItemId] = li.id;
      } else {
        existingByTitle[li.title] = li.id;
      }
    }

    const claimedIds = new Set();
    const idMap = {};

    for (const ti of templateItems) {
      let existingId = existingByTemplateItemId[ti.id];
      if (!existingId) {
        const byTitle = existingByTitle[ti.title];
        if (byTitle && !claimedIds.has(byTitle)) existingId = byTitle;
      }

      if (existingId && !claimedIds.has(existingId)) {
        claimedIds.add(existingId);
        await prisma.listItem.update({
          where: { id: existingId },
          data: { templateItemId: ti.id, title: ti.title, position: ti.position, unit: ti.unit, collapsed: ti.collapsed, notes: ti.notes, parentId: null },
        });
        idMap[ti.id] = existingId;
      } else {
        const listItem = await prisma.listItem.create({
          data: { listId: list.id, templateItemId: ti.id, title: ti.title, position: ti.position, unit: ti.unit, collapsed: ti.collapsed, notes: ti.notes, parentId: null },
        });
        idMap[ti.id] = listItem.id;
      }
    }

    // Delete orphaned items with no submissions
    const matchedIds = new Set(Object.values(idMap));
    for (const li of list.items) {
      if (!matchedIds.has(li.id)) {
        const subCount = await prisma.submissionItem.count({ where: { itemId: li.id } });
        if (subCount === 0) await prisma.listItem.delete({ where: { id: li.id } });
      }
    }

    for (const ti of templateItems) {
      if (ti.parentId && idMap[ti.parentId]) {
        await prisma.listItem.update({
          where: { id: idMap[ti.id] },
          data: { parentId: idMap[ti.parentId] },
        });
      }
    }
  }
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
    if (!isAdmin(req)) {
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
    if (!isAdmin(req)) {
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
            collapsed: item.collapsed ?? false,
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

      await syncLinkedListsFromTemplate(req.params.id);
    }

    res.json(template);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete template (admin only)
router.delete('/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) {
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
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { title, parentId, unit, collapsed } = req.body;
    const template = await prisma.template.findUnique({
      where: { id: req.params.id },
      select: { id: true, type: true },
    });
    if (!template) {
      return res.status(404).json({ error: 'Not found' });
    }
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
        unit: template.type === 'CHECKLIST' ? unit || null : null,
        collapsed: collapsed ?? false,
      },
    });
    await syncLinkedListsFromTemplate(req.params.id);
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/items/:itemId', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const existing = await prisma.templateItem.findUnique({
      where: { id: req.params.itemId },
      include: { template: { select: { id: true, type: true } } },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const { title, unit, position, parentId, collapsed } = req.body;
    const item = await prisma.templateItem.update({
      where: { id: req.params.itemId },
      data: {
        ...(title !== undefined && { title }),
        ...(position !== undefined && { position }),
        ...(parentId !== undefined && { parentId }),
        ...(collapsed !== undefined && { collapsed }),
        ...(unit !== undefined && { unit: existing.template.type === 'CHECKLIST' ? unit : null }),
      },
    });

    await syncLinkedListsFromTemplate(existing.templateId);
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/items/:itemId/move', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { newParentId, newIndex } = req.body;
    const moving = await prisma.templateItem.findUnique({ where: { id: req.params.itemId } });
    if (!moving) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const allItems = await prisma.templateItem.findMany({
      where: { templateId: moving.templateId },
      select: { id: true, parentId: true, position: true },
      orderBy: [
        { position: 'asc' },
        { id: 'asc' },
      ],
    });

    const normalizedParentId = newParentId || null;
    if (normalizedParentId) {
      const parent = allItems.find(item => item.id === normalizedParentId);
      if (!parent) return res.status(400).json({ error: 'New parent not found' });
      if (parent.id === moving.id) return res.status(400).json({ error: 'Cannot parent item to itself' });
      if (isDescendant(allItems, moving.id, normalizedParentId)) {
        return res.status(400).json({ error: 'Cannot move item under its own descendant' });
      }
    }

    const oldParentId = moving.parentId || null;
    const targetSiblings = allItems
      .filter(item => (item.parentId || null) === normalizedParentId && item.id !== moving.id)
      .sort((a, b) => a.position - b.position)
      .map(item => item.id);

    const maxIndex = targetSiblings.length;
    const safeIndex = Math.max(0, Math.min(Number.isInteger(newIndex) ? newIndex : maxIndex, maxIndex));
    const newSiblingOrder = insertAt(targetSiblings, safeIndex, moving.id);

    const oldSiblings = allItems
      .filter(item => (item.parentId || null) === oldParentId && item.id !== moving.id)
      .sort((a, b) => a.position - b.position)
      .map(item => item.id);

    await prisma.$transaction(async tx => {
      await tx.templateItem.update({
        where: { id: moving.id },
        data: { parentId: normalizedParentId },
      });

      if (oldParentId !== normalizedParentId) {
        for (let index = 0; index < oldSiblings.length; index += 1) {
          await tx.templateItem.update({
            where: { id: oldSiblings[index] },
            data: { position: index },
          });
        }
      }

      for (let index = 0; index < newSiblingOrder.length; index += 1) {
        await tx.templateItem.update({
          where: { id: newSiblingOrder[index] },
          data: { position: index },
        });
      }
    });

    await syncLinkedListsFromTemplate(moving.templateId);
    const item = await prisma.templateItem.findUnique({ where: { id: moving.id } });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/items/:itemId', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const item = await prisma.templateItem.findUnique({ where: { id: req.params.itemId } });
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const templateItems = await prisma.templateItem.findMany({
      where: { templateId: item.templateId },
      select: { id: true, parentId: true },
    });
    const deleteIds = collectDescendantIds(templateItems, item.id);

    await prisma.$transaction(async tx => {
      for (const deleteId of deleteIds) {
        await tx.templateItem.delete({ where: { id: deleteId } });
      }
    });

    await syncLinkedListsFromTemplate(item.templateId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/projects', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { title, parentId, color } = req.body;
    const template = await prisma.template.findUnique({
      where: { id: req.params.id },
      select: { id: true, type: true },
    });
    if (!template) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (template.type !== 'TIMELOG') {
      return res.status(400).json({ error: 'Template is not a timelog project set' });
    }

    const maxPos = await prisma.templateProject.aggregate({
      where: { templateId: req.params.id, parentId: parentId || null },
      _max: { position: true },
    });

    const project = await prisma.templateProject.create({
      data: {
        templateId: req.params.id,
        title,
        parentId: parentId || null,
        color: color || null,
        position: (maxPos._max.position ?? -1) + 1,
      },
    });

    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/projects/:projectId', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const existing = await prisma.templateProject.findUnique({ where: { id: req.params.projectId } });
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { title, color, position, parentId } = req.body;
    const project = await prisma.templateProject.update({
      where: { id: req.params.projectId },
      data: {
        ...(title !== undefined && { title }),
        ...(color !== undefined && { color }),
        ...(position !== undefined && { position }),
        ...(parentId !== undefined && { parentId }),
      },
    });

    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/projects/:projectId/move', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { newParentId, newIndex } = req.body;
    const moving = await prisma.templateProject.findUnique({ where: { id: req.params.projectId } });
    if (!moving) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const allProjects = await prisma.templateProject.findMany({
      where: { templateId: moving.templateId },
      select: { id: true, parentId: true, position: true },
      orderBy: [
        { position: 'asc' },
        { id: 'asc' },
      ],
    });

    const normalizedParentId = newParentId || null;
    if (normalizedParentId) {
      const parent = allProjects.find(project => project.id === normalizedParentId);
      if (!parent) return res.status(400).json({ error: 'New parent not found' });
      if (parent.id === moving.id) return res.status(400).json({ error: 'Cannot parent project to itself' });
      if (isDescendant(allProjects, moving.id, normalizedParentId)) {
        return res.status(400).json({ error: 'Cannot move project under its own descendant' });
      }
    }

    const oldParentId = moving.parentId || null;
    const targetSiblings = allProjects
      .filter(project => (project.parentId || null) === normalizedParentId && project.id !== moving.id)
      .sort((a, b) => a.position - b.position)
      .map(project => project.id);

    const maxIndex = targetSiblings.length;
    const safeIndex = Math.max(0, Math.min(Number.isInteger(newIndex) ? newIndex : maxIndex, maxIndex));
    const newSiblingOrder = insertAt(targetSiblings, safeIndex, moving.id);

    const oldSiblings = allProjects
      .filter(project => (project.parentId || null) === oldParentId && project.id !== moving.id)
      .sort((a, b) => a.position - b.position)
      .map(project => project.id);

    await prisma.$transaction(async tx => {
      await tx.templateProject.update({
        where: { id: moving.id },
        data: { parentId: normalizedParentId },
      });

      if (oldParentId !== normalizedParentId) {
        for (let index = 0; index < oldSiblings.length; index += 1) {
          await tx.templateProject.update({
            where: { id: oldSiblings[index] },
            data: { position: index },
          });
        }
      }

      for (let index = 0; index < newSiblingOrder.length; index += 1) {
        await tx.templateProject.update({
          where: { id: newSiblingOrder[index] },
          data: { position: index },
        });
      }
    });

    const project = await prisma.templateProject.findUnique({ where: { id: moving.id } });
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/projects/:projectId', async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const project = await prisma.templateProject.findUnique({ where: { id: req.params.projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const templateProjects = await prisma.templateProject.findMany({
      where: { templateId: project.templateId },
      select: { id: true, parentId: true },
    });
    const deleteIds = collectDescendantIds(templateProjects, project.id);

    await prisma.$transaction(async tx => {
      for (const deleteId of deleteIds) {
        await tx.templateProject.delete({ where: { id: deleteId } });
      }
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
