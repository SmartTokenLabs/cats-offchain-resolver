import { Command } from 'commander';
import { GetAccountParams, TokenboundClient } from '@tokenbound/sdk';
//import {createPublicClient, http, WalletClient} from "viem";
import ethers from 'ethers';
//@ts-ignore
import fetch from 'node-fetch';
//import {goerli, mainnet} from "viem/chains";

const program = new Command();
program
  .requiredOption('-r --registry <address>', 'ENS registry address', '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e') //0x4dBFD41eA7639eB5FbC95e4D2Ea63369e7Be143f <<-- resolver, registry is 0x283Af0B28c62C092C9727F1Ee09c02CA627EB7F5
  .option('-p --provider <url>', 'web3 provider URL', 'https://mainnet.infura.io/v3/299d21cf56ed45f98046fcc773ab2239') //https://ethereum-goerli.publicnode.com
  .option('-i --chainId <chainId>', 'chainId', '1') //5
  .option('-n --chainName <name>', 'chainName', 'mainnet') //Goerli
  .argument('<name>');

program.parse(process.argv);
const options = program.opts();
const ensAddress = options.registry;
const chainId = parseInt(options.chainId);
const chainName = options.chainName;
const provider = new ethers.providers.JsonRpcProvider(options.provider, {
  chainId,
  name: chainName,
  ensAddress,
});

// Define the ENS resolver contract address for now, will add dynamic resolution if needed
//const ensResolverAddress = '0x8464135c8F25Da09e49BC8782676a84730C318bC';
//const ensResolverAddress = '0x02957D5823c1C973f2075d870985c856b6D1b93E';
//const ensResolverAddress = '0xeE6a307cdFe7Ee16988BF73Dfd0D001B3f200bD5'; //testnet

const ensResolverAddress = '0xDB34Da70Cfd694190742E94B7f17769Bc3d84D27'; //offchaintest.eth

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

const getTokenBoundClientInstance = (chainIdp: number) => {

  return new TokenboundClient({
    chainId: chainId,
    /*walletClient: createPublicClient({
      chain: chainId === 5 ? goerli : mainnet,
      transport: http()
    })*/
  });
}

//const polyChainId: number = 137;

/*const polyProvider = new ethers.providers.JsonRpcProvider("https://polygon-rpc.com", {
  chainId: polyChainId,
  name: chainName
});*/

/*async function fetchTokenMetadata(tokenId: number) {
  try {

    const catsAddr = "0xD5cA946AC1c1F24Eb26dae9e1A53ba6a02bd97Fe";

    const functionCall = new ethers.Contract(catsAddr, [
      'function tokenUri(uint256 tokenId) view returns (string)'
    ], polyProvider);

      // Fetch the token URI
      let tokenUri = await functionCall.tokenUri(tokenId);

      // Fetch the metadata
      let metadataResponse = await fetch(tokenUri);
      let metadata = await metadataResponse.json();

      console.log(metadata);
  } catch (error) {
      console.error(`Failed to fetch token metadata: ${error}`);
  }
}*/

type NFTParams = {
  tokenContract: string,
  tokenId: string
};

(async () => {
  const name = program.args[0];
  console.log(`${name}`);
  //let resolver = await provider.getResolver(name); //TODO: This may be updated

  let resolver: any = await provider.getResolver(name);

  //console.log(`Resolver Addr: ${JSON.stringify(resolver)}`);

  let ethMainnetAddress = await resolver.getAddress();
  
  let userAddress = await resolve(name, ensResolverAddress);
  console.log(`UserAddress: ${ethMainnetAddress} ${userAddress}`);

  //now calculate EIP-6551 addr:
  //@ts-ignore
  const tknContract: `0x${string}` = "0xd5ca946ac1c1f24eb26dae9e1a53ba6a02bd97fe" as `0x${string}`;
  const tknId: string = "1";


  let tokenBoundClient = getTokenBoundClientInstance(5);

  let nftParam: NFTParams = {
    tokenContract: tknContract,
    tokenId: tknId
  };

  let params: GetAccountParams = {
    tokenContract: tknContract,
    tokenId: tknId
  };

  console.log(`${params.tokenContract}`);

  let addr65512 = tokenBoundClient.getAccount({ tokenContract: tknContract, tokenId: tknId });

  console.log(`Caesar is dead ${addr65512}`);


  //let addr6551 = await computeCreate2Address();

  /*
  implementation,
            chainId,
            tokenContract,
            tokenId,
            salt*/


  // Port Solidity code to get TBA address
  async function computeCreate2Address(implementation: string, chainId: number, tokenContract: string, tokenId: number, salt: number, userAddr: string) {

    const constructorArgs = ethers.utils.defaultAbiCoder.encode(
        ["uint256", "uint256", "address", "uint256"],
        [salt, chainId, tokenContract, tokenId]
    );

    const creationCode = `0x3d60ad80600a3d3981f3363d3d373d3d3d363d73${implementation.slice(2)}5af43d82803e903d91602b57fd5bf3${constructorArgs.slice(2)}`;

    // Compute the keccak256 hash
    const bytecodeHash = ethers.utils.keccak256(creationCode);

    // Finally use Create2
    const create2Address = ethers.utils.getCreate2Address(
        userAddr, 
        ethers.utils.hexZeroPad(ethers.utils.hexlify(salt), 32),
        bytecodeHash
    );

    return create2Address;
}

  // @ts-ignore
  async function resolve(name: string, resolverAddress: string): Promise<string> {
    const namehash = ethers.utils.namehash(name);
    const dnsEncode = ethers.utils.dnsEncode(name);
    const funcEncode = "0x3b3b57de" + namehash.substring(2);

    const catResolver = new ethers.Contract(resolverAddress, [
      'function resolve(bytes name, bytes data) view returns (bytes)',
      'function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns(bytes memory)'
    ], provider);

    //call, get error
    try {
      const resolverTx = await catResolver.resolve(dnsEncode, funcEncode);
      console.log(resolverTx);
    } catch (error: any) {
      //break down the data
      console.log(`ERROR: ${JSON.stringify(error)}`);
      const iface = new ethers.utils.Interface(returnAbi);
      const decoded = iface.decodeFunctionData('OffchainLookup', error.data);
      

      //format URL:
      const callUrl = decoded.urls[0].replace('{sender}', decoded.sender).replace('{data}', decoded.callData);

      console.log(`${callUrl}`);

      try {
        const response = await fetch(callUrl);

        if (response.ok) {
          const data = await response.json();

          //response1
          const proofResponse = data.data;
          const extraData = decoded.extraData;

          //now call proof
          const proofReturn = await catResolver.resolveWithProof(proofResponse, extraData);
          console.log(proofReturn);

          console.log("Len: " + proofReturn.length);
          var truncated = proofReturn;
          if (proofReturn.length > 42) {
            truncated = "0x" + proofReturn.substring(proofReturn.length - 40);
          }

          console.log("Truncated: " + truncated);

          return ethers.utils.getAddress(truncated);
        }
      } catch (callError) {
        // nop, expected
      }
    }

    return ethers.constants.AddressZero;
  }


}

)();


