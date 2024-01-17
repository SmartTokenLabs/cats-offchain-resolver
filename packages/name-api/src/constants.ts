import dotenv from "dotenv";

dotenv.config();

export const SQLite_DB_FILE = process.env.SQLite_DB_FILE;
export const PATH_TO_CERT = process.env.CERT_PATH;
export const INFURA_KEY = process.env.INFURA_KEY;

if (!SQLite_DB_FILE) throw new Error("No Sqlite file provided");

// RPC URL is not actually needed for calculating TBA addresses but may be needed for other function in the future
export const CHAIN_CONFIG = {
	137: {
		rpcUrl: `https://polygon-mainnet.infura.io/v3/${INFURA_KEY}`
	},
	80001: {
		rpcUrl: `https://polygon-mumbai.infura.io/v3/${INFURA_KEY}`
	},
	5: {
		rpcUrl: `https://goerli.infura.io/v3/${INFURA_KEY}`
	}
}

export const CONTRACT_CONFIG = {
	// Smartcat production
	"137-0xd5ca946ac1c1f24eb26dae9e1a53ba6a02bd97fe": {
		baseName: "thesmartcats.eth"
	},
	// Smartcat mumbai
	"80001-0x614cf3021705977c2ef4beb9d7f10a6bf4eaebf6": {
		baseName: "smartcat.eth"
	},
	// Goerli test
	"5-0x2483e332d97c9daea4508c1c4f5bee4a90469229": {
		baseName: "smartcat.eth"
	}
};
