/**
 * Remote/Local Command Execution Helper
 *
 * When running on the production server, executes commands directly via bash.
 * When running on a dev machine, executes commands over SSH.
 *
 * Detection: If the APP_PATH directory exists locally, we're on the production server.
 */

import * as fs from 'fs';
import * as path from 'path';

const SSH_HOST = '167.71.242.157';
const SSH_USER = 'master_nrbudqgaus';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH || '~/.ssh/id_ed25519';
export const APP_PATH = '~/applications/gnhezcjyuk/public_html';

// Resolve ~ to actual home directory for local check
function resolveHome(p: string): string {
  if (p.startsWith('~/')) {
    const home = process.env.HOME || process.env.USERPROFILE || '/home';
    return path.join(home, p.substring(2));
  }
  return p;
}

/**
 * Detect if we're running on the production server.
 * Checks if the application directory exists locally.
 */
export function isProductionServer(): boolean {
  try {
    const resolved = resolveHome(APP_PATH);
    return fs.existsSync(resolved);
  } catch {
    return false;
  }
}

/**
 * Wrap a command to run either locally or via SSH.
 *
 * @param remoteCommand - The command string to execute (written as if on the remote server)
 * @returns The full command string (either direct bash or SSH-wrapped)
 */
export function wrapCommand(remoteCommand: string): string {
  if (isProductionServer()) {
    // Running on production — execute directly
    return `bash -c '${remoteCommand}'`;
  } else {
    // Running on dev — execute over SSH
    const sshBase = `ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${SSH_HOST}`;
    return `${sshBase} "${remoteCommand}"`;
  }
}

/**
 * Get the SSH base command prefix (for routes that build complex commands).
 * Returns empty string if on production server (commands run locally).
 */
export function getSshPrefix(): string {
  if (isProductionServer()) {
    return '';
  }
  return `ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${SSH_HOST}`;
}

/**
 * Build a screen session command that works both locally and remotely.
 *
 * @param screenName - Name for the screen session
 * @param script - The bash script to run inside screen
 * @returns Full command string
 */
export function buildScreenCommand(screenName: string, script: string): string {
  const screenCmd = `screen -dmS ${screenName} bash -c '${script}'`;
  if (isProductionServer()) {
    return screenCmd;
  }
  const sshBase = `ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${SSH_HOST}`;
  return `${sshBase} "${screenCmd}"`;
}

/**
 * Build a status-check command that works both locally and remotely.
 *
 * @param commands - Array of bash commands to run
 * @returns Full command string
 */
export function buildStatusCommand(commands: string[]): string {
  const joined = commands.join(' ');
  if (isProductionServer()) {
    return `bash -c '${joined}'`;
  }
  const sshBase = `ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${SSH_HOST}`;
  return `${sshBase} "${joined}"`;
}
