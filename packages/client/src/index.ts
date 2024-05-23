import { Command } from 'commander';
import ethers from 'ethers';
//@ts-ignore
import fetch from 'node-fetch';
import dotenv from "dotenv";
import { toUtf8Bytes } from 'ethers/lib/utils';
import { concat } from 'ethers/lib/utils';
import { hexZeroPad } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';
// @ts-ignore
import { hexlify } from 'ethers/lib/utils';

dotenv.config();

function bytes32ify(value: number): string {
  return hexZeroPad(BigNumber.from(value).toHexString(), 32);
}

const { PRIVATE_KEY, INFURA_KEY } = process.env;

const program = new Command();
program
  .requiredOption('-r --registry <address>', 'ENS registry address', '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e') //0x4dBFD41eA7639eB5FbC95e4D2Ea63369e7Be143f <<-- resolver, registry is 0x283Af0B28c62C092C9727F1Ee09c02CA627EB7F5
  .option('-p --provider <url>', 'web3 provider URL', `https://mainnet.infura.io/v3/${INFURA_KEY}`) //https://ethereum-goerli.publicnode.com
  //.option('-p --provider <url>', 'web3 provider URL', `https://sepolia.infura.io/v3/${INFURA_KEY}`) //https://ethereum-goerli.publicnode.com
  .option('-i --chainId <chainId>', 'chainId', '1') //11155111 //1
  .option('-n --chainName <name>', 'chainName', 'mainnet') //Sepolia //mainnet
  .argument('<name>');

program.parse(process.argv);
const options = program.opts();
const ensAddress = options.registry;
const chainId = parseInt(options.chainId);
const chainIdMain = parseInt("1");
const chainName = options.chainName;
const provider = new ethers.providers.JsonRpcProvider(options.provider, {
  chainId,
  name: chainName,
  ensAddress,
});

