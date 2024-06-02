const { ethers } = require("hardhat");
const { createWalletsAndAddresses, ethersDebugMessages } = require('./inc/libGoerli');
const { INFURA_KEY } = process.env;

let gatewayServer = "http://44.217.178.162";    
let gatewayAddress = `${gatewayServer}:8080`;
const registryAddress = `${gatewayServer}:8083`;

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
  
  //@ts-ignore
  const decodeCoin = [
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "node",
          "type": "bytes32"
        },
        {
          "internalType": "uint256",
          "name": "coinType",
          "type": "uint256"
        }
      ],
      "name": "addr",
      "outputs": [
        {
          "internalType": "bytes",
          "name": "",
          "type": "bytes"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ];
  
  // @ts-ignore
  async function postUrl(url) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(""),
      });
  
      if (!response.ok) {
        let errorResp = await response.json();
        throw new Error(`${errorResp.fail}`);
      }
  
      const responseData = await response.json();
      console.log('Response:', responseData);
      return JSON.stringify(responseData);
    } catch (error) {
      // @ts-ignore
      return `API Call failed: ${error.message}`;
    }
  }

  async function registerNFT(name, tokenName, chainId, tokenAddress, tokenId, wallet) {

    const registerMsg = `Attempting to register NFT ${name}.${tokenName} name to ${tokenAddress} ${tokenId} on chain ${chainId}`;
    const signature = await wallet.signMessage(registerMsg);
    console.log('Signature: ', signature);
    let callUrl = `${registryAddress}/registerNFT/${chainId}/${tokenAddress}/${name}.${tokenName}/${tokenId}/${signature}`;
    console.log(`${registerMsg}`);
    console.log(`${callUrl}`);
    const response = await postUrl(callUrl);

    return response;
  }

async function registerTokenContract(name, chainId, tokenAddress, wallet) {

    const message = `Attempting to register domain ${name} name to ${tokenAddress} on chain ${chainId}`;
    console.log(`MSG: ${message}`);

    const signature = await wallet.signMessage(message);
    console.log('Signature: ', signature);
    let callUrl = `${registryAddress}/registertoken/${chainId}/${tokenAddress}/${name}/${signature}/${chainId}`;///${chainId}

    console.log(`CALL: ${callUrl}`);

    const response = await postUrl(callUrl);

    console.log(`RSP: ${response}`);

    return response; //text
}

async function registerToken(name, baseName, chainId, tokenId, wallet) {

    // /register/:chainId/:tokenContract/:tokenId/:name/:signature 
    let registerMsg = `Registering your tokenId ${tokenId} name to ${name}.${baseName} on chain ${chainId}`;
    const signature = await wallet.signMessage(registerMsg);
    console.log('Signature: ', signature);
    let callUrl = `${registryAddress}/register/${chainId}/${name}.${baseName}/${tokenId}/${signature}`;
    console.log(`CALL: ${callUrl}`);
    const response = await postUrl(callUrl);

    console.log(`RSP: ${response}`);

    return response; //text
}

