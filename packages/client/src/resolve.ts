import { Command } from 'commander';
import ethers from 'ethers';
//@ts-ignore
import fetch from 'node-fetch';
import dotenv from "dotenv";

dotenv.config();

const { PRIVATE_KEY, INFURA_KEY } = process.env;

const program = new Command();
program
  .requiredOption('-r --registry <address>', 'ENS registry address', '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e') //0x4dBFD41eA7639eB5FbC95e4D2Ea63369e7Be143f <<-- resolver, registry is 0x283Af0B28c62C092C9727F1Ee09c02CA627EB7F5
  .option('-p --provider <url>', 'web3 provider URL', `https://sepolia.infura.io/v3/${INFURA_KEY}`) //https://ethereum-goerli.publicnode.com
  .option('-i --chainId <chainId>', 'chainId', '11155111') //5
  .option('-n --chainName <name>', 'chainName', 'sepolia') //Goerli
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

// @ts-ignore
async function postUrl(url: string): Promise<string> {
  try {
      const response = await fetch(url, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify(""),
      });

      if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
      }

      const responseData = await response.json();
      console.log('Response:', responseData);
      return JSON.stringify(responseData);
  } catch (error) {
      console.error('Failed to post:', error);
  }

  return "failed";
}

(async () => {
  // @ts-ignore
  const name = program.args[0];

  let pk: string = PRIVATE_KEY!;
  // @ts-ignore
  const wallet = new ethers.Wallet(pk);

  // 1. Register token
  //register on xNFT (will be sepolia)
  //let tokenAddr = "0x4ffb1b3c2464644ba3436de3fc81a5d79cdf5760";
  // @ts-ignore
  let catsTokenAddr = "0xa04664f6191d9a65f5f48c6f9d6dd81cb636e65c";
  // @ts-ignore
  let chainId = 11155111;
  // @ts-ignore
  let tokenId = 5;
  let tokenName = name;

  const message = `Attempting to register domain ${tokenName} name to ${catsTokenAddr}`;

  console.log(`MSG: ${message}`);

  const signature = await wallet.signMessage(message);
  console.log('Signature: ', signature);

  let callUrl = `http://44.217.178.162:8083/registertoken/${chainId}/${catsTokenAddr}/${tokenName}/${signature}/${chainId}`;

  console.log(`CALL: ${callUrl}`);

  const response = await postUrl(callUrl);

  console.log(`RSP: ${response}`);

  // @ts-ignore
  let tokenIdName = "max";

  // 2. Create 6551 name
  // /register/:chainId/:tokenContract/:tokenId/:name/:signature 
  /*let registerMsg = `Registering your catId ${tokenId} name to ${tokenIdName}.${tokenName}`;
  const signature2 = await wallet.signMessage(registerMsg);
  console.log('Signature: ', signature2);
  let callUrl2 = `http://192.168.43.187:8083/register/${chainId}/${catsTokenAddr}/${tokenId}/${tokenIdName}.${tokenName}/${signature2}`;
  console.log(`CALL: ${callUrl2}`);
  const response2 = await postUrl(callUrl2);

  console.log(`RSP: ${response2}`);*/


  //now resolve Avatar
  /*let resolver = await provider.getResolver(`${tokenIdName}.${tokenName}`);

  let ethMainnetAddress = await resolver!!.getAddress();

  console.log(`ADDR: ${ethMainnetAddress}`);

  //resolve image
  let avatarUrl = await resolver!!.getAvatar();

  console.log(`AVATAR: ${JSON.stringify(avatarUrl)}`);*/


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
    } catch (error) {
      //break down the data
      const iface = new ethers.utils.Interface(returnAbi);
      const decoded = iface.decodeFunctionData('OffchainLookup', error.data);
      

      //format URL:
      const callUrl = decoded.urls[0].replace('{sender}', decoded.sender).replace('{data}', decoded.callData);

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


