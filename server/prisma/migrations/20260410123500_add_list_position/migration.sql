ALTER TABLE "List" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY userId
      ORDER BY createdAt DESC, id ASC
    ) - 1 AS rn
  FROM "List"
)
UPDATE "List"
SET "position" = (
  SELECT ranked.rn
  FROM ranked
  WHERE ranked.id = "List".id
);