(async ()=>{
    const {
        mainDeployKey,
        goerliKey,
        a20Key
    } = await createWalletsAndAddresses(ethers.provider);

    console.log("Deploy key: " + mainDeployKey.address);
    console.log("Sepolia key: " + goerliKey.address);
    console.log("A20 key: " + a20Key.address);

    
    // @ts-ignore
    
  
    //await handleTokenRegistration(gatewayServer);
  
    // 1. Register token
    //register on xNFT (will be sepolia)
    //let tokenAddr = "0x4ffb1b3c2464644ba3436de3fc81a5d79cdf5760";
    // @ts-ignore
    let catsTokenAddr = "0xa04664f6191d9a65f5f48c6f9d6dd81cb636e65c";
    // @ts-ignore
    let catsTokenAddrSep = "0xa532D3c016aA0B44b7228aCcd701A5F03112CD22";
    let ownedTokenSep = "0x8a39ddcac3b081c4ea14ee4e78e7c7ab452c598c";

    const { chainId } = await ethers.provider.getNetwork();
    const ensAddress = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

    const provider = new ethers.providers.JsonRpcProvider(`https://sepolia.infura.io/v3/${INFURA_KEY}`, {
        chainId,
        name: 'sepolia',
        ensAddress,
    });

    let tokenId = 9;
    let tokenId2 = 10;
    let tokenId3 = 39;
    let tokenId4 = 40;

    let unownedTokenId = 1;
    let tokenName = "xnft.eth";
    // @ts-ignore
    let tokenIdName = "garfield";
    let tokenIdName2 = "bill";
    let tokenIdName3 = "hadron";

    const mainnetENSRegistry = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"; //same as on goerli

    const goerliResolver = "0x763fD665d7081404c6BfEC5837A4E90c423eE522";

    const sepoliaResolver = "0x7feaBb1a5597726662F480df407b4E9E81C91e28";
    const sepoliaResolver2 = "0x155454A5d3252D5bEDc6F4C84177c669E420Ca4D";

    const sepA20Contract = "0x3f49c2ffa6ed55d4a97a2871899aedbbacf5cd5c";

    //resolver contract

    const prodUrl = "https://ens-gate.main.smartlayer.network/{sender}/{data}.json";
    const testUri = "https://ens-gate.test.smartlayer.network/{sender}/{data}.json";
    const localTestUri = "http://44.217.178.162:8082/{sender}/{data}.json";//44.217.178.162
    const pcTestUri = "http://192.168.50.206:8080/{sender}/{data}.json";

    const spaceCoTest = "http://10.191.8.133:8080/{sender}/{data}.json"; 

    const signerProd = "0x9c4171b69E5659647556E81007EF941f9B042b1a";
    const signerTest = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const localSigner = "0xC9A39015CB7c64c743815E55789ab63A321FB249";
    const gatewayPrivate = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

    const smartcatNode = ethers.utils.namehash('smartcat.eth');
    const thesmartcatsNode = ethers.utils.namehash('thesmartcats.eth');
    const xnftNode = ethers.utils.namehash('xnft.eth');

    const Registry = await ethers.getContractFactory('ENSRegistry');
    let registry = await Registry.attach(mainnetENSRegistry);
    let regAddr = String(registry.address);
    console.log(`Addr Registry : ${regAddr}`);

    const CustomResolver2 = await ethers.getContractFactory("OffchainResolver");
    let customResolver = await CustomResolver2.attach(sepoliaResolver2); 

    let newUrl = await customResolver.connect(goerliKey).url();
    console.log("URL: " + newUrl);

    //register token contract
    let rsp = await registerTokenContract(tokenName, chainId, catsTokenAddrSep, a20Key);
    console.log(`Token Contract Register response: ${rsp}`);

    //register individual token
    rsp = await registerToken(tokenIdName, tokenName, chainId, tokenId, a20Key);
    console.log(`Token Register response: ${rsp}`);

    //now attempt to resolve the token address & avatar
    let resolver = await provider.getResolver(`${tokenIdName}.${tokenName}`);

    let ethMainnetAddress = "0x0000000000000000000000000000000000000000";

    try {
        ethMainnetAddress = await resolver.getAddress();
        console.log(`ADDR: ${ethMainnetAddress}`);
    } catch (error) {
        console.log(`Error: ${error}`);
    }

    try {
        let avatarUrl = await resolver.getAvatar();
        console.log(`AVATAR: ${avatarUrl.url}`);
    } catch (error) {
        console.log(`Error: ${error} Unable to resolve avatar`);
    }

    //register individual token again, different name
    rsp = await registerToken("bill", tokenName, chainId, tokenId, a20Key);
    console.log(`Token Register response: ${rsp}`);

    //now attempt to register an NFT with different name but same tokenId 
    rsp = await registerNFT(tokenIdName3, tokenName, chainId, catsTokenAddrSep, tokenId, a20Key);
    console.log(`NFT Register response: ${rsp}`);

    //attempt to register an NFT
    rsp = await registerNFT(tokenIdName3, tokenName, chainId, catsTokenAddrSep, tokenId2, a20Key);
    console.log(`NFT Register response: ${rsp}`);

    //resolve 
    resolver = await provider.getResolver(`${tokenIdName3}.${tokenName}`);
    try {
        ethMainnetAddress = await resolver.getAddress();
        console.log(`ADDR: ${ethMainnetAddress}`);
    } catch (error) {
        console.log(`Error: ${error}`);
    }

    //now attmept to register a token contract to a domain name that's already taken
    rsp = await registerTokenContract(`${tokenIdName}.${tokenName}`, chainId, ownedTokenSep, a20Key);
    console.log(`NFT Register response: ${rsp}`);

})();
// npx hardhat run scripts/test-sep.js --network sepolia