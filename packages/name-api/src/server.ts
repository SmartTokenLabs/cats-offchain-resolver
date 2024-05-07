// @ts-nocheck
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import {
	INFURA_IPFS_ID,
	INFURA_IPFS_SECRET,
	NAME_LIMIT,
	PATH_TO_CERT,
	RESOLVER_TIMEOUT_SECS,
	SQLite_DB_FILE,
	RELEASE_MODE
} from "./constants";
import fastify from "fastify";
import fs from "fs";
import {getBaseName, getProvider, ipfsHashToHex, resolveEnsName, userOwnsDomain} from "./resolve";
import {isIPFS, tokenAvatarRequest} from "./tokenDiscovery";
import {getTokenBoundAccount} from "./tokenBound";
import {ethers, ZeroAddress} from "ethers";
import {SQLiteDatabase, SMARTCAT_ETH, SMARTCAT_TOKEN} from "./sqlite";
import FormData from "form-data";
import fetch from "node-fetch";

import { pipeline } from 'stream';
import util from 'util';
import {FastifyInstance} from "fastify/types/instance";
const pump = util.promisify(pipeline);

export const db: SQLiteDatabase = new SQLiteDatabase(
	SQLite_DB_FILE, // e.g. 'ensnames.db'
);

consoleLog(`Path to Cert: ${PATH_TO_CERT}`);
const ipfsAuth = 'Basic ' + Buffer.from(INFURA_IPFS_ID + ':' + INFURA_IPFS_SECRET).toString('base64');

const RESOLVE_FAKE_ADDRESS = "0x0000000000000000000000000000000000000060";

export interface QueryResult {
	owns: boolean;
	timeStamp: number;
}

export enum ResolverStatus {
	CORRECTLY_SETUP,
	INTERMEDIATE_DOMAIN_NOT_SET,
	BASE_DOMAIN_NOT_POINTING_HERE,
	CHAIN_MISMATCH
}

export interface ResolverCheck {
	name: string,
	onChainName: string,
	nameResolve: string,
	chainId: number
}

const cachedResults = new Map<string, QueryResult>();
const resolverChecks = new Map<string, ResolverCheck>();

var releaseMode = RELEASE_MODE == "true";

export const cacheTimeout = 30 * 1000; // 30 second cache validity
const logDumpLimit = 2000; //allow 2000 logs to be dumped
const resolverCheckLimit = 10; //only keep 10 checks in memory

const lastError: string[] = [];
const coinTypeRoute: string[] = [];

function consoleLog(msg: string) {
	if (!releaseMode) {
		console.log(msg);
	}
}

