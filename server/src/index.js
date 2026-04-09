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
import projectsRouter from './routes/projects.js';
import templatesRouter from './routes/templates.js';
import adminRouter from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/users', usersRouter);
app.use('/api/lists', listsRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/timelog', timelogRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/admin', adminRouter);

// Serve React build in production
const clientBuild = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuild));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
