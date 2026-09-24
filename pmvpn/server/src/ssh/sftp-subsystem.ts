// SSH SFTP subsystem — bridges ssh2's SFTPWrapper events to our privilege-
// dropping SFTP worker so standard sftp(1) / scp(1) clients work via wallet
// auth.
// MIT License
//
// ssh2's SFTPWrapper exposes the wire protocol — we receive events like
// OPEN/READ/WRITE/CLOSE with file handles and offsets. The host SftpHost
// only exposes high-level get/put-whole-file commands (necessary for the
// setuid worker boundary). To bridge them:
//
//   OPEN(r)  → load whole file into buffer, allocate handle
//   READ     → slice from buffer
//   OPEN(w)  → allocate empty buffer, allocate handle
//   WRITE    → append into buffer
//   CLOSE(w) → put buffer to disk
//
// This is fine for typical sftp/scp interactive sessions. It is NOT fine
// for multi-GB files; the 50MB ceiling in sftp.ts still applies.

import ssh2 from 'ssh2';
import { posix } from 'node:path';
import type { SftpHost } from './sftp-host.js';
import { logger } from '../utils/logger.js';

const OPEN_MODE = ssh2.utils.sftp.OPEN_MODE;
const STATUS_CODE = ssh2.utils.sftp.STATUS_CODE;

interface ReadHandle {
  kind: 'read';
  path: string;
  data: Buffer;
}
interface WriteHandle {
  kind: 'write';
  path: string;
  chunks: Buffer[];
}
interface DirHandle {
  kind: 'dir';
  path: string;
  entries: any[];
  served: boolean;
}
type Handle = ReadHandle | WriteHandle | DirHandle;

