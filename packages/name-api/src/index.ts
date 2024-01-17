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
  //TODO: lookup token contract and chainId from database, given the name.
  //      You would store the avatar URL at creation time
  //get domain
  
  var tokenContract = "";
  var chainId;
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

  const tokenData = await tokenDataRequest(chainId, tokenContract, tokenId);
  console.log("TokenImage: " + tokenData);

  return tokenData;
}

app.get('/text/:name/:key', async (request, reply) => {
  const recordName = request.params.name;
  const recordKey = request.params.key; // e.g. Avatar
  console.log("text: " + recordName + " : " + recordKey);
  if (!recordKey || !recordName) return "";
  switch (recordKey.toLowerCase()) {
    case 'avatar':
      const tokenId: number = db.getTokenIdFromName(recordName);
      console.log("TokenID: " + tokenId);
      if (tokenId == -1) {
        return "";
      } else {
        return getTokenImage(recordName, tokenId);
      }

    default:
      const tokenDataValue = tokenData[recordKey];
      return tokenDataValue ? tokenDataValue : "";
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
app.get('/name/:address', async (request, reply) => {
  const address = request.params.address;
  return db.getNameFromAddress(address)
});

app.get('/count/:val', async (request, reply) => {
  var sz = 0;
  try {
    sz = db.getAccountCount();
  } catch (error) {
    console.log(error);
    sz = error;
  }

  return sz;
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

app.post('/register/:chainId/:tokenContract/:tokenId/:name/:signature', async (request, reply) => {

  const { chainId, tokenContract, tokenId, name, signature } = request.params;

  const config = CONTRACT_CONFIG[chainId + "-" + tokenContract.toLowerCase()];

  if (!config)
    return reply.status(400).send("Invalid chain and address combination");

  if (!db.checkAvailable(name))
    return reply.status(403).send("Name Unavailable");

  const applyerAddress = recoverAddress(name, tokenId, signature);
  console.log("APPLY: " + applyerAddress);

  //now determine if user owns the NFT
  const userOwns = await userOwnsNFT(chainId, tokenContract, applyerAddress, tokenId);

  if (userOwns) {

    const chainInt = parseInt(chainId);

    const tbaAccount = getTokenBoundAccount(chainInt, tokenContract, tokenId);

    console.log("TBA: " + tbaAccount);

    try {
      db.addElement(config.baseName, name, tbaAccount, chainInt, tokenId);
      return reply.status(200).send("pass");
    } catch (e) {
      return reply.status(400).send(e.message);
    }
  } else {
    return reply.status(403).send("User does not own the NFT or signature is invalid");
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

  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

  const testCatsContract = new ethers.Contract(contractAddress, [
    'function ownerOf(uint256 tokenId) view returns (address)'
  ], provider);

  const owner = await testCatsContract.ownerOf(tokenId);
  console.log("Owner: " + owner);
  if (owner === applyerAddress) {
    console.log("Owns");
    return true;
  } else {
    console.log("Doesn't own");
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

/*async function genSig() {
  // The message you want to sign

  const message = 'gonzo2,134';

  const wallet = new ethers.Wallet(PRIVATE_KEY);

  //let signature = await signer.sign( "YOLESS" );

  

  // Sign the message
  const signature = await wallet.signMessage(message);

  console.log(signature);

  const signerAddress = ethers.verifyMessage(message, signature);

  console.log(`Recovered address: ${signerAddress}`);
}*/

function getBaseName(name: string): string {
  let parts = name.split('.');
  return parts.slice(1).join('.');
}

function getTBAName() {
  var tbaAccount = getTokenBoundAccount(5, "0x2483e332d97C9DaeA4508c1C4F5BEE4a90469229", 1);
  console.log("TBA: " + tbaAccount);
  tbaAccount = getTokenBoundAccount(137, "0x2483e332d97C9DaeA4508c1C4F5BEE4a90469229", 1);
  console.log("TBA: " + tbaAccount);
  tbaAccount = getTokenBoundAccount(80001, "0x2483e332d97C9DaeA4508c1C4F5BEE4a90469229", 1);
  console.log("TBA: " + tbaAccount);
  tbaAccount = getTokenBoundAccount(5, "0xd5ca946ac1c1f24eb26dae9e1a53ba6a02bd97fe", 1);
  console.log("TBA: " + tbaAccount);
  tbaAccount = getTokenBoundAccount(137, "0xd5ca946ac1c1f24eb26dae9e1a53ba6a02bd97fe", 1);
  console.log("TBA: " + tbaAccount);
  tbaAccount = getTokenBoundAccount(80001, "0xd5ca946ac1c1f24eb26dae9e1a53ba6a02bd97fe", 1);
  console.log("TBA: " + tbaAccount);
  tbaAccount = getTokenBoundAccount(5, "0xd5ca946ac1c1f24eb26dae9e1a53ba6a02bd97fe", 1);
  console.log("TBA: " + tbaAccount);
}

const start = async () => {

  try {
    await app.listen({ port: 8083, host: '0.0.0.0' });
    console.log(`Server is listening on ${app.server?.address().port}`);
    db.initDb();
    getTBAName();
  } catch (err) {
    console.log(err);
    app.log.error(err);
    process.exit(1);
  }
};

start();