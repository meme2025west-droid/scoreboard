import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import usersRouter from './routes/users.js';
import listsRouter from './routes/lists.js';
import submissionsRouter from './routes/submissions.js';
import timelogRouter from './routes/timelog.js';
import effortRouter from './routes/effort.js';
import projectsRouter from './routes/projects.js';
import templatesRouter from './routes/templates.js';
import adminRouter from './routes/admin.js';
import { runtimeBackupDir, runtimeDbPath } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();
  const clientBuild = process.env.CLIENT_DIST_DIR || path.join(__dirname, '../../client/dist');

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json());

  // API routes
  app.use('/api/users', usersRouter);
  app.use('/api/lists', listsRouter);
  app.use('/api/submissions', submissionsRouter);
  app.use('/api/timelog', timelogRouter);
  app.use('/api/effort', effortRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/admin', adminRouter);

  // Serve React build in production
  app.use(express.static(clientBuild));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });

  return app;
}

export function startServer(port = process.env.PORT || 3001) {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
      console.log(`Scorecard database: ${runtimeDbPath}`);
      console.log(`Scorecard backups: ${runtimeBackupDir}`);
      resolve(server);
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startServer();
}
