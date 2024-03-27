// @ts-nocheck
import fastify from "fastify";
import { ethers, ZeroAddress } from "ethers";
import { SQLiteDatabase, BaseNameDef } from "./sqlite";
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

import { PATH_TO_CERT, SQLite_DB_FILE } from "./constants";

import cors from '@fastify/cors';
import { getTokenBoundAccount, getTokenBoundNFT } from "./tokenBound";
import { resolveEnsName, userOwnsDomain, getProvider, getBaseName } from "./resolve";

const db: SQLiteDatabase = new SQLiteDatabase(
  SQLite_DB_FILE, // e.g. 'ensnames.db'
);

console.log(`Path to Cert: ${PATH_TO_CERT}`);

var app;
var lastError: string[] = [];
var coinTypeRoute: string[] = [];

const RESOLVE_FAKE_ADDRESS = "0x0000000000000000000000000000000000000060";
const NAME_LIMIT = 128;

interface QueryResult {
  owns: boolean;
  timeStamp: number;
}

enum ResolverStatus {
  CORRECTLY_SETUP,
  INTERMEDIATE_DOMAIN_NOT_SET,
  BASE_DOMAIN_NOT_POINTING_HERE
}

interface ResolverCheck {
  name: string,
  resolverContract: string,
  onChainName: string,
  nameResolve: string
}

let cachedResults = new Map<string, QueryResult>();
let resolverChecks = new Map<string, ResolverCheck>();

const cacheTimeout = 30 * 1000; // 30 second cache validity
const logDumpLimit = 2000; //allow 2000 logs to be dumped
const resolverCheckLimit = 10; //only keep 10 checks in memory

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

//1. Register token:
// /registerToken/:chainId/:tokenContract/:name/:signature/:ensChainId? Signature is `Attempting to register domain ${name} name to ${tokenContract}`
//2. Register individual name:
// /register/:chainId/:tokenContract/:tokenId/:name/:signature
//3. Resolve for chain

async function getTokenImage(name: string, tokenId: number) {
  console.log(`blah`);
  let { chainId, tokenContract } = db.getTokenLocation(name);

  console.log(`${chainId} ${tokenContract}`);

  if (tokenContract) {
    const tokenData = await tokenDataRequest(chainId, tokenContract, tokenId);
    return tokenData;
  } else {
    return "";
  }
}