export function attachSftpSubsystem(
  sftpStream: ssh2.SFTPWrapper,
  host: SftpHost,
  username: string,
): void {
  const handles = new Map<string, Handle>();
  let nextHandleId = 1;

  const newHandle = (h: Handle): Buffer => {
    const id = String(nextHandleId++);
    handles.set(id, h);
    return Buffer.from(id);
  };
  const getHandle = (buf: Buffer): Handle | undefined => handles.get(buf.toString());
  const dropHandle = (buf: Buffer): void => { handles.delete(buf.toString()); };

  const normalize = (p: string): string => posix.normalize('/' + p.replace(/^\/+/, ''));

  sftpStream.on('REALPATH', (reqId, p) => {
    const resolved = normalize(p === '.' || !p ? '/' : p);
    sftpStream.name(reqId, [{ filename: resolved, longname: resolved, attrs: {} as any }]);
  });

  sftpStream.on('STAT', async (reqId, p) => {
    const res = await host.exec('stat', normalize(p));
    if (!res.ok || !res.entries?.[0]) return sftpStream.status(reqId, STATUS_CODE.NO_SUCH_FILE);
    const e = res.entries[0];
    sftpStream.attrs(reqId, {
      mode: parseInt(e.permissions, 8) | (e.type === 'directory' ? 0o040000 : 0o100000),
      size: e.size,
      atime: Math.floor(new Date(e.modified).getTime() / 1000),
      mtime: Math.floor(new Date(e.modified).getTime() / 1000),
      uid: 0, gid: 0,
    });
  });
  sftpStream.on('LSTAT', (reqId, p) => sftpStream.emit('STAT', reqId, p));
  sftpStream.on('FSTAT', (reqId, handleBuf) => {
    const h = getHandle(handleBuf);
    if (!h) return sftpStream.status(reqId, STATUS_CODE.FAILURE);
    sftpStream.emit('STAT', reqId, h.path);
  });

  sftpStream.on('OPEN', async (reqId, filename, flags) => {
    const path = normalize(filename);
    const wantWrite = (flags & (OPEN_MODE.WRITE | OPEN_MODE.CREAT | OPEN_MODE.TRUNC)) !== 0;
    const wantRead = (flags & OPEN_MODE.READ) !== 0 || !wantWrite;

    if (wantWrite && !wantRead) {
      sftpStream.handle(reqId, newHandle({ kind: 'write', path, chunks: [] }));
      return;
    }

    const res = await host.exec('get', path);
    if (!res.ok || res.data === undefined) {
      return sftpStream.status(reqId, STATUS_CODE.NO_SUCH_FILE, res.error || 'open failed');
    }
    sftpStream.handle(reqId, newHandle({ kind: 'read', path, data: Buffer.from(res.data, 'base64') }));
  });

  sftpStream.on('READ', (reqId, handleBuf, offset, len) => {
    const h = getHandle(handleBuf);
    if (!h || h.kind !== 'read') return sftpStream.status(reqId, STATUS_CODE.FAILURE);
    if (offset >= h.data.length) return sftpStream.status(reqId, STATUS_CODE.EOF);
    const end = Math.min(offset + len, h.data.length);
    sftpStream.data(reqId, h.data.subarray(offset, end));
  });

  sftpStream.on('WRITE', (reqId, handleBuf, _offset, data) => {
    const h = getHandle(handleBuf);
    if (!h || h.kind !== 'write') return sftpStream.status(reqId, STATUS_CODE.FAILURE);
    h.chunks.push(Buffer.from(data));
    sftpStream.status(reqId, STATUS_CODE.OK);
  });

  sftpStream.on('CLOSE', async (reqId, handleBuf) => {
    const h = getHandle(handleBuf);
    dropHandle(handleBuf);
    if (!h) return sftpStream.status(reqId, STATUS_CODE.FAILURE);
    if (h.kind === 'write') {
      const body = Buffer.concat(h.chunks);
      const res = await host.exec('put', h.path, body.toString('base64'));
      return sftpStream.status(reqId, res.ok ? STATUS_CODE.OK : STATUS_CODE.PERMISSION_DENIED, res.error);
    }
    sftpStream.status(reqId, STATUS_CODE.OK);
  });

  sftpStream.on('OPENDIR', async (reqId, p) => {
    const path = normalize(p);
    const res = await host.exec('ls', path);
    if (!res.ok) return sftpStream.status(reqId, STATUS_CODE.NO_SUCH_FILE, res.error);
    sftpStream.handle(reqId, newHandle({ kind: 'dir', path, entries: res.entries || [], served: false }));
  });

  sftpStream.on('READDIR', (reqId, handleBuf) => {
    const h = getHandle(handleBuf);
    if (!h || h.kind !== 'dir') return sftpStream.status(reqId, STATUS_CODE.FAILURE);
    // An empty NAME reply is not valid SFTP; OpenSSH's sftp client hangs on it.
    // Empty directory → EOF straight away.
    if (h.served || h.entries.length === 0) return sftpStream.status(reqId, STATUS_CODE.EOF);
    h.served = true;
    const names = h.entries.map((e: any) => ({
      filename: e.name,
      longname: `${e.type === 'directory' ? 'd' : '-'}${e.permissions || '644'} ${e.size} ${e.name}`,
      attrs: {
        mode: parseInt(e.permissions || '644', 8) | (e.type === 'directory' ? 0o040000 : 0o100000),
        size: e.size,
        atime: Math.floor(new Date(e.modified).getTime() / 1000),
        mtime: Math.floor(new Date(e.modified).getTime() / 1000),
        uid: 0, gid: 0,
      } as any,
    }));
    sftpStream.name(reqId, names);
  });

  sftpStream.on('MKDIR', async (reqId, p) => {
    const res = await host.exec('mkdir', normalize(p));
    sftpStream.status(reqId, res.ok ? STATUS_CODE.OK : STATUS_CODE.FAILURE, res.error);
  });

  sftpStream.on('REMOVE', async (reqId, p) => {
    const res = await host.exec('rm', normalize(p));
    sftpStream.status(reqId, res.ok ? STATUS_CODE.OK : STATUS_CODE.FAILURE, res.error);
  });

  sftpStream.on('RMDIR', async (reqId, p) => {
    const res = await host.exec('rm', normalize(p));
    sftpStream.status(reqId, res.ok ? STATUS_CODE.OK : STATUS_CODE.FAILURE, res.error);
  });

  sftpStream.on('RENAME', async (reqId, oldPath, newPath) => {
    // No native rename in worker yet; emulate with get+put+rm. Bounded by 50MB.
    const get = await host.exec('get', normalize(oldPath));
    if (!get.ok || get.data === undefined) return sftpStream.status(reqId, STATUS_CODE.NO_SUCH_FILE);
    const put = await host.exec('put', normalize(newPath), get.data);
    if (!put.ok) return sftpStream.status(reqId, STATUS_CODE.FAILURE, put.error);
    const rm = await host.exec('rm', normalize(oldPath));
    sftpStream.status(reqId, rm.ok ? STATUS_CODE.OK : STATUS_CODE.FAILURE, rm.error);
  });

  sftpStream.on('SETSTAT', (reqId) => sftpStream.status(reqId, STATUS_CODE.OK));
  sftpStream.on('FSETSTAT', (reqId) => sftpStream.status(reqId, STATUS_CODE.OK));

  sftpStream.on('close' as any, () => {
    handles.clear();
    logger.debug({ username }, 'sftp subsystem closed');
  });
}
