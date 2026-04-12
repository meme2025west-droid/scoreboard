import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..');
const LEGACY_DB_PATHS = [
	path.join(SERVER_DIR, 'dev.db'),
	path.join(SERVER_DIR, 'prisma', 'dev.db'),
	path.join(SERVER_DIR, 'restore', 'dev.db'),
];

function getDefaultDataRoot() {
	if (process.env.SCORECARD_DATA_DIR) return process.env.SCORECARD_DATA_DIR;
	if (process.platform === 'win32' && process.env.APPDATA) {
		return path.join(process.env.APPDATA, 'Scorecard');
	}
	if (process.platform === 'darwin') {
		return path.join(os.homedir(), 'Library', 'Application Support', 'Scorecard');
	}
	return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'scorecard');
}

function parseFileUrlPath(databaseUrl) {
	if (!databaseUrl?.startsWith('file:')) return null;
	return databaseUrl.slice('file:'.length).split('?')[0];
}

function fileSizeOrZero(filePath) {
	try {
		return fs.statSync(filePath).size;
	} catch {
		return 0;
	}
}

function ensureDirectory(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
}

function selectLegacySource(targetDbPath) {
	const candidates = LEGACY_DB_PATHS
		.filter((candidate) => path.resolve(candidate) !== path.resolve(targetDbPath))
		.filter((candidate) => fs.existsSync(candidate))
		.map((candidate) => ({
			path: candidate,
			stat: fs.statSync(candidate),
		}))
		.filter((candidate) => candidate.stat.size > 0)
		.sort((left, right) => {
			if (right.stat.size !== left.stat.size) return right.stat.size - left.stat.size;
			return right.stat.mtimeMs - left.stat.mtimeMs;
		});

	return candidates[0]?.path || null;
}

function maybeSeedRuntimeDatabase(targetDbPath) {
	if (fs.existsSync(targetDbPath)) return;

	const sourcePath = selectLegacySource(targetDbPath);
	if (!sourcePath) return;

	ensureDirectory(path.dirname(targetDbPath));
	fs.copyFileSync(sourcePath, targetDbPath);
}

function pruneOldBackups(backupDir) {
	const backups = fs.readdirSync(backupDir)
		.filter((name) => name.endsWith('.db'))
		.map((name) => ({
			name,
			path: path.join(backupDir, name),
			stat: fs.statSync(path.join(backupDir, name)),
		}))
		.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);

	for (const backup of backups.slice(20)) {
		fs.unlinkSync(backup.path);
	}
}

function createRuntimeBackup(dbPath, backupDir) {
	if (!fs.existsSync(dbPath)) return;
	if (fileSizeOrZero(dbPath) === 0) return;

	ensureDirectory(backupDir);
	const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
	const backupPath = path.join(backupDir, `dev-${timestamp}.db`);
	fs.copyFileSync(dbPath, backupPath);
	pruneOldBackups(backupDir);
}

function resolveRuntimeDatabasePath() {
	const configuredPath = parseFileUrlPath(process.env.DATABASE_URL);
	if (configuredPath && path.isAbsolute(configuredPath)) {
		ensureDirectory(path.dirname(configuredPath));
		return configuredPath;
	}

	const dataRoot = getDefaultDataRoot();
	const targetDbPath = path.join(dataRoot, 'data', 'dev.db');
	ensureDirectory(path.dirname(targetDbPath));
	maybeSeedRuntimeDatabase(targetDbPath);
	return targetDbPath;
}

export const runtimeDbPath = resolveRuntimeDatabasePath();
export const runtimeBackupDir = path.join(path.dirname(runtimeDbPath), '..', 'backups');

process.env.DATABASE_URL = `file:${runtimeDbPath}`;
createRuntimeBackup(runtimeDbPath, runtimeBackupDir);

const prisma = new PrismaClient();
export default prisma;


