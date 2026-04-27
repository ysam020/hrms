import { execFileSync } from 'child_process';
import { mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('.', import.meta.url));

function findProtos(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...findProtos(full));
    else if (entry.endsWith('.proto')) results.push(full);
  }
  return results;
}

const protoDir = join(root, 'src/proto');
const outDir = join(root, 'src/generated');

mkdirSync(outDir, { recursive: true });

const protoFiles = findProtos(protoDir);
if (protoFiles.length === 0) {
  console.error('No .proto files found in', protoDir);
  process.exit(1);
}

const pathSep = process.platform === 'win32' ? ';' : ':';
const env = {
  ...process.env,
  PATH: `${join(root, 'node_modules/.bin')}${pathSep}${process.env.PATH}`,
};

execFileSync(
  'protoc',
  [
    `--ts_proto_out=${outDir}`,
    '--ts_proto_opt=outputServices=grpc-js,esModuleInterop=true,env=node,useDate=false',
    `-I${protoDir}`,
    ...protoFiles,
  ],
  { stdio: 'inherit', env },
);
