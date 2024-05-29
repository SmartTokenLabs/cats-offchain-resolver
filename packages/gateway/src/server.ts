import { Server } from '@chainlink/ccip-read-server';
import { ethers, BytesLike } from 'ethers';
import { hexConcat, Result } from 'ethers/lib/utils';
// import { ETH_COIN_TYPE } from './utils';
import { abi as IResolverService_abi } from '@ensdomains/offchain-resolver-contracts/artifacts/contracts/OffchainResolver.sol/IResolverService.json';
import { abi as Resolver_abi } from '@ensdomains/ens-contracts/artifacts/contracts/resolvers/Resolver.sol/Resolver.json';
import fetch from 'node-fetch';
import { ETH_COIN_TYPE } from './utils';
const Resolver = new ethers.utils.Interface(Resolver_abi);

interface DatabaseResult {
  result: any[];
  ttl: number;
}

type PromiseOrResult<T> = T | Promise<T>;

export interface Database {
  addr(
    name: string,
    coinType: number
  ): PromiseOrResult<{ addr: string; ttl: number }>;
  text(
    name: string,
    key: string
  ): PromiseOrResult<{ value: string; ttl: number }>;
  contenthash(
    name: string
  ): PromiseOrResult<{ contenthash: string; ttl: number }>;
}

function decodeDnsName(dnsname: Buffer) {
  const labels = [];
  let idx = 0;
  while (true) {
    const len = dnsname.readUInt8(idx);
    if (len === 0) break;
    labels.push(dnsname.slice(idx + 1, idx + len + 1).toString('utf8'));
    idx += len + 1;
  }
  return labels.join('.');
}

const queryHandlers: {
  [key: string]: (
    dataPath: string,
    name: string,
    ttlVal: number,
    args: Result,
    chainId: number,
  ) => Promise<DatabaseResult>;
} = {
  // @ts-ignore
  'addr(bytes32)': async (dataPath, name, ttlVal, _args, chainId) => { 
    return await resolve(dataPath, name, ETH_COIN_TYPE, ttlVal, chainId);
  },
  // @ts-ignore
  'addr(bytes32,uint256)': async (dataPath, name, ttlVal, args, chainId) => { 
    const coinType = <number>args[0];
    return await resolve(dataPath, name, coinType, ttlVal, chainId);
  },
  // @ts-ignore
  'text(bytes32,string)': async (dataPath, name, ttlVal, args, chainId) => {
    try {
      const addrReq = await fetch(`${dataPath}/text/${name}/${args[0]}/${chainId}`);
      //console.log(`addrReq: ${dataPath}/text/${name}/${args[0]}/${chainId} : ${JSON.stringify(addrReq)}`);
      const text = await addrReq.text();
      return { result: [text], ttl:ttlVal };
    } catch (error) {
      console.log('error', error);
      return { result: [""], ttl:ttlVal };
    }
  },
  // @ts-ignore
  'contenthash(bytes32)': async (dataPath, name, ttlVal, _args, chainId) => {
    //console.log(`contenthash ${dataPath}/contenthash/${name}/${chainId}`);
    const contentHashReq = await fetch(`${dataPath}/contenthash/${name}/${chainId}`);
    const contentHash = await contentHashReq.text();
    //console.log(`contentHash: ${contentHash} ${JSON.stringify(contentHash)}`);
    return { result: [contentHash], ttl:ttlVal };
  },
};

async function resolve(dataPath: string, name: string, coinType: number, ttlVal: number, chainId: number) {
  try {
    //console.log(`${dataPath}/addr/${name}/${coinType}/${chainId}`);
    const addrReq = await fetch(`${dataPath}/addr/${name}/${coinType}/${chainId}`);
    const resp = await addrReq.json();
    //console.log(`result: ${resp.addr} ttl:${ttlVal}`);
    return { result: [resp.addr], ttl:ttlVal };
  } catch (error) {
    console.log('error', error);
    return { result: ["0x0000000000000000000000000000000000000000"], ttl:ttlVal };
  }
}

async function query(
  dataPath: string,
  ttlVal: number,
  name: string,
  data: string,
  chainId: number
): Promise<{ result: BytesLike; validUntil: number }> {
  // Parse the data nested inside the second argument to `resolve`
  const { signature, args } = Resolver.parseTransaction({ data });

  if (ethers.utils.nameprep(name) !== name) {
    throw new Error('Name must be normalised');
  }

  if (ethers.utils.namehash(name) !== args[0]) {
    throw new Error('Name does not match namehash'); 
  }

  const handler = queryHandlers[signature];
  if (handler === undefined) {
    throw new Error(`Unsupported query function ${signature}`);
  }

  const { result, ttl } = await handler(dataPath, name, ttlVal, args.slice(1), chainId);
  return {
    result: Resolver.encodeFunctionResult(signature, result),
    validUntil: Math.floor(Date.now() / 1000 + ttl),
  };
}

export function makeServer(signer: ethers.utils.SigningKey, dataPath: string, ttl: number) {
  const server = new Server();
  server.add(IResolverService_abi, [
    {
      type: 'resolve',
      func: async ([encodedName, data]: Result, request) => {
        const name = decodeDnsName(Buffer.from(encodedName.slice(2), 'hex'));
        //const resolverAddr: string = request.to.toString();
        //console.log(`name: ${name} dataPath ${dataPath} ${data} ${request?.data}`);
        //console.log(`Request: ${resolverAddr}`);

        var chainIdToUse: number;

        try {
          //console.log(`Request1: ${resolverAddr}`);
          let bytesArray = ethers.utils.arrayify(request?.data);
          const payloadData = bytesArray.slice(4);
          const types = ['bytes', 'bytes', 'uint256'];
          const [, , chainId] = ethers.utils.defaultAbiCoder.decode(types, payloadData);
          //console.log(`Request2: ${resolverAddr} ${chainId}`);
          //console.log(`${chainId}`);
          chainIdToUse = chainId;
          if (chainIdToUse == 0) {
            chainIdToUse = 8887;
          }
        } catch (e) {
          chainIdToUse = 8887; //put this onto a chain that doesn't exist (this will be logged safely into that database so as not to overwrite anything)
        }

        // Query the database
        const { result, validUntil } = await query(dataPath, ttl, name, data, chainIdToUse);

        //console.log("Request from DB: " + result + " : " + validUntil);

        // Hash and sign the response
        let messageHash = ethers.utils.solidityKeccak256(
          ['bytes', 'address', 'uint64', 'bytes32', 'bytes32'],
          [
            '0x1900',
            request?.to,
            validUntil,
            ethers.utils.keccak256(request?.data || '0x'),
            ethers.utils.keccak256(result),
          ]
        );
        const sig = signer.signDigest(messageHash);
        const sigData = hexConcat([sig.r, sig._vs]);
        return [result, validUntil, sigData];
      },
    },
  ]);
  return server;
}
//signer, '/', DATABASE_CONNECTION, TTL
export function makeApp(
  signer: ethers.utils.SigningKey,
  path: string,
  dataPath: string,
  ttl: number
) {
  return makeServer(signer, dataPath, ttl).makeApp(path);
}
