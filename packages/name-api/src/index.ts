// @ts-nocheck
import fastify from "fastify";
import { ethers } from "ethers";
import { SQLiteDatabase } from "./sqlite";
import fs from 'fs';
import { tokenDataRequest } from "./tokenDiscovery";
import fetch, {
  Blob,
  blobFrom,
  blobFromSync,
  File,
  fileFrom,
  fileFromSync,
  FormData,
  Headers,
  Request,
  Response,
} from 'node-fetch'

if (!globalThis.fetch) {
  globalThis.fetch = fetch
  globalThis.Headers = Headers
  globalThis.Request = Request
  globalThis.Response = Response
}

import { CHAIN_CONFIG, CONTRACT_CONFIG, PATH_TO_CERT, SQLite_DB_FILE } from "./constants";

import cors from '@fastify/cors';
import { getTokenBoundAccount, getTokenBoundNFT } from "./tokenBound";

const db: SQLiteDatabase = new SQLiteDatabase(
  SQLite_DB_FILE, // e.g. 'ensnames.db'
);

console.log(`Path to Cert: ${PATH_TO_CERT}`);

var app;
var lastError: string[] = [];

interface QueryResult {
  owns: boolean;
  timeStamp: number;
}

let cachedResults = new Map<string, QueryResult>();

const cacheTimeout = 30 * 1000; // 30 second cache validity

if (PATH_TO_CERT) {
  app = fastify({
    maxParamLength: 1024,
    https: {
      key: fs.readFileSync('./privkey.pem'),
      cert: fs.readFileSync('./cert.pem')
    }
  });
} else {
  console.log("No Cert");
  app = fastify({
    maxParamLength: 1024
  });
}

await app.register(cors, {
  origin: true
})

async function getTokenImage(name: string, tokenId: number) {
  let { chainId, tokenContract } = getTokenLocation(name);

  if (tokenContract) {
    const tokenData = await tokenDataRequest(chainId, tokenContract, tokenId);
    return tokenData;
  } else {
    return "";
  }
}

// TODO: This should be sourced from a database sub-table
function getTokenLocation(name: string): { number, string } {
  var tokenContract: string;
  var chainId: number;
  const baseName = getBaseName(name);
  console.log("Base name: " + baseName);

  switch (baseName) {
    case 'smartcat.eth':
      tokenContract = "0x2483e332d97c9daea4508c1c4f5bee4a90469229";
      chainId = 5;
      break;
    case 'thesmartcats.eth':
      tokenContract = "0xd5ca946ac1c1f24eb26dae9e1a53ba6a02bd97fe";
      chainId = 137;
      break;
  }

  return { chainId, tokenContract };
}

app.get('/text/:name/:key', async (request, reply) => {
  const recordName = request.params.name;
  const recordKey = request.params.key; // e.g. Avatar
  if (!recordKey || !recordName) return "";
  switch (recordKey.toLowerCase()) {
    case 'avatar':
      const tokenId: number = db.getTokenIdFromName(recordName);
      if (tokenId == -1) {
        return "";
      } else {
        return getTokenImage(recordName, tokenId);
      }

    default:
      return "";
  }
});

app.get('/checkname/:name', async (request, reply) => {
  const name = request.params.name;
  if (!db.checkAvailable(name)) {
    return "unavailable";
  } else {
    return "available";
  }
});

app.get('/tokenId/:name', async (request, reply) => {
  const name = request.params.name;
  return db.getTokenIdFromName(name);
});

app.get('/image/:name', async (request, reply) => {
  const name = request.params.name;
  const tokenId = db.getTokenIdFromName(name);
  return getTokenImage(name, tokenId);
});

// input: tokenbound address
app.get('/name/:address/:tokenid?', async (request, reply) => {
  const address = request.params.address;
  const tokenId = request.params.tokenid;
  console.log("Addr2: " + address + " tokenid " + tokenId);
  const fetchedName = db.getNameFromAddress(address);
  if (fetchedName && tokenId) {
    // check if TBA matches calc:
    let { chainId, tokenContract } = getTokenLocation(fetchedName);
    if (tokenContract) {
      const tbaAccount = getTokenBoundAccount(chainId, tokenContract, tokenId);
      //console.log(`fromUser: ${address} calc:${tbaAccount}`);
      if (tbaAccount == address) {
        db.updateTokenId(fetchedName, tokenId);
      }
    }
  }


  return fetchedName;
});

app.get('/addr/:name/:coinType', async (request, reply) => {
  const name = request.params.name;
  const coinType = request.params.coinType;
  return db.addr(name, coinType)
});

app.get('/count', async (request, reply) => {
  var sz = 0;
  try {
    sz = db.getAccountCount();
  } catch (error) {
    console.log(error);
    sz = error;
  }

  return sz;
});

app.get('/lastError', async (request, reply) => {
  var errors = ".";
  try {
    let errorPage = lastError.length < 100 ? lastError.length : 100; 
    for (let i = 0; i < errorPage; i++) {
      errors += lastError[i];
      errors += ',';
    }

    // Consume errors
    if (errorPage == 100) {
      lastError.splice(0, 100);
    } else {
      lastError = [];
    }

  } catch (error) {
    console.log(error);
    sz = error;
  }

  return errors;
});

