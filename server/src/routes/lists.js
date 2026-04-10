import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

function insertAt(arr, index, value) {
  const out = [...arr];
  out.splice(index, 0, value);
  return out;
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

// Get all lists for a user
router.get('/user/:token', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { token: req.params.token } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const lists = await prisma.list.findMany({
      where: { userId: user.id },
      include: { template: { select: { id: true, title: true } } },
      orderBy: [
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
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

    const { title, type, templateId, parentId } = req.body;
    const normalizedParentId = parentId || null;

    if (normalizedParentId) {
      const parent = await prisma.list.findUnique({
        where: { id: normalizedParentId },
        select: { id: true, userId: true },
      });
      if (!parent || parent.userId !== user.id) {
        return res.status(400).json({ error: 'Parent list not found' });
      }
    }

    const maxPos = await prisma.list.aggregate({
      where: { userId: user.id, parentId: normalizedParentId },
      _max: { position: true },
    });
    const position = (maxPos._max.position ?? -1) + 1;

    const list = await prisma.list.create({
      data: {
        userId: user.id,
        title,
        type: type || 'CHECKLIST',
        templateId: templateId || null,
        parentId: normalizedParentId,
        position,
      },
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
    const { title, type, collapsed } = req.body;
    const existingList = await prisma.list.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { submissions: true } },
      },
    });
    if (!existingList) return res.status(404).json({ error: 'List not found' });

    if (type && type !== existingList.type && existingList._count.submissions > 0) {
      return res.status(400).json({ error: 'Cannot change list type after submissions exist' });
    }

    if (type && type !== existingList.type && existingList.templateId) {
      return res.status(400).json({ error: 'Cannot change list type while linked to a template' });
    }

    const list = await prisma.list.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(type && { type }),
        ...(collapsed !== undefined && { collapsed }),
      },
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

// Duplicate a template-linked list into an editable, unlinked copy
router.post('/:id/duplicate-detached', async (req, res) => {
  try {
    const source = await prisma.list.findUnique({
      where: { id: req.params.id },
      include: {
        items: {
          orderBy: [
            { position: 'asc' },
            { id: 'asc' },
          ],
        },
      },
    });
    if (!source) return res.status(404).json({ error: 'List not found' });
    if (!source.templateId) {
      return res.status(400).json({ error: 'List is not linked to a template' });
    }

    const duplicated = await prisma.$transaction(async (tx) => {
      await tx.list.updateMany({
        where: {
          userId: source.userId,
          parentId: source.parentId,
          position: { gt: source.position },
        },
        data: { position: { increment: 1 } },
      });

      const copy = await tx.list.create({
        data: {
          userId: source.userId,
          parentId: source.parentId,
          title: `${source.title} (Custom)`,
          type: source.type,
          position: source.position + 1,
          templateId: null,
        },
      });

      const itemIdMap = {};
      for (const srcItem of source.items) {
        const created = await tx.listItem.create({
          data: {
            listId: copy.id,
            title: srcItem.title,
            position: srcItem.position,
            unit: srcItem.unit,
            collapsed: srcItem.collapsed,
            parentId: null,
          },
        });
        itemIdMap[srcItem.id] = created.id;
      }

      for (const srcItem of source.items) {
        if (srcItem.parentId && itemIdMap[srcItem.parentId]) {
          await tx.listItem.update({
            where: { id: itemIdMap[srcItem.id] },
            data: { parentId: itemIdMap[srcItem.parentId] },
          });
        }
      }

      return copy;
    });

    const list = await prisma.list.findUnique({
      where: { id: duplicated.id },
      include: { template: { select: { id: true, title: true } } },
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Move/reorder list in a user's sidebar
router.post('/:id/move', async (req, res) => {
  try {
    const { newParentId, newIndex } = req.body;
    const moving = await prisma.list.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, parentId: true },
    });
    if (!moving) return res.status(404).json({ error: 'List not found' });

    const allLists = await prisma.list.findMany({
      where: { userId: moving.userId },
      select: { id: true, parentId: true, position: true },
      orderBy: [
        { position: 'asc' },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
    });

    const normalizedParentId = newParentId || null;
    if (normalizedParentId) {
      const parent = allLists.find(l => l.id === normalizedParentId);
      if (!parent) return res.status(400).json({ error: 'New parent not found' });
      if (parent.id === moving.id) return res.status(400).json({ error: 'Cannot parent list to itself' });
      if (isDescendant(allLists, moving.id, normalizedParentId)) {
        return res.status(400).json({ error: 'Cannot move list under its own descendant' });
      }
    }

    const oldParentId = moving.parentId || null;
    const targetSiblings = allLists
      .filter(l => (l.parentId || null) === normalizedParentId && l.id !== moving.id)
      .sort((a, b) => a.position - b.position)
      .map(l => l.id);

    const maxIndex = targetSiblings.length;
    const safeIndex = Math.max(0, Math.min(Number.isInteger(newIndex) ? newIndex : maxIndex, maxIndex));
    const newSiblingOrder = insertAt(targetSiblings, safeIndex, moving.id);

    const oldSiblings = allLists
      .filter(l => (l.parentId || null) === oldParentId && l.id !== moving.id)
      .sort((a, b) => a.position - b.position)
      .map(l => l.id);

    await prisma.$transaction(async tx => {
      await tx.list.update({
        where: { id: moving.id },
        data: { parentId: normalizedParentId },
      });

      if (oldParentId !== normalizedParentId) {
        for (let i = 0; i < oldSiblings.length; i++) {
          await tx.list.update({ where: { id: oldSiblings[i] }, data: { position: i } });
        }
      }

      for (let i = 0; i < newSiblingOrder.length; i++) {
        await tx.list.update({ where: { id: newSiblingOrder[i] }, data: { position: i } });
      }
    });

    const list = await prisma.list.findUnique({ where: { id: moving.id } });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- List Items ----------

// Add item
router.post('/:id/items', async (req, res) => {
  try {
    const list = await prisma.list.findUnique({
      where: { id: req.params.id },
      select: { id: true, templateId: true },
    });
    if (!list) return res.status(404).json({ error: 'List not found' });
    if (list.templateId) {
      return res.status(400).json({ error: 'This list is managed by a template. Ask an admin to update the template.' });
    }

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
    const existing = await prisma.listItem.findUnique({
      where: { id: req.params.itemId },
      include: { list: { select: { templateId: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const isTemplateLinked = !!existing.list?.templateId;
    const modifiesStructureOrContent =
      title !== undefined || unit !== undefined || position !== undefined || parentId !== undefined;
    if (isTemplateLinked && modifiesStructureOrContent) {
      return res.status(400).json({ error: 'This list is managed by a template. Ask an admin to update the template.' });
    }

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

// Move/reorder item (drag-drop support)
router.post('/items/:itemId/move', async (req, res) => {
  try {
    const { newParentId, newIndex } = req.body;
    const moving = await prisma.listItem.findUnique({
      where: { id: req.params.itemId },
      include: { list: { select: { templateId: true } } },
    });
    if (!moving) return res.status(404).json({ error: 'Item not found' });
    if (moving.list?.templateId) {
      return res.status(400).json({ error: 'This list is managed by a template. Ask an admin to update the template.' });
    }

    const allItems = await prisma.listItem.findMany({
      where: { listId: moving.listId },
      select: { id: true, parentId: true, position: true },
      orderBy: { position: 'asc' },
    });

    const normalizedParentId = newParentId || null;
    if (normalizedParentId) {
      const parent = allItems.find(i => i.id === normalizedParentId);
      if (!parent) return res.status(400).json({ error: 'New parent not found' });
      if (parent.id === moving.id) return res.status(400).json({ error: 'Cannot parent item to itself' });
      if (isDescendant(allItems, moving.id, normalizedParentId)) {
        return res.status(400).json({ error: 'Cannot move item under its own descendant' });
      }
    }

    const oldParentId = moving.parentId || null;
    const targetSiblings = allItems
      .filter(i => (i.parentId || null) === normalizedParentId && i.id !== moving.id)
      .sort((a, b) => a.position - b.position)
      .map(i => i.id);

    const maxIndex = targetSiblings.length;
    const safeIndex = Math.max(0, Math.min(Number.isInteger(newIndex) ? newIndex : maxIndex, maxIndex));
    const newSiblingOrder = insertAt(targetSiblings, safeIndex, moving.id);

    const oldSiblings = allItems
      .filter(i => (i.parentId || null) === oldParentId && i.id !== moving.id)
      .sort((a, b) => a.position - b.position)
      .map(i => i.id);

    await prisma.$transaction(async tx => {
      await tx.listItem.update({
        where: { id: moving.id },
        data: { parentId: normalizedParentId },
      });

      if (oldParentId !== normalizedParentId) {
        for (let i = 0; i < oldSiblings.length; i++) {
          await tx.listItem.update({ where: { id: oldSiblings[i] }, data: { position: i } });
        }
      }

      for (let i = 0; i < newSiblingOrder.length; i++) {
        await tx.listItem.update({ where: { id: newSiblingOrder[i] }, data: { position: i } });
      }
    });

    const item = await prisma.listItem.findUnique({ where: { id: moving.id } });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete item
router.delete('/items/:itemId', async (req, res) => {
  try {
    const existing = await prisma.listItem.findUnique({
      where: { id: req.params.itemId },
      include: { list: { select: { templateId: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    if (existing.list?.templateId) {
      return res.status(400).json({ error: 'This list is managed by a template. Ask an admin to update the template.' });
    }

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