app.get('/text/:name/:key/:addr', async (request, reply) => {
  const recordName = request.params.name;
  const recordKey = request.params.key; // e.g. Avatar
  console.log(`Avatar ${recordName}`);
  if (!recordKey || !recordName) return "";
  addCointTypeCheck(`${recordName} Text Request: ${recordKey}`);
  switch (recordKey.toLowerCase()) {
    case 'avatar':
      const tokenId: number = db.getTokenIdFromName(recordName);
      console.log(`tokenId ${tokenId}`);
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

app.get('/droptables/:page', async (request, reply) => {
  const page = request.params.page;
  const list = db.getTokenIdVsName(page, logDumpLimit);

  return list;
});

// input: tokenbound address NB this is only for smartcat
app.get('/name/:address/:tokenid?', async (request, reply) => {
  const address = request.params.address;
  const tokenId = request.params.tokenid;
  console.log("Addr2: " + address + " tokenid " + tokenId);
  const fetchedName = db.getNameFromAddress(address);
  if (fetchedName && tokenId) {
    // check if TBA matches calc:
    let { chainId, tokenContract } = db.getTokenLocation(fetchedName);
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

app.get('/getname/:chainid/:address/:tokenid', async (request, reply) => {
  const address = request.params.address;
  const tokenId = request.params.tokenid;
  const chainid = request.params.chainid;
  console.log("getName Addr: " + address + " tokenid " + tokenId + " chainid " + chainid);
  return db.getNameFromToken(chainid, address, tokenId);
});

function resolveCheckIntercept(dName: string, resolverAddress: string): boolean {
  console.log(`intercept ${dName} ${resolverAddress}`);
  let bIndex = dName.indexOf('.');
  if (bIndex >= 0) {
    let pName = dName.substring(0, bIndex);
    //console.log(`ICheck ${pName}`);
    if (resolverChecks.has(pName)) {
      //now ensure the rest of the key exists in the database if it's a subdomain
      resolverChecks.set(pName, { name: dName, resolverContract: resolverAddress, onChainName: "" });
      //console.log(`Added! ${dName} ${resolverAddress}`);
      return true;
    }
  }

  return false;
}

app.get('/addr/:name/:coinType/:resolverAddr', async (request, reply) => {
  if (resolveCheckIntercept(request.params.name, request.params.resolverAddr)) { 
    return { addr: RESOLVE_FAKE_ADDRESS }; //If we get to this point, then the onchain part of the resolver is working correctly
  }
  const name = request.params.name;
  const coinType = request.params.coinType;
  addCointTypeCheck(`${name} Attempt to resolve: ${coinType}`);
  return db.addr(name, coinType);
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
    let errorPage = lastError.length < logDumpLimit ? lastError.length : logDumpLimit; 
    for (let i = 0; i < errorPage; i++) {
      errors += lastError[i];
      errors += ',';
    }

    // Consume errors
    if (errorPage == logDumpLimit) {
      lastError.splice(0, logDumpLimit);
    } else {
      lastError = [];
    }

  } catch (error) {
    console.log(error);
    errors = error;
  }

  return errors;
});

app.get('/coinTypes', async (request, reply) => {
  var coinTypeRequests = ".";
  try {
    let coinPage = coinTypeRoute.length < logDumpLimit ? coinTypeRoute.length : logDumpLimit; 
    for (let i = 0; i < coinPage; i++) {
      coinTypeRequests += coinTypeRoute[i];
      coinTypeRequests += ',';
    }

    // Consume
    if (coinPage == logDumpLimit) {
      coinTypeRoute.splice(0, logDumpLimit);
    } else {
      coinTypeRoute = [];
    }

  } catch (error) {
    console.log(error);
    coinTypeRequests = error;
  }

  return coinTypeRequests;
});

// restrict size
function addCointTypeCheck(text: string) {
  coinTypeRoute.push(`${text}`);

  if (coinTypeRoute.length > (logDumpLimit * 2)) {
    coinTypeRoute.splice(0, logDumpLimit * 2);
  }
}

//Resolver check:
async function sendResolverRequest(baseName: string, chainId: number): Promise<string> {
  //1. send request
  let bytes = ethers.randomBytes(8);
  let nameHash = ethers.hexlify(bytes);
  console.log(`Resolve: ${nameHash}.${baseName}`);
  //kick off process to call the resolve and write the base resolver name in - we need this to check ownership
  resolveEnsName(baseName, nameHash, chainId)
    .then(({ userAddr, onChainName }) => {
      //console.log(`RT: ${userAddr} ${onChainName}`);
      let thisCheck = resolverChecks.get(nameHash);
      thisCheck!.onChainName = onChainName;
      thisCheck!.nameResolve = userAddr;
      /*if (userAddr !== ZeroAddress && onChainName !== null) {
        console.log(`RESOLVE: ${onChainName} ${userAddr} ${nameHash}`);
      } else {
        console.log(`baseName ${baseName} not resolved`);
      }*/
      resolverChecks.set(nameHash, thisCheck);
    });

  resolverChecks.set(nameHash, { name: "", resolverContract: "" });

  console.log(`Wait for Resolve: ${nameHash}`);

  return nameHash;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCheck(nameHash: string): Promise<ResolverStatus> {

  let resolved: ResolverStatus = ResolverStatus.BASE_DOMAIN_NOT_POINTING_HERE;

  for (let i = 0; i < 1000; i++) {
    await delay(1000);
    let thisCheck = resolverChecks.get(nameHash);
    if (thisCheck?.name.length > 0 && thisCheck?.onChainName.length > 0) {
      console.log(`Resolved! ${thisCheck?.resolverContract} ${thisCheck?.onChainName} ${thisCheck?.nameResolve}`);
      // TODO: Possibly check that returned address is always the FAKE address, if it's set to a real address then we've got an error
      //       However this should have been caught in the database check
      if (thisCheck?.nameResolve === ZeroAddress) {
        resolved = ResolverStatus.INTERMEDIATE_DOMAIN_NOT_SET;
      } else {
        resolved = ResolverStatus.CORRECTLY_SETUP;
      }
      break;
    }
  }

  resolverChecks.set(nameHash, null);

  return resolved;
}

async function testResolve(): Promise<string> {
  //now check that resolver contract is correct
  let nameCheck = "xnft.eth";
  let nameHash = await sendResolverRequest(nameCheck, 11155111); //test on sepolia

  let result = await waitForCheck(nameHash);

  if (result == ResolverStatus.BASE_DOMAIN_NOT_POINTING_HERE) {
    console.log(`Resolver not correctly set for gateway.`);
  } else if (result == ResolverStatus.INTERMEDIATE_DOMAIN_NOT_SET) {
    console.log(`Intermediate name resolver ${nameCheck} not set correctly.`);
  }

  return result;
}

app.post('/registertoken/:chainId/:tokenContract/:name/:signature/:ensChainId?', async (request, reply) => {

  const { chainId, tokenContract, name, signature, ensChainId } = request.params;

  const baseName = name;

  const numericChainId: number = Number(chainId);
  const numericEnsChainId: number = Number(ensChainId);

  const santisedName = baseName.toLowerCase().replace(/\s+/g, '-').replace(/-{2,}/g, '').replace(/^-+/g, '').replace(/[;'"`\\]/g, '').replace(/^-+|-+$/g, '');

  console.log(`Sanitised name: ${santisedName}`);

  if (santisedName !== baseName) {
    return reply.status(403).send({"fail": `This name contains illegal characters ${baseName} vs ${santisedName}`});
  }

  if (baseName.length > NAME_LIMIT) {
    return reply.status(403).send({"fail": `Domain name too long, limit is ${NAME_LIMIT} characters.`});
  }

  console.log(`Check DB for basename `);

  //first check if basename already exists
  if (!db.checkBaseNameAvailable(baseName)) {
    return reply.status(403).send({"fail": `Base name ${baseName} already used`});
  }

  console.log(`Check DB for tokencontract `);

  if (!db.checkTokenContractAlreadyRegistered(tokenContract)) {
    return reply.status(403).send({"fail": `Token Contract ${tokenContract} already registered`});
  }

  console.log(`Check resolver ${baseName} (${getBaseName(baseName)})`);

  //now check that resolver contract is correct
  let nameHash = await sendResolverRequest(getBaseName(baseName), numericEnsChainId !== null ? numericEnsChainId : 1); // use ENS Chain if specified to allow testnet dev
  let result = await waitForCheck(nameHash);

  if (result == ResolverStatus.BASE_DOMAIN_NOT_POINTING_HERE) {
    return reply.status(403).send({"fail": `Resolver not correctly set for gateway.`});
  } else if (result == ResolverStatus.INTERMEDIATE_DOMAIN_NOT_SET) {
    return reply.status(403).send({"fail": `Intermediate name resolver ${getBaseName(baseName)} not set correctly.`});
  }

  try {
    const applyerAddress = recoverRegistrationAddress(name, tokenContract, signature);
    console.log("Registration address: " + applyerAddress);

    //check if address owns this name (either onchain, or registered here)
    const userOwns = await userOwnsDomain(getBaseName(baseName), baseName, applyerAddress, numericChainId);

    console.log(`OWNS: ${userOwns}`);

    if (userOwns) {
    //if (true) { //TODO: Debug
      //create entry in database
      // const chainInt = parseInt(chainId);
      // const tbaAccount = getTokenBoundAccount(chainInt, tokenContract, tokenId);
      // console.log("TBA: " + tbaAccount);
      db.registerBaseDomain(baseName, tokenContract, numericChainId);
      return reply.status(200).send({ "result" : "pass" });
    } else {
      // @ts-ignore
      return reply.status(403).send({"fail": "User does not own the NFT or signature is invalid"});
    }
  } catch (e) {
    if (lastError.length < 1000) { // don't overflow errors
      lastError.push(e.message);
    }
    
    return reply.status(400).send({"fail": e.message});
  }
});

app.post('/register/:chainId/:tokenContract/:tokenId/:name/:signature/:ensAddress?', async (request, reply) => {

  const { chainId, tokenContract, tokenId, name, signature, ensAddress } = request.params;

  const numericChainId: number = Number(chainId);

  if (!db.checkAvailable(name)) {
    let returnMsg = { "error" : "Name Unavailable" };
    return reply.status(403).send(returnMsg);
  }

  //now check domain name is possible to use - must be an entry in the tokens database
  //remove front name:
  let baseName = getBaseName(name);
  console.log(`BaseName: ${baseName}`);
  if (db.checkBaseNameAvailable(baseName)) {
    //this basename hasn't yet been registered
    return reply.status(403).send({"fail": `Basename ${baseName} not registered on the server, cannot create this domain name`});
  }

  try {
    const applyerAddress = recoverAddress(name, tokenId, signature);
    console.log("APPLY: " + applyerAddress);

    //now determine if user owns the NFT
    const userOwns = await userOwnsNFT(numericChainId, tokenContract, applyerAddress, tokenId);

    if (userOwns) {
      let ensPointAddress = getTokenBoundAccount(numericChainId, tokenContract, tokenId);
      
      if (ensAddress && ethers.isAddress(ensAddress)) {
        ensPointAddress = address;
      }

      console.log("Account: " + ensPointAddress);

      db.addElement(name, ensPointAddress, numericChainId, tokenId);
      return reply.status(200).send({ "result" : "pass" });
    } else {
      return reply.status(403).send({"fail": "User does not own the NFT or signature is invalid"});
    }
  } catch (e) {
    if (lastError.length < 1000) { // don't overflow errors
      lastError.push(e.message);
    }
    
    return reply.status(400).send({"fail": e.message});
  }
});

function recoverAddress(catName: string, tokenId: string, signature: string): string {
  const message = `Registering your catId ${tokenId} name to ${catName}`;
  console.log("MSG: " + message);
  return ethers.verifyMessage(message, addHexPrefix(signature));
}

function recoverRegistrationAddress(name: string, tokenContract: string, signature: string): string {
  const message = `Attempting to register domain ${name} name to ${tokenContract}`;
  console.log("MSG: " + message);
  console.log(`SIG: ${signature}`);
  if (signature.length < 130 || signature.length > 132) {
    console.log(`ERROR: ${signature.length}`);
    return ZeroAddress;
  } else {
    return ethers.verifyMessage(message, addHexPrefix(signature));
  }
}

async function userOwnsNFT(chainId: number, contractAddress: string, applyerAddress: string, tokenId: string): Promise<boolean> {

  if (!chainId)
    throw new Error("Missing chain config");

  // Spamming protection  
  if (checkCachedResults(chainId, contractAddress, applyerAddress, tokenId)) {
    return useCachedValue(chainId, contractAddress, applyerAddress, tokenId);
  }

  const provider = getProvider(chainId);

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
    console.log(`Server is listening on ${app.server?.address()} ${app.server?.address().port}`);

    db.initDb();
    setInterval(checkCacheEntries, cacheTimeout * 2);
    testResolve();
  } catch (err) {
    console.log(err);
    app.log.error(err);
    process.exit(1);
  }
};

start();