app.post('/register/:chainId/:tokenContract/:tokenId/:name/:signature', async (request, reply) => {

  const { chainId, tokenContract, tokenId, name, signature } = request.params;

  const config = CONTRACT_CONFIG[chainId + "-" + tokenContract.toLowerCase()];

  if (!config)
    return reply.status(400).send("Invalid chain and address combination");

  if (!db.checkAvailable(name))
    return reply.status(403).send("Name Unavailable");

  try {
    const applyerAddress = recoverAddress(name, tokenId, signature);
    console.log("APPLY: " + applyerAddress);

    //now determine if user owns the NFT
    const userOwns = await userOwnsNFT(chainId, tokenContract, applyerAddress, tokenId);

    if (userOwns) {
      const chainInt = parseInt(chainId);
      const tbaAccount = getTokenBoundAccount(chainInt, tokenContract, tokenId);
      console.log("TBA: " + tbaAccount);

      db.addElement(config.baseName, name, tbaAccount, chainInt, tokenId);
      return reply.status(200).send("pass");
    } else {
      return reply.status(403).send("User does not own the NFT or signature is invalid");
    }
  } catch (e) {
    if (lastError.length < 1000) { // don't overflow errors
      lastError.push(e.message);
    }
    
    return reply.status(400).send(e.message);
  }
});

function recoverAddress(catName: string, tokenId: string, signature: string): string {
  const message = `Registering your catId ${tokenId} name to ${catName}`;
  console.log("MSG: " + message);
  return ethers.verifyMessage(message, addHexPrefix(signature));
}

async function userOwnsNFT(chainId: number, contractAddress: string, applyerAddress: string, tokenId: string): Promise<boolean> {

  const chainConfig = CHAIN_CONFIG[chainId];

  if (!chainId)
    throw new Error("Missing chain config");

  // Spamming protection  
  if (checkCachedResults(chainId, contractAddress, applyerAddress, tokenId)) {
    return useCachedValue(chainId, contractAddress, applyerAddress, tokenId);
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

  const testCatsContract = new ethers.Contract(contractAddress, [
    'function ownerOf(uint256 tokenId) view returns (address)'
  ], provider);

  const owner = await testCatsContract.ownerOf(tokenId);
  console.log("Owner: " + owner);
  if (owner === applyerAddress) {
    console.log("Owns");
    cachedResults.set(getCacheKey(chainId, contractAddress, applyerAddress, tokenId), { owns: true, timeStamp: Date.now()});
    return true;
  } else {
    console.log("Doesn't own");
    cachedResults.set(getCacheKey(chainId, contractAddress, applyerAddress, tokenId), { owns: false, timeStamp: Date.now()});
    return false;
  }
}

function getCacheKey(chainId, contractAddress, applyerAddress, tokenId): string {
  return contractAddress + "-" + chainId + "-" + applyerAddress + "-" + tokenId;
}

function useCachedValue(chainId, contractAddress, applyerAddress, tokenId): boolean {
  const key = getCacheKey(chainId, contractAddress, applyerAddress, tokenId);
  const mapping = cachedResults.get(key);
  if (mapping) {
    //console.log("Owns?: " + mapping.owns);
    return mapping.owns;
  } else {
    lastError.push("Bad Mapping: " + applyerAddress);
    return false;
  }
}

function checkCachedResults(chainId, contractAddress, applyerAddress, tokenId): boolean {
  const key = getCacheKey(chainId, contractAddress, applyerAddress, tokenId);
  const mapping = cachedResults.get(key);
  if (mapping) {
    if (mapping.timeStamp < (Date.now() - cacheTimeout)) {
      //out of date result, remove key
      cachedResults.delete(key);
      return false;
    } else {
      //console.log("Can use cache");
      return true;
    }
  } else {
    return false;
  }
}

function addHexPrefix(hex: string): string {
  if (hex.startsWith('0x')) {
    return hex;
  } else {
    return '0x' + hex;
  }
}

function getBaseName(name: string): string {
  let parts = name.split('.');
  return parts.slice(1).join('.');
}

function checkCacheEntries() {
  //check cache and clear old values
  let removeResultKeys: string[] = [];

  for (let [key, result] of cachedResults) {
    if (result.timeStamp < (Date.now() - cacheTimeout)) {
      //console.log("out of date entry: " + key);
      removeResultKeys.push(key);
    }
  }

  removeResultKeys.forEach(value => {
    //console.log("remove out of date entry: " + value);
    cachedResults.delete(value);
  });


}

const start = async () => {

  try {
    await app.listen({ port: 8083, host: '0.0.0.0' });
    console.log(`Server is listening on ${app.server?.address().port}`);
    db.initDb();
    setInterval(checkCacheEntries, cacheTimeout * 2);
  } catch (err) {
    console.log(err);
    app.log.error(err);
    process.exit(1);
  }
};

start();