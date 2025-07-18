import { exec } from "child_process";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const PROD_MONGODB_URI = process.env.PROD_MONGODB_URI;
let BACKUP_MONGODB_URI = process.env.BACKUP_MONGODB_URI;
const DUMP_PATH = path.join("/tmp", "mongo_dump");

// Helper to run shell commands with timeout
const runShellCommand = (command, timeoutMs = 300000) => {
  return new Promise((resolve, reject) => {
    const childProcess = exec(
      command,
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject({ error, stderr });
        } else {
          resolve(stdout);
        }
      }
    );

    // Set timeout
    if (timeoutMs) {
      setTimeout(() => {
        childProcess.kill();
        reject({
          error: new Error(`Command timed out after ${timeoutMs}ms`),
          stderr: "",
        });
      }, timeoutMs);
    }
  });
};

// Helper to ensure a directory exists
const ensureDirectoryExists = async (directoryPath) => {
  await fs.promises.mkdir(directoryPath, { recursive: true });
};

async function runDatabaseBackup() {
  try {
    try {
      await runShellCommand(`rm -rf "${DUMP_PATH}"`);
    } catch (error) {
      console.error("No existing dump directory to clean up", error);
    }

    // Ensure the dump directory exists
    await ensureDirectoryExists(DUMP_PATH);

    // Step 2: Dump from MongoDB Atlas
    const dumpCommand = `mongodump --uri "${PROD_MONGODB_URI}" --db "pm-crm" --out "${DUMP_PATH}"`;
    await runShellCommand(dumpCommand);

    try {
      await runShellCommand(`ls -la "${DUMP_PATH}"`);
    } catch (error) {
      console.error(`Directory listing failed: ${JSON.stringify(error)}`);
      throw new Error("Dump directory does not exist or is inaccessible");
    }

    // Step 3: Restore to backup MongoDB
    try {
      const restoreCommand = `mongorestore --uri "${BACKUP_MONGODB_URI}" --nsFrom="pm-crm.*" --nsTo="pm-crm.*" "${DUMP_PATH}/pm-crm"`;
      await runShellCommand(restoreCommand);
    } catch (restoreError) {
      console.error(
        `Initial restore failed, attempting collection-by-collection restore... Error: ${
          restoreError.stderr || restoreError.error.message
        }`
      );

      // Get list of collections
      const collectionsDir = path.join(DUMP_PATH, "pm-crm");
      try {
        // Verify the collections directory exists
        await runShellCommand(`ls -la "${collectionsDir}"`);
      } catch (dirError) {
        console.error(
          `Collections directory does not exist: ${JSON.stringify(dirError)}`
        );
        throw new Error(
          "MongoDB dump did not create the expected directory structure"
        );
      }

      const listCollectionsCommand = `find "${collectionsDir}" -name "*.bson" | sed 's/\\.bson$//' | xargs -n1 basename`;
      const collectionsOutput = await runShellCommand(listCollectionsCommand);
      const collections = collectionsOutput.trim().split("\n").filter(Boolean);

      // Restore each collection individually
      for (const collection of collections) {
        try {
          const collectionRestoreCommand = `mongorestore --uri "${BACKUP_MONGODB_URI}" --nsInclude="pm-crm.${collection}" "${DUMP_PATH}"`;
          await runShellCommand(collectionRestoreCommand);
        } catch (collectionError) {
          console.error(
            `Failed to restore collection ${collection}: ${
              collectionError.stderr || collectionError.error.message
            }`
          );

          // Try one more time without indexes for problematic collections
          try {
            const retryCommand = `mongorestore --uri "${BACKUP_MONGODB_URI}" --nsInclude="pm-crm.${collection}" --noIndexRestore "${DUMP_PATH}"`;
            await runShellCommand(retryCommand);
          } catch (retryError) {
            console.error(
              `Failed final retry for ${collection}: ${
                retryError.stderr || retryError.error.message
              }`
            );
          }
        }
      }
    }

    // Step 4: Cleanup
    try {
      const cleanupCommand = `rm -rf "${DUMP_PATH}"`;
      await runShellCommand(cleanupCommand);
    } catch (cleanupError) {
      console.error(
        `Cleanup failed: ${cleanupError.stderr || cleanupError.error.message}`
      );
    }
  } catch (error) {
    console.error(
      `Error during database backup: ${
        error.stderr || error.error?.message || error
      }`
    );
    throw error;
  }
}

export default runDatabaseBackup;

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runDatabaseBackup()
    .then(() => console.log("Backup script completed"))
    .catch((err) => {
      console.error(`Backup script failed: ${err}`, "ERROR");
      process.exit(1);
    });
}
