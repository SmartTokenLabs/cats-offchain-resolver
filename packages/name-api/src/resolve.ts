import { ZeroAddress, ethers } from 'ethers';
import bs58 from 'bs58';

// @ts-ignore
import { INFURA_KEY, NAME_LIMIT } from "./constants";

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

type ChainDetail = {
    name: string;
    RPCurl: string;
    chainId: number;
};

export const CHAIN_ID: Record<string, number> = {
    "mainnet": 1,
    "polygon": 137,
    "optimism": 10,
    "arbitrum": 42161,
    "sepolia": 11155111,
    "mantle": 5000,
    "mantle-testnet": 5003,
    "holesky": 17000,
};

const CHAIN_DETAILS: Record<number, ChainDetail> = {
    1: { name: "mainnet", RPCurl: `https://mainnet.infura.io/v3/${INFURA_KEY}`, chainId: 1 },
    5: { name: "goerli", RPCurl: `https://goerli.infura.io/v3/${INFURA_KEY}`, chainId: 5 },
    11155111: { name: "sepolia", RPCurl: `https://sepolia.infura.io/v3/${INFURA_KEY}`, chainId: 11155111 },
    42161: { name: "arbitrum-mainnet", RPCurl: `https://arbitrum-mainnet.infura.io/v3/${INFURA_KEY}`, chainId: 42161 },
    80001: { name: "polygon-mumbai", RPCurl: `https://polygon-mumbai.infura.io/v3/${INFURA_KEY}`, chainId: 80001 },
    137: { name: "polygon-mainnet", RPCurl: `https://polygon-mainnet.infura.io/v3/${INFURA_KEY}`, chainId: 137 },
    10: { name: "optimism-mainnet", RPCurl: `https://optimism-mainnet.infura.io/v3/${INFURA_KEY}`, chainId: 10 },
    17000: { name: "holesky", RPCurl: `https://holesky.infura.io/v3/${INFURA_KEY}`, chainId: 17000 },
    5000: { name: "mantle", RPCurl: `https://rpc.mantle.xyz`, chainId: 5000 },
    5003: { name: "mantle-testnet", RPCurl: `https://rpc.sepolia.mantle.xyz`, chainId: 5003 },
};

// Domains owned by STL, subdomains can be used freely
const STL_DOMAINS: Record<string, number[]> = {
    'smartlayer.eth': [1, 5, 11155111],
    'xnft.eth': [11155111, 17000],
    'thesmartcats.eth': [11155111, 17000],
    'esp32.eth': [11155111, 17000],
  };

export function getProvider(useChainId: number): ethers.JsonRpcProvider | null {
    const chainDetails: ChainDetail = CHAIN_DETAILS[useChainId];

    //console.log(`CHAIN ${chainDetails.RPCurl} ${chainDetails.name} ${chainDetails.chainId}`);

    if (chainDetails !== null) {
        return new ethers.JsonRpcProvider(chainDetails.RPCurl, {
            chainId: chainDetails.chainId,
            name: chainDetails.name,
            ensAddress: ENS_REGISTRY,
        });
    } else {
        return null;
    }
}