const provider2 = new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/${INFURA_KEY}`, {
  chainId: chainIdMain,
  name: 'mainnet',
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
      return "API Call failed: " + error.message;
  }

  return "failed";
}

(async () => {
  // @ts-ignore
  const name = program.args[0];

  let pk: string = PRIVATE_KEY!;
  // @ts-ignore
  const wallet = new ethers.Wallet(pk);

<<<<<<< Updated upstream
=======
  let resolverM = await provider.getResolver(`thesmartcats.eth`);
  console.log(`Main Resolver: ${JSON.stringify(resolverM)} ${resolverM!!.address}`);

  // const namehash = ethers.utils.namehash(`xnft.eth`);
  //   const dnsEncode = ethers.utils.dnsEncode(`xnft.eth`);
  //   console.log(`DNS: ${dnsEncode} ${namehash}`);

    

  const resolverAddress = `0x6a844646443f29dF2Fd47F92E3520b61F3FC0754`;
  const namehash2 = ethers.utils.namehash(`thesmartcats.eth`);
  const dnsEncode = ethers.utils.dnsEncode(`thesmartcats.eth`);
  const funcEncode = "0x3b3b57de" + namehash2.substring(2);
  console.log(`DNS: ${dnsEncode}, ${funcEncode}`);  

  const catResolver = new ethers.Contract(resolverAddress, [
    'function resolve(bytes name, bytes data) view returns (bytes)',
    'function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns(bytes memory)'
  ], provider2);

  //call, get error
  try {
    const resolverTx = await catResolver.resolve(dnsEncode, funcEncode);
    console.log(resolverTx);
  } catch (error) {
    //break down the data
    const iface = new ethers.utils.Interface(returnAbi);
    // @ts-ignore
    const decoded = iface.decodeFunctionData('OffchainLookup', error.data);
    console.log(`Decoded: ${JSON.stringify(decoded)} ${decoded.urls[0]}`);
  }

>>>>>>> Stashed changes
  //let gatewayServer = "http://192.168.50.206";
  let gatewayServer = "http://44.217.178.162";
  // @ts-ignore
  let gatewayAddress = `${gatewayServer}:8080`;
  // @ts-ignore
  let registryAddress = `${gatewayServer}:8083`;

  // 1. Register token
  //register on xNFT (will be sepolia)
  //let tokenAddr = "0x4ffb1b3c2464644ba3436de3fc81a5d79cdf5760";
  // @ts-ignore
  let catsTokenAddr = "0xa04664f6191d9a65f5f48c6f9d6dd81cb636e65c";
<<<<<<< Updated upstream
=======
  //let catsTokenAddrSep = "0xa532D3c016aA0B44b7228aCcd701A5F03112CD22";
>>>>>>> Stashed changes
  // @ts-ignore
  let chainId = 11155111;
  // @ts-ignore
  let tokenId = 5;
  let tokenName = name;
  // @ts-ignore
  let tokenIdName = "garfield";

<<<<<<< Updated upstream
  const message = `Attempting to register domain ${tokenName} name to ${catsTokenAddr}`;
=======
  //const message = `Attempting to register domain ${tokenName} name to ${catsTokenAddr}`;
  //const message = `Attempting to register domain ${tokenName} name to ${catsTokenAddrSep} on chain ${chainId}`;
  /*const message = `Attempting to register domain ${tokenName} name to ${catsTokenAddrSep} on chain ${chainId}`;
>>>>>>> Stashed changes

  console.log(`MSG: ${message}`);

  const signature = await wallet.signMessage(message);
  console.log('Signature: ', signature);

<<<<<<< Updated upstream
  let callUrl = `${registryAddress}/registertoken/${chainId}/${catsTokenAddr}/${tokenName}/${signature}/${chainId}`;///${chainId}
=======
  let callUrl = `${registryAddress}/testregistertoken/${chainId}/${catsTokenAddrSep}/${tokenName}/${signature}/${chainId}`;///${chainId}
  //let callUrl = `${registryAddress}/registertoken/${chainId}/${catsTokenAddrSep}/thesmartcats.eth/${signature}/${chainId}`;///${chainId}
>>>>>>> Stashed changes

  console.log(`CALL: ${callUrl}`);

  const response = await postUrl(callUrl);

  console.log(`RSP: ${response}`);

<<<<<<< Updated upstream

  // @ts-ignore
  let tokenIdName = "max";
=======
  
>>>>>>> Stashed changes

  // 2. Create 6551 name
  // /register/:chainId/:tokenContract/:tokenId/:name/:signature 
  //Registering your tokenId 5 name to max.bob.xnft.eth
<<<<<<< Updated upstream
  let registerMsg = `Registering your tokenId ${tokenId} name to ${tokenIdName}.${tokenName}`;
=======
  /*let registerMsg = `Registering your tokenId ${tokenId} name to ${tokenIdName}.${tokenName} on chain ${chainId}`;
>>>>>>> Stashed changes
  const signature2 = await wallet.signMessage(registerMsg);
  console.log('Signature: ', signature2);
  let callUrl2 = `${registryAddress}/register/${chainId}/${tokenIdName}.${tokenName}/${tokenId}/${signature2}`;
  console.log(`CALL: ${callUrl2}`);
  const response2 = await postUrl(callUrl2);

  console.log(`RSP: ${response2}`);

  /*
  //Set storeage
  const formdata = new FormData();
  formdata.append("jipslo.jpg", fileInput.files[0], "/path/to/file");

  const requestOptions = {
    method: "POST",
    body: formdata,
    redirect: "follow"
  };

  fetch(`${registryAddress}/registercontent/11155111/${tokenIdName}.${tokenName}`, requestOptions)
    .then((response) => response.text())
    .then((result) => console.log(result))
    .catch((error) => console.error(error));
  */

    /*
    {"data":"0x000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000664d397700000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000408f6d9d6b07aa09fbfca3e5b21f5265bb35da89eca303a45c78c27eafc6369861a41518cc8ac30debf8d7c1fd6c4aec0ee2eee3f1eb24a8e6004fbf5017bf68c2"}
    */

    let resolver = await provider.getResolver(`${tokenIdName}.${tokenName}`);
  console.log(`Resolver: ${JSON.stringify(resolver)}`);

  let ethMainnetAddress = await resolver!!.getAddress();

  console.log(`ADDR: ${ethMainnetAddress}`);

  //resolve image
  let avatarUrl = await resolver!!.getAvatar();
  console.log(`AVATAR: ${avatarUrl} ${JSON.stringify(avatarUrl)}`);

  console.log(`AVATAR: ${JSON.stringify(avatarUrl)}`);

  let addr = await resolve(`${tokenIdName}.${tokenName}`, resolver!!.address);
  console.log(`ADDR: ${addr}`);

  //first try setting text of existing upload
  let ipfsHash = "QmSej6ZLpoa44CmAwHfkpXG1MKqGuwQAvem63sQR3iE89g";
  let registerMsg3 = `Attempting to update storage to domain ${tokenIdName}.${tokenName} on ${chainId} with hash ${ipfsHash}`;
  //Attempting to update storage to domain max.bob.xnft.eth on 11155111 with hash QmSej6ZLpoa44CmAwHfkpXG1MKqGuwQAvem63sQR3iE89g
  console.log(`${registerMsg3}`);
  console.log("Attempting to update storage to domain max.bob.xnft.eth on 11155111 with hash QmSej6ZLpoa44CmAwHfkpXG1MKqGuwQAvem63sQR3iE89g");

  const signature3 = await wallet.signMessage(registerMsg3);
  console.log('Signature: ', signature3);
  let callUrl3 = `${registryAddress}/registercontent/${chainId}/${tokenIdName}.${tokenName}/${signature3}/${ipfsHash}`;
  console.log(`CALL: ${callUrl3}`);
  const response3 = await postUrl(callUrl3);
  console.log(`IPFS Set: ${response3}`);

  let key = "Twitter";
  let text = "@frodo";

  var registerMsg4 = `Attempting to update ${tokenIdName}.${tokenName} ${key} to value ${text} on ${chainId}`;
  //Attempting to update storage to domain max.bob.xnft.eth on 11155111 with hash QmSej6ZLpoa44CmAwHfkpXG1MKqGuwQAvem63sQR3iE89g
  console.log(`${registerMsg4}`);
  //console.log("Attempting to update storage to domain max.bob.xnft.eth on 11155111 with hash QmSej6ZLpoa44CmAwHfkpXG1MKqGuwQAvem63sQR3iE89g");

  const signature4 = await wallet.signMessage(registerMsg4);
  console.log('Signature: ', signature4);
  let callUrl4 = `${registryAddress}/registertext/${chainId}/${tokenIdName}.${tokenName}/${key}/${text}/${signature4}`;
  console.log(`CALL: ${callUrl4}`);
  const response4 = await postUrl(callUrl4);
  console.log(`IPFS Set: ${response4}`);

  //now resolve Avatar
<<<<<<< Updated upstream
  let resolver = await provider.getResolver(`${tokenIdName}.${tokenName}`);

=======
  //let resolver = await provider.getResolver(`${tokenIdName}.${tokenName}`);
>>>>>>> Stashed changes
  //console.log(`Resolver: ${JSON.stringify(resolver)}`);

  //let ethMainnetAddress = await resolver!!.getAddress();

  console.log(`ADDR: ${ethMainnetAddress}`);

  //resolve image
  //let avatarUrl = await resolver!!.getAvatar();
  console.log(`AVATAR: ${avatarUrl} ${JSON.stringify(avatarUrl)}`);

  //read contenthash text
  let contextHashText = await resolver!!.getContentHash();
  console.log(`CONTENT: ${contextHashText}`);

  let twitterText = await resolver!!.getText(key);
  console.log(`${key}: ${twitterText}`);




  //let avatarURL2 = await resolveAvatar(`${tokenIdName}.${tokenName}`, resolver!!.address);
  //console.log(`AVATAR2: ${avatarURL2}`);

  /*let key = "avatar";

  //const avatar = await getText("avatar");
  let keyBytes = toUtf8Bytes(key);
  // The nodehash consumes the first slot, so the string pointer targets
  // offset 64, with the length at offset 64 and data starting at offset 96
  keyBytes = concat([ bytes32ify(64), bytes32ify(keyBytes.length), keyBytes ]);
  
  // Pad to word-size (32 bytes)
  if ((keyBytes.length % 32) !== 0) {
    keyBytes = concat([ keyBytes, hexZeroPad("0x", 32 - (key.length % 32)) ])
  }

  const funcEncode = "0x59d1d43c" + hexlify(keyBytes);
  //await this._fetchBytes("0x59d1d43c", hexlify(keyBytes));


*/
  

  //console.log(`AVATAR: ${JSON.stringify(avatarUrl)}`);

  //let addr = await resolve(`${tokenIdName}.${tokenName}`, resolver!!.address);
  //console.log(`ADDR: ${addr}`);


  // @ts-ignore
  async function resolve(name: string, resolverAddress: string): Promise<string> {
    const namehash = ethers.utils.namehash(name);
    const dnsEncode = ethers.utils.dnsEncode(name);
    const funcEncode = "0x3b3b57de" + namehash.substring(2);

    console.log(`DNS: ${dnsEncode}, ${funcEncode}`);

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

      /*
      https://ens-gate.main.smartlayer.network/{sender}/{data}.json
      ["0x6a844646443f29dF2Fd47F92E3520b61F3FC0754"]
      0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
      */

      //0x000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000664c47f800000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040dc513639673d3fe5de6f2e017afc30445ed405ab83c79abcff8e4492c9b6eef0d072089a7409be6b86d47125399ea297fae359d14e75b54d660c17355c1aa8e4
      //0x00000000000000000000000000000000000000000000000000000000000000400000000000000000000000006a844646443f29df2fd47f92e3520b61f3fc075400000000000000000000000000000000000000000000000000000000000000e49061b92300000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000001b086761726669656c640c746865736d617274636174730365746800000000000000000000000000000000000000000000000000000000000000000000000000243b3b57de72a398cc5f361dbf052bd2f09ac6db3b6ea132226e15a223e405a867cf5e3abd0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
      

      //format URL:
      const callUrl = decoded.urls[0].replace('{sender}', decoded.sender).replace('{data}', decoded.callData);

      console.log(`CALLURL: ${callUrl}`);

      try {
        const response = await fetch(callUrl);

        if (response.ok) {
          const data = await response.json();

          //response1
          const proofResponse = data.data;
          const extraData = decoded.extraData;

          console.log(`Proof Response: ${proofResponse}`);
          console.log(`Extra: ${extraData}`);
          //now call proof
          const proofReturn = await catResolver.resolveWithProof(proofResponse, extraData);
          console.log(`Proof Return: ${proofReturn}`);

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


  // @ts-ignore
  async function resolveAvatar(name: string, resolverAddress: string): Promise<string> {
    //const namehash = ethers.utils.namehash(name);
    const dnsEncode = ethers.utils.dnsEncode(name);
    //const funcEncode = "0x3b3b57de" + namehash.substring(2);
    let key = "avatar";

  //const avatar = await getText("avatar");
  let keyBytes: any = toUtf8Bytes(key);
  // The nodehash consumes the first slot, so the string pointer targets
  // offset 64, with the length at offset 64 and data starting at offset 96
  keyBytes = concat([ bytes32ify(64), bytes32ify(keyBytes.length), keyBytes ]);

  console.log(`Key: ${keyBytes}`);
  
  // Pad to word-size (32 bytes)
  if ((keyBytes.length % 32) !== 0) {
    keyBytes = concat([ keyBytes, hexZeroPad("0x", 32 - (key.length % 32)) ])
  }

  //const funcEncode = "0x59d1d43c" + hexlify(keyBytes);

  //const hexStuff = hexlify(keyBytes);
  //const hexStuff2 = `0x59d1d43c${hexStuff.substring(2)}`;
  const hexStuff2 = `0x59d1d43c1902719f7622c32aa80f59d72a08c308a18172b858ba651607c149ce04cb0190000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000066176617461720000000000000000000000000000000000000000000000000000`;

  console.log(`Hex Stuff: ${hexStuff2}`);

  const funcEncode = hexStuff2;

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
      console.log(callUrl);

      try {
        const response = await fetch(callUrl);

        console.log(response);

        if (response.ok) {
          const data = await response.json();

          //response1
          const proofResponse = data.data;
          const extraData = decoded.extraData;

          //now call proof
          const proofReturn = await catResolver.resolveWithProof(proofResponse, extraData);
          console.log("" + proofReturn);

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


