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
    args: Result
  ) => Promise<DatabaseResult>;
} = {
  // @ts-ignore
  'addr(bytes32)': async (dataPath, name, ttlVal, _args) => { //Main ENS route should return no address
    return await resolve(dataPath, name, ETH_COIN_TYPE, ttlVal);
  },
  // @ts-ignore
  'addr(bytes32,uint256)': async (dataPath, name, ttlVal, args) => { //addr(nodeHash,coinType) should return address if looking on Polygon mainnet (SLIP-44: #966).

    const coinType = <number>args[0];
    console.log(`${name} Attempt to resolve: ${coinType}`);

    return await resolve(dataPath, name, coinType, ttlVal);
  },
  // @ts-ignore
  'text(bytes32,string)': async (dataPath, name, ttlVal, args) => {
    //const { value, ttl } = await db.text(name, args[0]);
    const value = null;
    return { result: [value], ttl:ttlVal };
  },
  // @ts-ignore
  'contenthash(bytes32)': async (dataPath, name, ttlVal, _args) => {
    //const { contenthash, ttl } = await db.contenthash(name);
    const contenthash = null;
    return { result: [contenthash], ttl:ttlVal };
  },
};

async function resolve(dataPath: string, name: string, coinType: number, ttlVal: number){

  try {
    const addrReq = await fetch(`${dataPath}/addr/${name}/${coinType}`);
    const resp = await addrReq.json();
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
  data: string
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

  const { result, ttl } = await handler(dataPath, name, ttlVal, args.slice(1));
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
        console.log("Request: " + name);
        // Query the database
        const { result, validUntil } = await query(dataPath, ttl, name, data);

        console.log("Request from DB: " + result + " : " + validUntil);

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