export async function createServer(){

	let app: FastifyInstance;
	let lastError: string[] = [];
	let coinTypeRoute: string[] = [];

	if (PATH_TO_CERT) {
		app = fastify({
			maxParamLength: 1024,
			https: {
				key: fs.readFileSync('./privkey.pem'),
				cert: fs.readFileSync('./cert.pem')
			}
		});
	} else {
		consoleLog("No Cert");
		app = fastify({
			maxParamLength: 1024
		});
	}

	await app.register(cors, {
		origin: true
	});

	await app.register(multipart, {
		limits: {
			fieldNameSize: 100, // Max field name size in bytes
			fieldSize: 100,     // Max field value size in bytes
			fields: 10,         // Max number of non-file fields
			fileSize: 1000000,  // For multipart forms, the max file size in bytes
			files: 1,           // Max number of file fields
			headerPairs: 2000,  // Max number of header key=>value pairs
			parts: 1000         // For multipart forms, the max number of parts (fields + files)
		}
	});

	//1. Register token:
	// /registerToken/:chainId/:tokenContract/:name/:signature/:ensChainId? Signature is `Attempting to register domain ${name} name to ${tokenContract}`
	//2. Register individual name:
	// /register/:chainId/:tokenContract/:tokenId/:name/:signature
	//3. Resolve for chain

	app.get('/text/:name/:key/:chainId', async (request, reply) => {
		const { name, key, chainId } = request.params;

		consoleLog(`${key} ${name} ${chainId}`);

		if (!key || !name) return "";
		addCointTypeCheck(`${name} Text Request: ${key}`);
		//first try the database
		var dbResult = db.text(chainId, name, key);
		if (dbResult.length > 0) {
			return dbResult;
		}

		switch (key.toLowerCase()) {
			case 'avatar':
				const tokenId: number = db.getTokenIdFromName(chainId, name);
				consoleLog(`tokenId ${tokenId}`);
				if (tokenId == -1) {
					return "";
				} else {
					const avatarUrl = await getTokenImage(chainId, name, tokenId);
					//write to database
					if (avatarUrl.length > 0) {
						db.setText(chainId, name, key, avatarUrl);
					}
					dbResult = avatarUrl;
				}
				break;
		}

		return dbResult;
	});

	app.get('/contenthash/:name/:chainId', async (request, reply) => {
		const name = request.params.name;
		const chainId = parseInt(request.params.chainId);
		const contenthash = db.contenthash(chainId, name);
		const hexContent = ipfsHashToHex(contenthash);
		consoleLog(`Contenthash ${name} ${chainId} ${contenthash} ${hexContent}`);
		
		return hexContent;
	});

	app.get('/checkname/:chainIdOrName/:name?', async (request, reply) => {
		var name = request.params.name;
		var chainId = request.params.chainIdOrName;
		if (request.params.name === undefined) {
			name = request.params.chainIdOrName;
			chainId = 1; //assume mainnet resolver
		}

		console.log(`checkname ${name} ${chainId}`);

		if (!db.checkAvailable(chainId, name)) {
			return { result: 'unavailable' };
		} else {
			return { result: 'available' };
		}
	});

	app.get('/tokenId/:chainId/:name', async (request, reply) => {
		const name = request.params.name;
		const chainId = request.params.chainId;
		return { result: db.getTokenIdFromName(chainId, name)};
	});

	app.get('/image/:name/:chainId', async (request, reply) => {
		const name = request.params.name;
		const chainId = request.params.chainId;
		const tokenId = db.getTokenIdFromName(chainId, name);
		return { result: getTokenImage(chainId, name, tokenId) };
	});

	app.get('/droptables/:page', async (request, reply) => {
		const page = request.params.page;
		const list = db.getTokenIdVsName(page, logDumpLimit);

		return list;
	});

	// TODO: Deprecate & remove this
	// Only for thesmartcats; use name/:chainid/:address/:tokenid instead
	// address is 
	app.get('/catname/:address/:tokenid?', async (request, reply) => {
	  const address = request.params.address;
	  const tokenId = request.params.tokenid;
	  // const chainId = request.params.chainid;
	  //consoleLog("Addr2: " + address + " tokenid " + tokenId);
	  
	  const fetchedName = db.getNameFromAddress(address, tokenId);
	  consoleLog(`FetchedName: ${fetchedName}`);
	  if (fetchedName && getBaseName(fetchedName) == SMARTCAT_ETH) {
		// check if TBA matches calc:
		let { chainId, tokenContract } = db.getTokenDetails(137, SMARTCAT_ETH);
		//let { chainId, tokenContract } = db.getTokenLocation(fetchedName);
		if (tokenContract && tokenId) {
		  const tbaAccount = getTokenBoundAccount(chainId, tokenContract, tokenId);
		  //consoleLog(`fromUser: ${address} calc:${tbaAccount} ${tokenId}`);
		  if (tbaAccount.toLowerCase() == address.toLowerCase()) {
			db.updateTokenId(chainId, fetchedName, tokenId);  //chainId: number, name: string, tokenId: number
		  }
		}
	  }

	  return { result: `${fetchedName}` };
	});

	app.get('/name/:chainid/:address/:tokenid', async (request, reply) => {
		const address = request.params.address;
		const tokenId = request.params.tokenid;
		const chainid = request.params.chainid;
		consoleLog("getName Addr: " + address + " tokenid " + tokenId + " chainid " + chainid);
		return db.getNameFromToken(chainid, address, tokenId);
	});

	app.get('/addr/:name/:coinType/:chainId', async (request, reply) => {
		const name = request.params.name;
		const coinType = request.params.coinType;
		const chainId = request.params.chainId;
		if (resolveCheckIntercept(name, chainId)) {
			return { addr: RESOLVE_FAKE_ADDRESS }; //If we get to this point, then the onchain part of the resolver is working correctly
		}
		addCointTypeCheck(`${name} Attempt to resolve: ${coinType}`);
		return db.addr(chainId, name, coinType);
	});

	app.get('/count', async (request, reply) => {
		var sz = 0;
		try {
			sz = db.getAccountCount();
		} catch (error) {
			consoleLog(error);
			sz = error.message;
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
			consoleLog(error);
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
			consoleLog(error);
			coinTypeRequests = error;
		}

		return coinTypeRequests;
	});

	app.post('/registertoken/:chainId/:tokenContract/:name/:signature/:ensChainId?', async (request, reply) => {

		const { chainId, tokenContract, name, signature, ensChainId } = request.params;

		const numericChainId: number = Number(chainId);
		const numericEnsChainId: number = Number(ensChainId !== undefined ? ensChainId : 1);

		const santisedName = name.toLowerCase().replace(/\s+/g, '-').replace(/-{2,}/g, '').replace(/^-+/g, '').replace(/[;'"`\\]/g, '').replace(/^-+|-+$/g, '');

		consoleLog(`Sanitised name: ${santisedName}`);

		if (santisedName !== name) {
			return reply.status(403).send({ "fail": `This name contains illegal characters ${name} vs ${santisedName}` });
		}

		if (name.length > NAME_LIMIT) {
			return reply.status(403).send({ "fail": `Domain name too long, limit is ${NAME_LIMIT} characters.` });
		}

		//consoleLog(`Check DB for basename `);

		//first check if name already exists
		if (db.isBaseNameRegistered(chainId, getBaseName(name))) {
			return reply.status(403).send({ "fail": `Base name ${getBaseName(name)} already registered` });
		}

		//consoleLog(`Check DB for tokencontract `);

		// Has this token previously been registered?
		if (db.getTokenContractRegistered(chainId, tokenContract)) {
			return reply.status(403).send({ "fail": `Token Contract ${chainId} : ${tokenContract} already registered` });
		}

		consoleLog(`Check resolver ${name} (${getBaseName(name)})`);

		//now check that resolver contract is correct
		let nameHash = await sendResolverRequest(getBaseName(name), numericEnsChainId !== null ? numericEnsChainId : 1); // use ENS Chain if specified to allow testnet dev
		let result = await waitForCheck(nameHash, chainId);

		if (result == ResolverStatus.BASE_DOMAIN_NOT_POINTING_HERE) {
			return reply.status(403).send({ "fail": `Resolver not correctly set for gateway.` });
		} else if (result == ResolverStatus.INTERMEDIATE_DOMAIN_NOT_SET) {
			return reply.status(403).send({ "fail": `Intermediate name resolver ${getBaseName(name)} not set correctly.` });
		} else if (result == ResolverStatus.CHAIN_MISMATCH) {
			return reply.status(403).send({ "fail": `Chain mismatch for ${getBaseName(name)} and ${chainId}.` });
		} else if (result == ResolverStatus.NOT_FOUND) {
			return reply.status(403).send({ "fail": `Name not found for ${getBaseName(name)} and ${chainId}.` });
		}

		try {
			const applyerAddress = recoverRegistrationAddress(name, numericChainId, tokenContract, signature);
			consoleLog("Registration address: " + applyerAddress);

			//check if address owns this name (either onchain, or registered here)
			const userOwns = await userOwnsDomain(getBaseName(name), name, applyerAddress, numericChainId);

			consoleLog(`OWNS: ${userOwns}`);

			if (userOwns) {
				db.registerBaseDomain(name, tokenContract, numericChainId, applyerAddress);
				return reply.status(200).send({ "result": "pass" });
			} else {
				// @ts-ignore
				return reply.status(403).send({ "fail": "User does not own the NFT or signature is invalid" });
			}
		} catch (e) {
			if (lastError.length < 1000) { // don't overflow errors
				lastError.push(e.message);
			}

			return reply.status(400).send({ "fail": e.message });
		}
	});

	app.post("/registertext/:chainId/:name/:key/:text/:signature", async (request, reply) => {
		const { chainId, name, key, text, signature } = request.params;

		let { row, tokenRow } = db.getTokenEntry(name, chainId);

		if (!row) {
			return reply.status(403).send({ "fail": "Name not registered" });
		}

		const applyerAddress = recoverTextAddress(name, chainId, key, text, signature);

		consoleLog(`Applyer: ${applyerAddress}`);

		//check signature
		// @ts-ignore
		var ownerAddress = await getOwnerAddress(chainId, name, tokenRow.token, row.owner, row.token_id);

		consoleLog(`Storage: ${ownerAddress} ${applyerAddress}`);

		//check matching address
		if (applyerAddress.toLowerCase() != ownerAddress.toLowerCase()) {
			return reply.status(403).send({ "fail": "Signature does not match owner" });
		} else {
			//update database with new text entry
			db.setText(chainId, name, key, text);
			return reply.status(200).send({ "result": "pass" });
		}
	});

	app.post('/registercontent/:chainId/:name/:signature/:ipfsHash?', async (request, reply) => {

		const { chainId, name, signature, ipfsHash } = request.params;
		//first check if name exists for this tokenId
		let { row, tokenRow } = db.getTokenEntry(request.params.name, request.params.chainId);

		if (!row) {
			return reply.status(403).send({ "fail": "Name not registered" });
		}

		// @ts-ignore
		const ownerAddress = await getOwnerAddress(chainId, name, tokenRow.token, row.owner, row.token_id);
		const applyerAddress = recoverStorageAddress(name, chainId, signature, ipfsHash);

		consoleLog(`Storage: ${ownerAddress} ${applyerAddress} ${JSON.stringify(row)}`);

		//check matching address
		if (applyerAddress.toLowerCase() != ownerAddress.toLowerCase()) {
			return reply.status(403).send({ "fail": "Signature does not match owner" });
		}

		let hasError = false;

		if (!ipfsHash || !isIPFS(ipfsHash)) {
			// Only allow this for certain whitelisted name entries or addresses. For names or addresses not on whitelist, they need to upload to IPFS themselves
			const parts = request.parts(); // Get an async iterator
			for await (const part of parts) {
				if (part.file) {
					try {
						const filename = part.filename;
						const savePath = `./upload/${filename}`;
						consoleLog(`Saving file to ${savePath}`);

						await pump(part.file, fs.createWriteStream(savePath));

						//now upload to IPFS
						const ipfsHashRcv = await uploadFileToIPFS(savePath);
						consoleLog(`IPFS HASH: ${ipfsHashRcv.Hash}`);

						ipfsHash = ipfsHashRcv.Hash;

						//now delete file
						fs.unlinkSync(savePath);
					} catch (e) {
						if (lastError.length < 1000) { // don't overflow errors
							lastError.push(e.message);
							hasError = true;
						}
					}
				}
			}
		}

		if (hasError) {
			return reply.status(400).send({ "fail": "Error uploading file" });
		} else {
			//now store in database
			db.addStorage(ipfsHash, chainId, name);
			return reply.status(200).send({ "result": "pass" });
		}
	});

	app.post('/registerForChain/:chainId/:name/:tokenId/:signature/:ensAddress/:ensChainId', async (request, reply) => {
		return processRegistration(request, reply);
	});

	app.post('/register/:chainId/:name/:tokenId/:signature/:ensAddress?', async (request, reply) => {
		return processRegistration(request, reply);
	});

	// app.post('/register/:chainId/:name/:tokenId/:signature/:ensAddress/:ensChainId?', async (request, reply) => {
	// 	const { chainId, tokenId, name, signature, ensAddress } = request.params;

	// 	const numericChainId: number = Number(chainId);
	// 	const numericEnsChainId: number = 0;

	// 	consoleLog(`chainId: ${numericChainId} name: ${name} tokenId: ${tokenId} signature: ${signature}`);

	// 	if (!db.checkAvailable(chainId, name)) {
	// 		let returnMsg = { "error": "Name Unavailable" };
	// 		return reply.status(403).send(returnMsg);
	// 	}

	// 	//now check domain name is possible to use - must be an entry in the tokens database
	// 	let baseName = getBaseName(name);
	// 	consoleLog(`BaseName: ${baseName}`);
	// 	if (!db.isBaseNameRegistered(chainId, baseName)) {
	// 		//this basename hasn't yet been registered
	// 		return reply.status(403).send({ "fail": `Basename ${baseName} not registered on the server, cannot create this domain name` });
	// 	}

	// 	//name: baseName, chainId, token: row.token
	// 	let { tokenContract } = db.getTokenDetails(chainId, baseName);

	// 	consoleLog(`Register token ${tokenContract}`);

	// 	if ( tokenContract === null ) {
	// 		return reply.status(400).send({ "fail": `Basename ${baseName} not registered` });
	// 	}

	// 	try {
	// 		const applyerAddress = recoverAddress(name, tokenId, signature);
	// 		consoleLog("APPLY: " + applyerAddress);

	// 		//now determine if user owns the NFT
	// 		const userOwns = await userOwnsNFT(numericChainId, tokenContract, applyerAddress, tokenId);

	// 		if (userOwns) {
	// 			let ensPointAddress = getTokenBoundAccount(numericChainId, tokenContract, tokenId);

	// 			if (ensAddress && ethers.isAddress(ensAddress)) {
	// 				ensPointAddress = address;
	// 			}

	// 			consoleLog("Account: " + ensPointAddress);

	// 			db.addElement(name, ensPointAddress, numericChainId, tokenId, applyerAddress, numericEnsChainId);
	// 			return reply.status(200).send({ "result": "pass" });
	// 		} else {
	// 			return reply.status(403).send({ "fail": "User does not own the NFT or signature is invalid" });
	// 		}
	// 	} catch (e) {
	// 		if (lastError.length < 1000) { // don't overflow errors
	// 			lastError.push(e.message);
	// 		}

	// 		return reply.status(400).send({ "fail": e.message });
	// 	}
	// });

	// app.post('/register/:chainId/:name/:tokenId/:signature/:ensAddress?', async (request, reply) => {
	// 	//tokenContract

	// 	const { chainId, tokenId, name, signature, ensAddress } = request.params;

	// 	const numericChainId: number = Number(chainId);
	// 	const numericEnsChainId: number = 0;

	// 	consoleLog(`chainId: ${numericChainId} name: ${name} tokenId: ${tokenId} signature: ${signature}`);

	// 	if (!db.checkAvailable(chainId, name)) {
	// 		let returnMsg = { "error": "Name Unavailable" };
	// 		return reply.status(403).send(returnMsg);
	// 	}

	// 	//now check domain name is possible to use - must be an entry in the tokens database
	// 	let baseName = getBaseName(name);
	// 	consoleLog(`BaseName: ${baseName}`);
	// 	if (!db.isBaseNameRegistered(chainId, baseName)) {
	// 		//this basename hasn't yet been registered
	// 		return reply.status(403).send({ "fail": `Basename ${baseName} not registered on the server, cannot create this domain name` });
	// 	}

	// 	//name: baseName, chainId, token: row.token
	// 	let { tokenContract } = db.getTokenDetails(chainId, baseName);

	// 	consoleLog(`Register token ${tokenContract}`);

	// 	if ( tokenContract === null ) {
	// 		return reply.status(400).send({ "fail": `Basename ${baseName} not registered` });
	// 	}

	// 	try {
	// 		const applyerAddress = recoverAddress(name, tokenId, signature);
	// 		consoleLog("APPLY: " + applyerAddress);

	// 		//now determine if user owns the NFT
	// 		const userOwns = await userOwnsNFT(numericChainId, tokenContract, applyerAddress, tokenId);

	// 		if (userOwns) {
	// 			let ensPointAddress = getTokenBoundAccount(numericChainId, tokenContract, tokenId);

	// 			if (ensAddress && ethers.isAddress(ensAddress)) {
	// 				ensPointAddress = address;
	// 			}

	// 			consoleLog("Account: " + ensPointAddress);

	// 			db.addElement(name, ensPointAddress, numericChainId, tokenId, applyerAddress, numericEnsChainId);
	// 			return reply.status(200).send({ "result": "pass" });
	// 		} else {
	// 			return reply.status(403).send({ "fail": "User does not own the NFT or signature is invalid" });
	// 		}
	// 	} catch (e) {
	// 		if (lastError.length < 1000) { // don't overflow errors
	// 			lastError.push(e.message);
	// 		}

	// 		return reply.status(400).send({ "fail": e.message });
	// 	}
	// });

	async function processRegistration(request, reply) {
		const { chainId, tokenId, name, signature, ensAddress } = request.params;
		const numericChainId = Number(chainId);
		const numericEnsChainId = request.params.ensChainId ? Number(request.params.ensChainId) : 0;

		consoleLog(`chainId: ${numericChainId} name: ${name} tokenId: ${tokenId} signature: ${signature}`);

		if (!db.checkAvailable(chainId, name)) {
			return reply.status(403).send({ "error": "Name Unavailable" });
		}

		let baseName = getBaseName(name);
		consoleLog(`BaseName: ${baseName}`);
		if (!db.isBaseNameRegistered(chainId, baseName)) {
			return reply.status(403).send({ "fail": `Basename ${baseName} not registered on the server, cannot create this domain name` });
		}

		let { tokenContract } = db.getTokenDetails(chainId, baseName);
		consoleLog(`Register token ${tokenContract}`);

		if (!tokenContract) {
			return reply.status(400).send({ "fail": `Basename ${baseName} not registered` });
		}

		try {
			const applyerAddress = recoverAddress(name, numericChainId, tokenId, signature);
			consoleLog("APPLY: " + applyerAddress);
			const userOwns = await userOwnsNFT(numericChainId, tokenContract, applyerAddress, tokenId);

			if (userOwns) {
				let ensPointAddress = getTokenBoundAccount(numericChainId, tokenContract, tokenId);

				if (ensAddress && ethers.isAddress(ensAddress)) {
					ensPointAddress = ensAddress;
				}

				consoleLog("Account: " + ensPointAddress);
				db.addElement(name, ensPointAddress, numericChainId, tokenId, applyerAddress, numericEnsChainId);
				return reply.status(200).send({ "result": "pass" });
			} else {
				return reply.status(403).send({ "fail": "User does not own the NFT or signature is invalid" });
			}
		} catch (e) {
			if (lastError.length < 1000) {  // don't overflow errors
				lastError.push(e.message);
			}
			return reply.status(400).send({ "fail": e.message });
		}
	}

	return app;
}


// TODO: Ideally these (and the route functions themselves) are split into separate files
export function init() {
	consoleLog("Initialising");
	db.initDb();
	//dumpDb();	
	consoleLog("Done");
}

async function getTokenImage(chainId: number, name: string, tokenId: number) {
	consoleLog(`getTokenImage ${chainId} ${name} ${tokenId}`);
	const { tokenRow } = db.getTokenEntry(name, chainId);

	consoleLog(`${chainId} ${tokenRow.token}`);

	if (tokenRow && tokenRow.token) {
		const tokenData = await tokenAvatarRequest(chainId, tokenRow.token, tokenId);
		return tokenData;
	} else {
		return "";
	}
}

function resolveCheckIntercept(dName: string, chainId: number): boolean {
	let bIndex = dName.indexOf('.');
	if (bIndex >= 0) {
		let pName = dName.substring(0, bIndex);
		//consoleLog(`ICheck ${pName}`);
		if (resolverChecks.has(pName)) {
			consoleLog(`intercept ${dName} ${chainId}`);
			//now ensure the rest of the key exists in the database if it's a subdomain
			resolverChecks.set(pName, { name: dName, chainId, onChainName: "" });
			//consoleLog(`Added! ${dName}`);
			return true;
		}
	}

	return false;
}

// restrict size
function addCointTypeCheck(text: string) {
	coinTypeRoute.push(`${text}`);

	if (coinTypeRoute.length > (logDumpLimit * 2)) {
		coinTypeRoute.splice(0, logDumpLimit * 2);
	}
}

//Resolver check:
export async function sendResolverRequest(baseName: string, chainId: number): Promise<string> {
	//1. send request
	let bytes = ethers.randomBytes(8);
	let nameHash = ethers.hexlify(bytes);
	consoleLog(`Resolve: ${nameHash}.${baseName}`);
	//kick off process to call the resolve and write the base resolver name in - we need this to check ownership
	resolveEnsName(baseName, nameHash, chainId)
		.then(({ userAddr, onChainName }) => {
			consoleLog(`RT: ${userAddr} ${onChainName}`);
			let thisCheck = resolverChecks.get(nameHash);
			if (thisCheck) {
				thisCheck!.onChainName = onChainName;
				thisCheck!.nameResolve = userAddr;
				if (userAddr !== ZeroAddress && onChainName !== null) {
					consoleLog(`RESOLVE: ${onChainName} ${userAddr} ${nameHash}`);
				} else {
					consoleLog(`baseName ${baseName} not resolved`);
				}
				resolverChecks.set(nameHash, thisCheck);
			} else {
				consoleLog(`Resolve ${nameHash} timed out.`);
			}
		});

	resolverChecks.set(nameHash, { name: "", chainId: 0 });

	consoleLog(`Wait for Resolve: ${nameHash}`);

	return nameHash;
}

function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForCheck(nameHash: string, chainId: number): Promise<ResolverStatus> {

	let resolved: ResolverStatus = ResolverStatus.BASE_DOMAIN_NOT_POINTING_HERE;

	for (let i = 0; i < RESOLVER_TIMEOUT_SECS; i++) {
		await delay(1000);
		let thisCheck = resolverChecks.get(nameHash);
		if (thisCheck?.name.length > 0 && thisCheck?.onChainName.length > 0) {
			consoleLog(`Resolved! ${thisCheck?.onChainName} ${thisCheck?.nameResolve} ${thisCheck?.chainId}`);

			// check that everything is setup correctlyw
			if (thisCheck?.nameResolve === ZeroAddress) {
				resolved = ResolverStatus.INTERMEDIATE_DOMAIN_NOT_SET;
			} else if (thisCheck?.chainId !== chainId) {
				resolved = ResolverStatus.CHAIN_MISMATCH; // This is most likely a chain spoofing attempt
			} else if (thisCheck?.nameResolve === RESOLVE_FAKE_ADDRESS) {
				resolved = ResolverStatus.CORRECTLY_SETUP;
			}
			break;
		}
	}

	resolverChecks.set(nameHash, null);

	return resolved;
}

async function getOwnerAddress(chainId: number, name: string, tokenAddress: string, owner: string, tokenId: number): Promise<string> {
	var ownerAddress = owner;
	if (true/*!owner*/) {
		//need to use token owner
		consoleLog(`${chainId} ${tokenAddress} ${tokenId}`);
		ownerAddress = await getTokenOwner(chainId, tokenAddress, tokenId);
		consoleLog(`Owner: ${ownerAddress}`);

		//now update database with the recovered owner
		db.updateTokenOwner(name, chainId, ownerAddress);
	}

	return ownerAddress;
}

function recoverAddress(name: string, chainID: number, tokenId: string, signature: string): string {
	const message = `Registering your tokenId ${tokenId} name to ${name} on chain ${chainID}`;
	consoleLog("MSG: " + message);
	return ethers.verifyMessage(message, addHexPrefix(signature));
}

function recoverRegistrationAddress(name: string, chainID: number, tokenContract: string, signature: string): string {
	const message = `Attempting to register domain ${name} name to ${tokenContract} on chain ${chainID}`;
	consoleLog("MSG: " + message);
	consoleLog(`SIG: ${signature}`);
	if (signature.length < 130 || signature.length > 132) {
		consoleLog(`ERROR: ${signature.length}`);
		return ZeroAddress;
	} else {
		return ethers.verifyMessage(message, addHexPrefix(signature));
	}
}

function recoverStorageAddress(name: string, chainId: number, signature: string, ipfsHash: string): string {
	var message = `Attempting to update storage to domain ${name} on ${chainId}`;
	if (ipfsHash) { // TODO: Only accept without hash if user is whitelisted
		message += ` with hash ${ipfsHash}`;
	}

	consoleLog("MSG: " + message);
	consoleLog(`SIG: ${signature}`);
	if (signature.length < 130 || signature.length > 132) {
		consoleLog(`ERROR: ${signature.length}`);
		return ZeroAddress;
	} else {
		return ethers.verifyMessage(message, addHexPrefix(signature));
	}
}

function recoverTextAddress(name: string, chainId: number, key: string, text: string, signature: string): string {
	var message = `Attempting to update ${name} ${key} to value ${text} on ${chainId}`;
	consoleLog("MSG: " + message);
	consoleLog(`SIG: ${signature}`);
	if (signature.length < 130 || signature.length > 132) {
		consoleLog(`ERROR: ${signature.length}`);
		return ZeroAddress;
	} else {
		return ethers.verifyMessage(message, addHexPrefix(signature));
	}
}

async function userOwnsNFT(chainId: number, contractAddress: string, applyerAddress: string, tokenId: string): Promise<boolean> {

	if (!chainId)
		throw new Error("Missing chain config");

	consoleLog(`Owner: ${applyerAddress} ${contractAddress} ${tokenId}`);

	// Spamming protection
	if (checkCachedResults(chainId, contractAddress, applyerAddress, tokenId)) {
		return useCachedValue(chainId, contractAddress, applyerAddress, tokenId);
	}

	const owner = await getTokenOwner(chainId, contractAddress, tokenId);

	if (owner.toLowerCase() === applyerAddress.toLowerCase()) {
		consoleLog("Owns");
		cachedResults.set(getCacheKey(chainId, contractAddress, applyerAddress, tokenId), { owns: true, timeStamp: Date.now() });
		return true;
	} else {
		consoleLog("Doesn't own");
		cachedResults.set(getCacheKey(chainId, contractAddress, applyerAddress, tokenId), { owns: false, timeStamp: Date.now() });
		return false;
	}
}

async function getTokenOwner(chainId: number, contractAddress: string, tokenId: string): Promise<string> {
	const provider = getProvider(chainId);

	const testCatsContract = new ethers.Contract(contractAddress, [
		'function ownerOf(uint256 tokenId) view returns (address)'
	], provider);

	const owner = await testCatsContract.ownerOf(tokenId);
	consoleLog(`Owner: ${owner}`);
	return owner;
}

function getCacheKey(chainId, contractAddress, applyerAddress, tokenId): string {
	return contractAddress + "-" + chainId + "-" + applyerAddress + "-" + tokenId;
}

function useCachedValue(chainId, contractAddress, applyerAddress, tokenId): boolean {
	const key = getCacheKey(chainId, contractAddress, applyerAddress, tokenId);
	const mapping = cachedResults.get(key);
	if (mapping) {
		//consoleLog("Owns?: " + mapping.owns);
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
			//consoleLog("Can use cache");
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

export function checkCacheEntries() {
	//check cache and clear old values
	let removeResultKeys: string[] = [];

	for (let [key, result] of cachedResults) {
		if (result.timeStamp < (Date.now() - cacheTimeout)) {
			//consoleLog("out of date entry: " + key);
			removeResultKeys.push(key);
		}
	}

	removeResultKeys.forEach(value => {
		//consoleLog("remove out of date entry: " + value);
		cachedResults.delete(value);
	});
}

// upload file to IPFS using Infura
async function uploadFileToIPFS(filePath: string): Promise<string> {
	const form = new FormData();
	form.append('file', fs.createReadStream(filePath));

	try {
		const response = await fetch('https://ipfs.infura.io:5001/api/v0/add?pin=true', {
			method: 'POST',
			headers: {
				'Authorization': ipfsAuth,
			},
			body: form,
		});

		const data = await response.json();
		return data;
	} catch (e) {
		if (lastError.length < 1000) { // don't overflow errors
			lastError.push(e.message);
		}
	}

	return "";
}

function dumpDb() {
	const dump = db.getTableDump();
	fs.writeFileSync('./dump.csv', dump);
}