//@ts-ignore
const returnAbi = [
    {
        "constant": false,
        "inputs": [
            {
                "name": "sender",
                "type": "address"
            },
            {
                "name": "urls",
                "type": "string[]"
            },
            {
                "name": "callData",
                "type": "bytes"
            },
            {
                "name": "callbackFunction",
                "type": "bytes4"
            },
            {
                "name": "extraData",
                "type": "bytes"
            }
        ],
        "name": "OffchainLookup",
        "outputs": [],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

//@ts-ignore
const decodeAbi = [
    {
        "constant": true,
        "inputs": [],
        "name": "decode",
        "outputs": [
            {
                "name": "address",
                "type": "bytes"
            },
            {
                "name": "time",
                "type": "uint64"
            },
            {
                "name": "sig",
                "type": "bytes"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    }
];

async function resolverFromName(name: string, chainId: number): Promise<{resolver: null | string, resolvingName:string}> {

    let currentName = name;
    while (true) {
        if (currentName === "" || currentName === ".") { return {resolver: null, resolvingName: ""}; }

        // Optimization since the eth node cannot change and does
        // not have a wildcard resolver
        if (name !== "eth" && currentName === "eth") { return {resolver: null, resolvingName: ""}; }

        // Check the current node for a resolver
        const addr = await getResolver(currentName, chainId);

        // Found a resolver!
        if (addr != null) {
            //console.log(`RSV: ${addr}`);
            return {resolver: addr, resolvingName: currentName};
        }

        // Get the parent node
        currentName = currentName.split(".").slice(1).join(".");
    }
}

// @ts-ignore
async function getResolver(name: string, chainId: number): Promise<null | string> {

    const ensResolver = new ethers.Contract(ENS_REGISTRY, [
        "function resolver(bytes32) view returns (address)"
      ], getProvider(chainId));

    try {
        const addr = await ensResolver.resolver(ethers.namehash(name), {
            enableCcipRead: true
        });

        if (addr === ethers.ZeroAddress) { return null; }
        return addr;

    } catch (error) {
        // ENS registry cannot throw errors on resolver(bytes32),
        // so probably a link error
        throw error;
    }

    return null;
}

// @ts-ignore
async function resolve(name: string, offchainResolverAddress: string, chainId: number): Promise<string> {
    const namehash = ethers.namehash(name);
    const dnsEncode = ethers.dnsEncode(name);
    const funcEncode = "0x3b3b57de" + namehash.substring(2);

    //console.log(`OFFCH: ${offchainResolverAddress}`);

    const catResolver = new ethers.Contract(offchainResolverAddress, [
      'function resolve(bytes name, bytes data) view returns (bytes)',
      'function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns(bytes memory)'
    ], getProvider(chainId));

    //call, get error
    try {
      const resolverTx = await catResolver.resolve(dnsEncode, funcEncode);
      console.log(resolverTx);
    } catch (error) {
      //break down the data
      //console.log(`ERROR: ${JSON.stringify(error)}`);
      // @ts-ignore
      const iface = new ethers.Interface(returnAbi);

      var callUrl = null;
      var decoded = null;

      try {
        // @ts-ignore
        decoded = iface.decodeFunctionData('OffchainLookup', error.data);

        //format URL:
        // @ts-ignore
        callUrl = decoded.urls[0].replace('{sender}', decoded.sender).replace('{data}', decoded.callData);
      } catch (error) {
        console.log(`ERRORR: ${JSON.stringify(error)}`);
        return ethers.ZeroAddress;
      }

      //console.log(`${callUrl}`);

      try {
        const response = await fetch(callUrl);

        if (response.ok) {
          const data = await response.json();

          //response1
          const proofResponse = data.data;
          // @ts-ignore
          const extraData = decoded.extraData;

          //now call proof
          const proofReturn = await catResolver.resolveWithProof(proofResponse, extraData);
          //console.log(proofReturn);

          //console.log("Len: " + proofReturn.length);
          var truncated = proofReturn;
          if (proofReturn.length > 42) {
            truncated = "0x" + proofReturn.substring(proofReturn.length - 40);
          }

          //console.log("Truncated: " + truncated);

          return ethers.getAddress(truncated);
        }
     } catch (callError) {
        //nop, expected
     }
    }

    return ethers.ZeroAddress;
  }

// This is only required to be a partial resolve: only need to route the call via gateway back to name-api
export async function resolveEnsName(baseName: string, hashName: string, chainId: number): Promise<{userAddr: string, onChainName: string}> {
    let resolveName = `${hashName}.${baseName}`;
    console.log(`Resolve this: ${resolveName} ${chainId}`);
    
    //let resolver = await provider.getResolver(resolveName);

    //let ethMainnetAddress = await resolver!!.getAddress();

    const { resolver, resolvingName } = await resolverFromName(baseName, chainId);
    let ensAddr = ZeroAddress;
    if (resolver !== null) {
        ensAddr = await resolve(resolveName, resolver!, chainId);
    } 

    //console.log(`UserAddress: ${ethMainnetAddress} ${userAddress}`);
    return {userAddr: ensAddr, onChainName: resolvingName};
}

export async function userOwnsDomain(baseName: string, domainName: string, applyerAddress: string, chainId: number): Promise<boolean> {

    //first check if this is a 'free' domain
    //console.log(`DOM: ${domainName}`);
    // @ts-ignore
    let knownDomain = STL_DOMAINS[baseName];
    if (knownDomain && knownDomain.includes(chainId)) {
        return true; //allowed to use
    }

    //console.log(`ADR: ${applyerAddress}`);

    const testDomainOwner = new ethers.Contract(ENS_REGISTRY, [
      'function owner(bytes32 nodeHash) view returns (address)'
    ], getProvider(chainId));
  
    const owner = await testDomainOwner.owner(ethers.namehash(domainName));
    //console.log("Owner: " + owner);

    if (owner == applyerAddress) {
        return true;
    }

    //console.log(`ADR: ${applyerAddress}`);

    //could be namewrapper
    const testNameWrapper = new ethers.Contract(owner, [
        'function ownerOf(uint256 nodeHash) view returns (address)'
      ], getProvider(chainId));

    const resolveWrappedOwnership = await testNameWrapper.ownerOf(ethers.namehash(domainName));

    //console.log(`Wrap Owner: ${resolveWrappedOwnership}`);

    return resolveWrappedOwnership == applyerAddress;
  }

  export function getBaseName(name: string): string {
    //base name is now just the front domain removed
    let firstIndex = name.indexOf('.');
    if (firstIndex < name.lastIndexOf('.')) {
        return name.slice(firstIndex+1);
    } else {
        return name;
    }
  }

  export function getPrimaryName(name: string): string {
    const thisName = name.split('.')[0];
    const santisedName = thisName.toLowerCase().replace(/\s+/g, '-').replace(/-{2,}/g, '').replace(/^-+/g, '').replace(/[;'"`\\]/g, '').replace(/^-+|-+$/g, '');
    const truncatedName = santisedName.slice(0, NAME_LIMIT);

    return truncatedName
  }

  export function ipfsHashToHex2(ipfsHash: string): string {
    // Decode Base58 string to a buffer
    const buffer = bs58.decode(ipfsHash);

    // Convert the buffer to a hex string
    const hex = Buffer.from(buffer).toString('hex');

    return hex;
}

export function ipfsHashToHex(ipfsHash: string): string {
    // Decode the IPFS hash from Base58 to a buffer
    const buffer = bs58.decode(ipfsHash);
  
    // Convert the buffer (Uint8Array) to a hex string
    const hex = Buffer.from(buffer).toString('hex');
  
    // Assuming CIDv1 with dag-pb (0x70) and SHA-256 (0x12) multihash
    const prefixedHex = `e3010170${hex}`;
  
    return `0x${prefixedHex}`;
}