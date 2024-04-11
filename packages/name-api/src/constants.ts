import dotenv from "dotenv";

dotenv.config();

export const SQLite_DB_FILE = process.env.SQLite_DB_FILE;
export const PATH_TO_CERT = process.env.CERT_PATH;
export const INFURA_KEY = process.env.INFURA_KEY;
export const INFURA_IPFS_ID = process.env.INFURA_IPFS_ID;
export const INFURA_IPFS_SECRET = process.env.INFURA_IPFS_SECRET;

export const NAME_LIMIT = 128; //max name length
export const RESOLVER_TIMEOUT_SECS = 10; // 10 seconds for resolver timeout for checking if domain is assigned to us

if (!SQLite_DB_FILE) throw new Error("No Sqlite file provided");